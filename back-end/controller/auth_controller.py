"""Authentication routes - FastAPI Router.

Firebase session-cookie authentication
--------------------------------------
The web client obtains a Firebase ID token (via Firebase Auth on the
frontend) and POSTs it to ``/set_authenticated_user_session``. The
backend exchanges the ID token for a stateless session cookie (valid
up to ``SESSION_EXPIRE_SECONDS``, max 24h per Firebase policy) and sets
it ``HttpOnly``. Subsequent requests authenticate via
:func:`dependencies.get_current_user`, which calls
``auth.verify_session_cookie(check_revoked=True)``.

CSRF
----
All state-mutating endpoints are guarded by :func:`verify_csrf_token`,
which compares the ``csrf_token`` cookie value against the
``x-csrf-token`` header (double-submit pattern). The CSRF token is
issued by ``/firebase-config-and-csrf-token`` alongside the Firebase
web config.

Logout
------
``/logout_authenticated_user_session`` revokes all Firebase refresh
tokens for the user (FIX [H17]) BEFORE clearing Redis session state and
deleting the cookie. Without the revoke call a stolen cookie remained
valid for up to 24h after the victim logged out.
"""

import logging
import secrets
from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.concurrency import run_in_threadpool
from firebase_admin import auth
from pydantic import Field

from api_contract.common import ExternalRequestModel
from config import get_config
from core.errors import PublicError, log_safe_exception
from dependencies import (
    clear_session_state,
    get_current_user_optional,
    get_session_data,
    replace_session_data_for_cookie,
    verify_csrf_token,
)

Config = get_config()
router = APIRouter(tags=["Authentication & Authorization"])
logger = logging.getLogger(__name__)

_AUTH_TOKEN_VERIFICATION_ERROR = PublicError(
    "AUTH_TOKEN_VERIFICATION_FAILED",
    "Authentication token verification failed.",
)
_AUTH_REVOCATION_ERROR = PublicError("AUTH_REVOCATION_FAILED", "Authentication revocation failed.")
_FIREBASE_CONFIG_ERROR = PublicError("FIREBASE_CONFIG_FAILED", "Firebase configuration failed.")

# ENH [RL-HTTP]: Layer 1 IP-level guard for auth endpoints.
# Login/session endpoints are prime DDoS targets — strict per-IP limits.
from controller.rate_limiter import limiter


class SetSessionRequest(ExternalRequestModel):
    """Request body for /set_authenticated_user_session."""

    idToken: str = Field(..., min_length=1, max_length=Config.FIREBASE_ID_TOKEN_MAX_LENGTH)


def generate_and_set_csrf_cookie(response: Response) -> str:
    """Generate a secure CSRF token and set it as a non-HttpOnly cookie on the response.

    Args:
        response: The outgoing FastAPI ``Response`` whose cookie jar will carry the token.

    Returns:
        The generated CSRF token string (also written to the response cookie).
    """
    token = secrets.token_urlsafe(32)
    response.set_cookie(
        key=Config.CSRF_COOKIE_NAME,
        value=token,
        httponly=False,
        secure=Config.SESSION_COOKIE_SECURE,
        samesite=Config.SESSION_COOKIE_SAMESITE,
        max_age=Config.SESSION_EXPIRE_SECONDS,
        path="/",
    )
    return token


def _delete_cookie(response: Response, name: str, *, httponly: bool) -> None:
    """Delete a cookie from the response by overwriting it with an expired, empty value.

    Args:
        response: The outgoing FastAPI ``Response`` to mutate.
        name: The name of the cookie to clear.
        httponly: Whether the original cookie was HttpOnly (must match for browsers to honor the deletion).
    """
    response.delete_cookie(
        key=name,
        path="/",
        secure=Config.SESSION_COOKIE_SECURE,
        httponly=httponly,
        samesite=Config.SESSION_COOKIE_SAMESITE,
    )


