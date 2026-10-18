"""
FastAPI dependencies for authentication and per-session application state.

Authentication
--------------
Authentication is backed by **Firebase Admin session cookies**. The web
client exchanges a Firebase ID token for a stateless session cookie
(valid up to 24h) via ``/set_authenticated_user_session``.
:func:`get_current_user` verifies that cookie on every protected request
using ``auth.verify_session_cookie(check_revoked=True)``.

Dev bypass
----------
In development, ``Config.DEV_AUTH_BYPASS=True`` lets callers without a
session cookie authenticate as the dev user. FIX [M17] restricts the
bypass to ONLY the no-cookie case: if a cookie was presented but
Firebase raised an infrastructure error (network, backend down,
malformed), the request fails with 503 instead of silently dev-authing.
Only the typed Firebase auth exceptions (``ExpiredSessionCookieError``,
``InvalidSessionCookieError``, ``RevokedSessionCookieError``) fall
through to a 401 / dev-bypass — those indicate the cookie itself is bad,
not that the auth backend is broken.

DB-config lifecycle
-------------------
``get_authenticated_db_config`` authenticates the Firebase session before
the private cached-state reader loads per-session DB connection metadata
from Redis. The reader applies a configurable persistence policy: if the
client closed the tab (no recent ``session_active_at`` heartbeat) and the
user opted into ``connectionPersistenceMinutes``, the cached pool connection
is kept alive for that long; otherwise it is disconnected eagerly.
"""

from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.concurrency import run_in_threadpool
from firebase_admin import auth
from firebase_admin.auth import (
    ExpiredSessionCookieError,
    InvalidSessionCookieError,
    RevokedSessionCookieError,
)

from config import get_config
from core.account_activity import track_account_request
from core.admin_authorization import get_admin_authorization_decision
from core.errors import PublicError, log_safe_exception

logger = logging.getLogger(__name__)
Config = get_config()

_SESSION_STATE_UPDATE_ERROR = PublicError("SESSION_STATE_UPDATE_FAILED", "Session state update failed.")
_SESSION_STATE_READ_ERROR = PublicError("SESSION_STATE_READ_FAILED", "Session state read failed.")
_DB_CONFIG_EXPIRY_ERROR = PublicError("DB_CONFIG_EXPIRY_FAILED", "Database configuration expiry failed.")
_AUTH_SESSION_INVALID_ERROR = PublicError("AUTH_SESSION_INVALID", "Authentication session is invalid.")
_AUTH_VERIFICATION_ERROR = PublicError("AUTH_VERIFICATION_FAILED", "Authentication verification failed.")

_memory_state: dict[str, tuple[dict, float]] = {}
_memory_state_lock = threading.RLock()


async def get_redis():
    """Return the active Redis client from application state (or None in dev)."""
    from service.redis_service import get_redis_client

    return get_redis_client()


def _state_key_from_cookie(request: Request) -> Optional[str]:
    """Derive the per-session Redis state key from the request's session cookie."""
    session_cookie = request.cookies.get(Config.SESSION_COOKIE_NAME)
    if not session_cookie:
        return None

    return state_key_from_session_cookie(session_cookie)


def state_key_from_session_cookie(session_cookie: str) -> str:
    """Return the deterministic ``session_state:<sha256>`` key for a Firebase session cookie."""
    digest = hashlib.sha256(session_cookie.encode("utf-8")).hexdigest()
    return f"session_state:{digest}"


def _user_from_decoded_session(decoded: dict) -> dict:
    """Project a decoded Firebase session cookie into the internal user payload dict."""
    return {
        "uid": decoded["uid"],
        "email": decoded.get("email"),
        "name": decoded.get("name"),
        "picture": decoded.get("picture"),
        "verified": bool(decoded.get("email_verified", True)),
    }


def verify_session_cookie_value(session_cookie: str) -> dict:
    """Verify a Firebase session cookie and return the app user payload.

    Protected sessions always check revocation. Disabling this lookup would
    allow a still-signed cookie to outlive a disabled or deleted identity.

    Args:
        session_cookie: The Firebase session cookie string from the request jar.

    Returns:
        User dict with uid, email, name, picture, verified flag.
    """
    decoded = auth.verify_session_cookie(
        session_cookie,
        check_revoked=True,
    )
    return _user_from_decoded_session(decoded)


