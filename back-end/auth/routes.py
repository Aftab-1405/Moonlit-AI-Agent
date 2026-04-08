"""Authentication routes - FastAPI Router"""

import logging
from fastapi import APIRouter, Request, Response, HTTPException, status
from pydantic import BaseModel
from typing import Optional

from config import Config
from dependencies import (
    get_session_data,
    set_session_data,
    clear_session,
)

router = APIRouter(tags=["auth"])
logger = logging.getLogger(__name__)


# =============================================================================
# REQUEST SCHEMAS
# =============================================================================


class SetSessionRequest(BaseModel):
    """Request body for /set_session"""

    idToken: str
    user: Optional[dict] = None


# =============================================================================
# ROUTES
# =============================================================================


@router.post("/set_session")
async def set_session(request: Request, response: Response, data: SetSessionRequest):
    """
    Verify Firebase ID token and establish session.

    Expects JSON body:
    {
        "idToken": "...",  // Firebase ID token for verification
        "user": {...}      // Optional user data
    }
    """
    try:
        from firebase_admin import auth

        # Verify the token cryptographically with Firebase
        decoded_token = auth.verify_id_token(data.idToken)

        # Token is valid - create session data
        user_data = {
            "uid": decoded_token["uid"],
            "email": decoded_token.get("email"),
            "name": decoded_token.get("name"),
            "picture": decoded_token.get("picture"),
            "verified": True,
        }

        # Preserve existing session data (especially db_config) on re-login
        existing_session = await get_session_data(request)
        session_data = {
            **(existing_session or {}),
            "user": user_data,
        }

        # Reuse existing session_id to keep the same cookie on re-login
        existing_session_id = request.cookies.get("session_id")
        session_id = await set_session_data(
            request, session_data, session_id=existing_session_id
        )

        response.set_cookie(
            key="session_id",
            value=session_id,
            httponly=Config.SESSION_COOKIE_HTTPONLY,
            secure=Config.SESSION_COOKIE_SECURE,
            samesite=Config.SESSION_COOKIE_SAMESITE,
            max_age=Config.SESSION_EXPIRE_SECONDS,
        )

        logger.info(f"Session established for verified user: {decoded_token['uid']}")
        return {"status": "success", "user": user_data}

    except Exception as e:
        logger.error(f"Token verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        )


@router.get("/check_session")
async def check_session(request: Request):
    """Check if user has active session."""
    session_data = await get_session_data(request)

    if session_data and "user" in session_data:
        return {"status": "session_active"}
    return {"status": "no_session"}


@router.post("/logout")
async def logout(request: Request, response: Response):
    """Clear user session and cleanup."""
    await clear_session(request)

    # Clear the session cookie
    response.delete_cookie(key="session_id")

    logger.debug("User session cleared on /logout")
    return {"status": "success", "message": "Logged out successfully"}


@router.get("/firebase-config")
async def get_firebase_config():
    """Serve Firebase web client configuration."""
    try:
        config = Config.get_firebase_web_config()
        return {"status": "success", "config": config}
    except Exception as e:
        logger.error(f"Error getting Firebase config: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve Firebase configuration",
        )