@router.post("/set_authenticated_user_session")
# ENH [RL-HTTP]: Strict 10/min per IP on login — prevents credential stuffing.
@limiter.limit("10 per minute")
async def set_authenticated_user_session(request: Request, response: Response, data: SetSessionRequest):
    """
    Verify a Firebase ID token and establish a secure session cookie for the authenticated user.
    """
    verify_csrf_token(request)

    try:
        decoded_token = await run_in_threadpool(
            auth.verify_id_token,
            data.idToken,
            check_revoked=Config.FIREBASE_SESSION_CHECK_REVOKED,
        )
        expires_in = timedelta(seconds=Config.SESSION_EXPIRE_SECONDS)
        session_cookie = await run_in_threadpool(
            auth.create_session_cookie,
            data.idToken,
            expires_in=expires_in,
        )

        existing_user = await get_current_user_optional(request)
        existing_state = {}
        if existing_user and existing_user.get("uid") == decoded_token["uid"]:
            existing_state = await get_session_data(request) or {}

        response.set_cookie(
            key=Config.SESSION_COOKIE_NAME,
            value=session_cookie,
            httponly=Config.SESSION_COOKIE_HTTPONLY,
            secure=Config.SESSION_COOKIE_SECURE,
            samesite=Config.SESSION_COOKIE_SAMESITE,
            max_age=Config.SESSION_EXPIRE_SECONDS,
            path="/",
        )

        user_data = {
            "uid": decoded_token["uid"],
            "email": decoded_token.get("email"),
            "name": decoded_token.get("name"),
            "picture": decoded_token.get("picture"),
            "verified": bool(decoded_token.get("email_verified", True)),
        }
        request.state.user = user_data

        if existing_state:
            await replace_session_data_for_cookie(session_cookie, existing_state)

        logger.info("Firebase session established")
        return {"status": "success", "user": user_data}

    except HTTPException:
        raise
    except Exception as e:
        log_safe_exception(logger, "verify_firebase_id_token", e, _AUTH_TOKEN_VERIFICATION_ERROR)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


@router.get("/check_authenticated_user_session")
async def check_authenticated_user_session(request: Request):
    """
    Validate whether the client request contains a valid, active session cookie.
    If authenticated, returns status and user profile data.
    """
    user = await get_current_user_optional(request)
    if user:
        return {"status": "session_active", "user": user}
    return {"status": "no_session"}


@router.post("/logout_authenticated_user_session")
async def logout_authenticated_user_session(request: Request, response: Response):
    """
    Terminate the active session.

    Revokes all Firebase refresh tokens for the authenticated user (FIX [H17]),
    clears the Redis-backed application state (e.g. DB connection persistence),
    and deletes the session cookie from the client.

    Revocation matters because Firebase session cookies are stateless JWTs
    valid until their ``exp`` claim (up to 24h). Without calling
    ``auth.revoke_refresh_tokens(uid)``,
    ``verify_session_cookie(check_revoked=True)`` cannot detect that the user
    has logged out — a stolen cookie would remain usable until natural expiry.

    The revoke call is best-effort: if Firebase Admin is unavailable at
    logout time, the cookie is still cleared client-side and the Redis state
    is wiped, so the only residual risk is the (stolen) cookie remaining
    valid until natural expiry. A brief warning is logged so operators can
    spot a Firebase outage.
    """
    verify_csrf_token(request)

    # FIX [H17]: Revoke Firebase refresh tokens BEFORE clearing state, so
    # verify_session_cookie(check_revoked=True) returns revoked=true on any
    # subsequent request with the (now invalid) cookie. This is the only
    # server-side signal Firebase offers for session-cookie invalidation.
    user = await get_current_user_optional(request)
    if user and user.get("uid"):
        try:
            await run_in_threadpool(auth.revoke_refresh_tokens, user["uid"])
        except Exception as exc:
            log_safe_exception(logger, "revoke_firebase_refresh_tokens", exc, _AUTH_REVOCATION_ERROR)

    await clear_session_state(request)

    _delete_cookie(response, Config.SESSION_COOKIE_NAME, httponly=True)

    logger.debug("User session cleared on /logout_authenticated_user_session")
    return {"status": "success", "message": "Logged out successfully"}


@router.get("/firebase-config-and-csrf-token")
async def get_firebase_config_and_csrf_token(response: Response):
    """Serve Firebase web client configuration and issue a CSRF token."""
    try:
        config = Config.get_firebase_web_config()
        csrf_token = generate_and_set_csrf_cookie(response)
        return {"status": "success", "config": config, "csrfToken": csrf_token}
    except Exception as e:
        log_safe_exception(logger, "get_firebase_config", e, _FIREBASE_CONFIG_ERROR)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve Firebase configuration",
        )