def verify_csrf_token(request: Request) -> None:
    """Validate the double-submit CSRF token for state-mutating requests.

    Compares the CSRF token stored in the client's cookie with the token sent in the
    request headers. The double-submit pattern works because an attacker on a third-party
    origin cannot read the user's ``csrf_token`` cookie (it's not ``HttpOnly`` but it IS
    ``SameSite=lax``) and therefore cannot forge a matching header value.

    Args:
        request: The incoming FastAPI request.

    Raises:
        HTTPException: 403 Forbidden if the cookie/header tokens are missing or mismatched.
    """
    cookie_token = request.cookies.get(Config.CSRF_COOKIE_NAME)
    header_token = request.headers.get(Config.CSRF_HEADER_NAME)

    if not cookie_token or not header_token or cookie_token != header_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid CSRF token",
        )


async def _read_state(key: str) -> Optional[dict]:
    """Read per-session state from Redis (or in-memory fallback)."""
    redis_client = await get_redis()
    if redis_client:
        raw = await redis_client.get(key)
        return json.loads(raw) if raw else None

    with _memory_state_lock:
        record = _memory_state.get(key)
        if not record:
            return None

        data, expires_at = record
        if expires_at <= time.time():
            _memory_state.pop(key, None)
            return None
        return dict(data)


async def _write_state(key: str, data: dict, expire_seconds: int) -> None:
    """Write per-session state to Redis (or in-memory fallback) with a TTL."""
    redis_client = await get_redis()
    if redis_client:
        await redis_client.set(key, json.dumps(data), ex=expire_seconds)
        return

    with _memory_state_lock:
        _memory_state[key] = (dict(data), time.time() + expire_seconds)


_ATOMIC_MERGE_LUA = """
local raw_current = redis.call("GET", KEYS[1])
local current = {}

if raw_current then
    if string.match(raw_current, "^%s*(.)") ~= "{" then
        return redis.error_reply("session state must be a JSON object")
    end
    local current_ok, decoded_current = pcall(cjson.decode, raw_current)
    if not current_ok or type(decoded_current) ~= "table" then
        return redis.error_reply("session state must be a JSON object")
    end
    current = decoded_current
end

if string.match(ARGV[1], "^%s*(.)") ~= "{" then
    return redis.error_reply("session updates must be a JSON object")
end
local updates_ok, updates = pcall(cjson.decode, ARGV[1])
if not updates_ok or type(updates) ~= "table" then
    return redis.error_reply("session updates must be a JSON object")
end

local ttl = tonumber(ARGV[2])
if not ttl or ttl <= 0 then
    return redis.error_reply("session TTL must be positive")
end

for field, value in pairs(updates) do
    current[field] = value
end

local merged = cjson.encode(current)
redis.call("SET", KEYS[1], merged, "EX", ttl)
return merged
"""


async def _merge_state(key: str, updates: dict, expire_seconds: int) -> dict:
    """Atomically merge top-level session fields and refresh the state TTL."""
    if expire_seconds <= 0:
        raise ValueError("Session state TTL must be positive")
    if not isinstance(updates, dict):
        raise ValueError("Session state updates must be a JSON object")

    redis_client = await get_redis()
    if redis_client:
        try:
            raw = await redis_client.eval(
                _ATOMIC_MERGE_LUA,
                1,
                key,
                json.dumps(updates, separators=(",", ":")),
                expire_seconds,
            )
            merged = json.loads(raw)
            if not isinstance(merged, dict):
                raise ValueError("Redis session merge returned a non-object")
            return merged
        except Exception as exc:
            log_safe_exception(logger, "merge_session_state", exc, _SESSION_STATE_UPDATE_ERROR)
            raise RuntimeError("Atomic Redis session update failed") from exc

    with _memory_state_lock:
        record = _memory_state.get(key)
        current: dict = {}
        now = time.time()
        if record:
            data, expires_at = record
            if expires_at > now:
                current = dict(data)
        current.update(updates)
        _memory_state[key] = (current, now + expire_seconds)
        return dict(current)


async def _delete_state(key: str) -> None:
    """Delete per-session state from Redis (or in-memory fallback)."""
    redis_client = await get_redis()
    if redis_client:
        await redis_client.delete(key)
        return

    with _memory_state_lock:
        _memory_state.pop(key, None)


async def get_session_data(request: Request) -> Optional[dict]:
    """Return per-Firebase-session application state (not an auth source).

    Authentication is always verified from the Firebase session cookie by
    :func:`get_current_user`. This function only reads per-session application state
    (db_config, settings, heartbeat timestamps) keyed by the cookie's SHA-256.
    """
    key = _state_key_from_cookie(request)
    if not key:
        return None

    try:
        return await _read_state(key)
    except Exception as e:
        log_safe_exception(logger, "read_session_state", e, _SESSION_STATE_READ_ERROR)
        return None


def _get_connection_persistence_minutes(session_data: dict) -> Optional[int]:
    """Return the user's connection-persistence window (minutes) or None if unset/invalid."""
    value = session_data.get("connectionPersistenceMinutes")
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


async def _expire_db_config(request: Request, db_config: dict, reason: str) -> None:
    """Disconnect the cached DB pool and clear db_config from session state.

    Args:
        request: The inbound request (used to derive the session key).
        db_config: The cached connection config to disconnect.
        reason: Short label for why the config is being expired (used in logs).
    """
    try:
        user = getattr(request.state, "user", None)
        user_id = user.get("uid") if isinstance(user, dict) else None
    except Exception:
        user_id = None

    try:
        from service.database.database_service import DatabaseService

        await run_in_threadpool(DatabaseService.disconnect, db_config, user_id)
    except Exception as e:
        log_safe_exception(logger, "disconnect_expired_db_config", e, _DB_CONFIG_EXPIRY_ERROR)

    try:
        await update_session_data(
            request,
            {
                "db_config": None,
                "db_config_last_used_at": None,
                "db_config_last_closed_at": None,
            },
        )
    except Exception as e:
        log_safe_exception(logger, "clear_expired_db_config", e, _DB_CONFIG_EXPIRY_ERROR)


async def get_current_user(request: Request) -> dict:
    """Authenticate the request via Firebase Admin session cookie.

    Args:
        request: The incoming FastAPI request.

    Returns:
        User dict with uid, email, name, picture, verified flag.

    Raises:
        HTTPException 401: No cookie present (or the cookie is expired/invalid/revoked)
            and dev-bypass is disabled.
        HTTPException 503: A cookie IS present but Firebase raised an infrastructure
            error (network, backend down, malformed JWT). FIX [M17] prevents a Firebase
            outage from silently authenticating callers as the dev user.
    """
    session_cookie = request.cookies.get(Config.SESSION_COOKIE_NAME)
    if session_cookie:
        try:
            user = await run_in_threadpool(verify_session_cookie_value, session_cookie)
            await track_account_request(
                request,
                user["uid"],
                allow_pending=request.method == "DELETE" and request.url.path == "/api/v1/user/account",
            )
            request.state.user = user
            logger.debug("Firebase session authenticated")
            return user
        except HTTPException:
            raise
        except (
            ExpiredSessionCookieError,
            InvalidSessionCookieError,
            RevokedSessionCookieError,
        ) as e:
            # FIX [M17]: These typed exceptions indicate the cookie itself is
            # bad (expired, malformed, or revoked). They are safe to fall
            # through to the 401 / dev-bypass path below.
            log_safe_exception(logger, "verify_firebase_session", e, _AUTH_SESSION_INVALID_ERROR)
        except Exception as e:
            # FIX [M17]: Any OTHER exception (network error, Firebase backend
            # down, malformed internal state) means the auth service itself is
            # unhealthy. We must NOT silently dev-auth the request — that
            # would grant full dev-user access to every unauthenticated
            # request during a Firebase outage. Surface a 503 so the operator
            # sees the outage and the client can retry.
            log_safe_exception(logger, "verify_firebase_session", e, _AUTH_VERIFICATION_ERROR)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Auth service temporarily unavailable",
            )

    # FIX [M17]: Only fall through to dev bypass when NO cookie was
    # presented. A presented-but-invalid cookie must NOT be silently
    # replaced with the dev identity.
    if Config.DEBUG and Config.DEV_AUTH_BYPASS:
        user = {
            "uid": Config.DEV_AUTH_USER_ID,
            "email": Config.DEV_AUTH_EMAIL,
            "name": Config.DEV_AUTH_NAME,
            "verified": True,
        }
        await track_account_request(
            request,
            user["uid"],
            allow_pending=request.method == "DELETE" and request.url.path == "/api/v1/user/account",
        )
        request.state.user = user
        logger.debug("Development authentication bypass applied")
        return user

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")


async def get_current_user_optional(request: Request) -> Optional[dict]:
    """Like :func:`get_current_user` but returns None instead of raising on no-auth.

    Useful for routes that work with or without authentication (e.g. health checks).
    """
    try:
        return await get_current_user(request)
    except HTTPException:
        return None


async def require_admin_user(user: dict = Depends(get_current_user)) -> dict:
    """Require the server-configured administrator identity, failing closed."""
    decision = get_admin_authorization_decision(user, Config.ADMIN_UID)
    if decision.allowed:
        return user

    detail = (
        "Administrative access is not configured"
        if decision.reason == "missing_configuration"
        else "Administrative access required"
    )
    raise HTTPException(status_code=decision.status_code, detail=detail)


async def _get_cached_db_config(request: Request) -> Optional[dict]:
    """
    Read database configuration from request state or per-session state.

    This state-only helper does not authenticate callers and must remain private.
    Route dependencies must use :func:`get_authenticated_db_config` instead.

    The cached ``db_config`` is keyed per Firebase session cookie (via
    :func:`_state_key_from_cookie`). Persistence is governed by
    ``connectionPersistenceMinutes`` in the session state:

    - If the tab is closed (explicit ``/user/session/close`` call or
      extended heartbeat inactivity exceeding
      ``SESSION_IMPLICIT_CLOSE_GRACE_SECONDS``) and no persistence was
      configured, the connection is closed eagerly and the cached config
      is dropped.
    - If persistence was configured, the connection stays alive for that
      many minutes after the tab closes, then is closed automatically.

    IMPORTANT: The "implicit close" detection (heartbeat inactivity) uses
    a generous grace period (default 5 minutes) to avoid false positives
    from browser timer throttling. Browser JavaScript timers are
    aggressively throttled in background tabs (Chrome: once per minute
    after 5 min; mobile Safari: fully suspended). A 45-second grace period
    (the previous value) caused false-positive disconnects for users who
    briefly switched tabs. The persistence setting is documented as
    "keep alive after closing tab" — it must NOT affect an actively open
    tab, even if the browser temporarily throttled the heartbeat.

    Returns ``None`` when there is no cached config or the cached config
    has expired.
    """
    if hasattr(request.state, "db_config") and request.state.db_config:
        return request.state.db_config

    session_data = await get_session_data(request)
    if session_data and "db_config" in session_data:
        db_config = session_data["db_config"]
        if not db_config:
            return None

        persistence_minutes = _get_connection_persistence_minutes(session_data)
        closed_at = session_data.get("db_config_last_closed_at")
        active_at = session_data.get("session_active_at")
        now = time.time()

        # ── Implicit close detection (fallback only) ───────────────────────
        # Only treat heartbeat inactivity as an implicit tab close if the
        # inactivity exceeds the GENEROUS grace period. This is a FALLBACK for
        # cases where the explicit close event (beforeunload/pagehide →
        # /user/session/close) didn't fire — e.g., browser crash, mobile tab
        # swipe, OS kill. The previous 45-second grace was too aggressive and
        # caused false-positive disconnects when browsers throttled
        # background-tab timers.
        #
        # The generous grace period (default 5 minutes) ensures that an
        # actively open tab never gets disconnected just because the browser
        # temporarily throttled the heartbeat. If the user actually closed the
        # tab, the explicit /user/session/close call (fired by beforeunload)
        # sets db_config_last_closed_at immediately — no need for this
        # fallback to catch it.
        if closed_at is None and active_at is not None:
            try:
                grace_seconds = getattr(Config, "SESSION_IMPLICIT_CLOSE_GRACE_SECONDS", 300)
                if now - float(active_at) > grace_seconds:
                    closed_at = float(active_at)
                    await update_session_data(
                        request,
                        {
                            "db_config_last_closed_at": closed_at,
                        },
                    )
            except (TypeError, ValueError):
                pass

        if closed_at is not None:
            if not persistence_minutes or persistence_minutes <= 0:
                await _expire_db_config(request, db_config, "tab_closed_no_persistence")
                return None

            if now - float(closed_at) > (persistence_minutes * 60):
                await _expire_db_config(request, db_config, "tab_closed_expired")
                return None

            # Within the persistence window — clear the close marker and
            # refresh activity timestamps. The tab is back (or persistence
            # is keeping the connection alive).
            await update_session_data(
                request,
                {
                    "db_config_last_closed_at": None,
                    "db_config_last_used_at": now,
                    "session_active_at": now,
                },
            )
        else:
            # No close event — tab is open. Refresh activity timestamp.
            await update_session_data(
                request,
                {
                    "db_config_last_used_at": now,
                    "session_active_at": now,
                },
            )

        request.state.db_config = db_config
        return db_config

    return None


async def get_authenticated_db_config(
    request: Request,
    user: dict = Depends(get_current_user),
) -> Optional[dict]:
    """Authenticate the request before reading or refreshing cached database state."""
    db_config = await _get_cached_db_config(request)
    if db_config:
        db_config = {**db_config, "_pool_owner": user["uid"]}
        request.state.db_config = db_config
    return db_config


async def require_authenticated_db_config(
    db_config: Optional[dict] = Depends(get_authenticated_db_config),
) -> dict:
    """Return the cached db_config or raise 400 if none is configured.

    Use for routes that require a database connection.
    """
    if not db_config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No database configured. Please connect to a database first.",
        )
    return db_config


async def update_session_data(request: Request, updates: dict, expire_seconds: int | None = None) -> bool:
    """
    Atomically shallow-merge top-level per-Firebase-session application state.

    Always refreshes ``session_active_at`` so :func:`_get_cached_db_config`
    can use it as a heartbeat to detect closed tabs. Authenticated updates
    also backfill ownership on legacy session records.

    Returns:
        True if updated, False if no Firebase session cookie exists
    """
    key = _state_key_from_cookie(request)
    if not key:
        return False

    expire_seconds = expire_seconds or Config.SESSION_EXPIRE_SECONDS
    merged_updates = dict(updates)
    user = getattr(request.state, "user", None)
    user_id = user.get("uid") if isinstance(user, dict) else None
    if user_id:
        merged_updates["_user_id"] = str(user_id)
    merged_updates["session_active_at"] = time.time()
    await _merge_state(key, merged_updates, expire_seconds)
    return True


async def replace_session_data_for_cookie(
    session_cookie: str,
    data: dict,
    expire_seconds: int | None = None,
    *,
    user_id: str | None = None,
) -> None:
    """Write application state for a freshly issued Firebase session cookie."""
    expire_seconds = expire_seconds or Config.SESSION_EXPIRE_SECONDS
    session_data = dict(data)
    if user_id:
        session_data["_user_id"] = str(user_id)
    session_data["session_active_at"] = time.time()
    await _write_state(state_key_from_session_cookie(session_cookie), session_data, expire_seconds)


async def clear_session_state(request: Request) -> bool:
    """Clear per-Firebase-session application state.

    Returns:
        True if state was cleared; False if no session cookie was present.
    """
    key = _state_key_from_cookie(request)
    if not key:
        return False

    await _delete_state(key)
    return True


async def _collect_user_session_state(user_id: str, *, delete: bool) -> list[dict]:
    """Collect indexed session state, optionally deleting matching records."""
    normalized_user_id = str(user_id)
    redis_client = await get_redis()
    collected: list[dict] = []

    if redis_client:
        matching_keys = []
        async for key in redis_client.scan_iter(match="session_state:*", count=100):
            raw = await redis_client.get(key)
            if not raw:
                continue
            try:
                state = json.loads(raw)
            except (TypeError, ValueError, json.JSONDecodeError):
                continue
            if isinstance(state, dict) and state.get("_user_id") == normalized_user_id:
                matching_keys.append(key)
                collected.append(state)
        if delete and matching_keys:
            await redis_client.delete(*matching_keys)
        return collected

    now = time.time()
    with _memory_state_lock:
        for key, (state, expires_at) in list(_memory_state.items()):
            if expires_at <= now:
                _memory_state.pop(key, None)
                continue
            if state.get("_user_id") == normalized_user_id:
                collected.append(dict(state))
                if delete:
                    _memory_state.pop(key, None)
    return collected


async def get_all_user_session_state(user_id: str) -> list[dict]:
    """Return every indexed session-state record for a user without deleting it."""
    return await _collect_user_session_state(user_id, delete=False)


async def clear_all_user_session_state(user_id: str) -> list[dict]:
    """Delete every indexed session-state record for a user and return its data."""
    return await _collect_user_session_state(user_id, delete=True)
