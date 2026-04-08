"""
FastAPI Dependencies

Centralized dependency injection for authentication, database config, and Redis.
These replace Flask's global session and g object patterns.
"""

import json
import logging
import time
from typing import Optional
from fastapi import Depends, HTTPException, Request, status
from fastapi.concurrency import run_in_threadpool
from config import Config

logger = logging.getLogger(__name__)


async def get_redis():
    """Get Redis client from application state."""
    from main import get_redis_client

    return get_redis_client()


async def get_session_data(request: Request) -> Optional[dict]:
    """
    Get session data from Redis.

    Returns:
        Session data dict or None if no valid session
    """
    session_id = request.cookies.get("session_id")
    if not session_id:
        return None

    redis_client = await get_redis()
    try:
        session_data = await redis_client.get(f"session:{session_id}")
        if session_data:
            return json.loads(session_data)
    except Exception as e:
        logger.warning(f"Error reading session from Redis: {e}")

    return None


def _get_connection_persistence_minutes(session_data: dict) -> Optional[int]:
    value = session_data.get("connectionPersistenceMinutes")
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


async def _expire_db_config(request: Request, db_config: dict, reason: str) -> None:
    try:
        user = getattr(request.state, "user", None)
        user_id = user.get("uid") if isinstance(user, dict) else None
    except Exception:
        user_id = None

    try:
        from services.database_service import DatabaseService

        await run_in_threadpool(DatabaseService.disconnect, db_config, user_id)
    except Exception as e:
        logger.warning(f"Failed to disconnect expired DB config: {e}")

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
        logger.warning(f"Failed to clear expired DB config from session: {e}")


async def get_current_user(request: Request) -> dict:
    """
    Authenticate request via Redis session cookie.

    Returns:
        User dict with uid, email, name, verified flag

    Raises:
        HTTPException 401 if not authenticated
    """
    session_data = await get_session_data(request)
    if session_data and "user" in session_data:
        user = session_data["user"]
        request.state.user = user
        logger.debug(f"Session auth for user: {user.get('uid')}")
        return user

    logger.debug("No valid authentication found")
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required"
    )


async def get_current_user_optional(request: Request) -> Optional[dict]:
    """
    Like get_current_user but returns None instead of raising exception.
    Useful for routes that work with or without authentication.
    """
    try:
        return await get_current_user(request)
    except HTTPException:
        return None


async def get_db_config(request: Request) -> Optional[dict]:
    """
    Get database configuration from request state or Redis session.

    The db_config is set either:
    1. Directly in request.state by a prior middleware/dependency
    2. From Redis session storage

    Returns:
        Database configuration dict or None if not configured
    """
    # Check request state first (set by connect_db endpoint)
    if hasattr(request.state, "db_config") and request.state.db_config:
        return request.state.db_config

    # Fall back to session
    session_data = await get_session_data(request)
    if session_data and "db_config" in session_data:
        db_config = session_data["db_config"]
        if not db_config:
            return None

        persistence_minutes = _get_connection_persistence_minutes(session_data)
        closed_at = session_data.get("db_config_last_closed_at")
        active_at = session_data.get("session_active_at")
        now = time.time()

        # If no explicit close event and heartbeat stopped, treat as implicit close
        if closed_at is None and active_at is not None:
            try:
                if now - float(active_at) > Config.SESSION_ACTIVITY_GRACE_SECONDS:
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
            # Tab was closed; enforce persistence window on reopen
            if not persistence_minutes or persistence_minutes <= 0:
                await _expire_db_config(request, db_config, "tab_closed_no_persistence")
                return None

            if now - float(closed_at) > (persistence_minutes * 60):
                await _expire_db_config(request, db_config, "tab_closed_expired")
                return None

            # Reopened within persistence window - clear closed marker
            await update_session_data(
                request,
                {
                    "db_config_last_closed_at": None,
                    "db_config_last_used_at": now,
                    "session_active_at": now,
                },
            )
        else:
            # Active session - update last-used for observability
            await update_session_data(
                request,
                {
                    "db_config_last_used_at": now,
                    "session_active_at": now,
                },
            )

        # Cache in request state for this request
        request.state.db_config = db_config
        return db_config

    return None


async def require_db_config(db_config: Optional[dict] = Depends(get_db_config)) -> dict:
    """
    Like get_db_config but raises exception if not configured.
    Use for routes that require a database connection.
    """
    if not db_config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No database configured. Please connect to a database first.",
        )
    return db_config


async def get_conversation_id(request: Request) -> Optional[str]:
    """Get conversation ID from session."""
    session_data = await get_session_data(request)
    if session_data:
        return session_data.get("conversation_id")
    return None


# Session management utilities


async def set_session_data(
    request: Request,
    data: dict,
    session_id: str = None,
    expire_seconds: int = 86400,
) -> str:
    """
    Store session data in Redis.

    Args:
        request: FastAPI request
        data: Session data to store
        session_id: Optional session ID (generates new if not provided)
        expire_seconds: Session expiry in seconds

    Returns:
        Session ID
    """
    import uuid

    if not session_id:
        session_id = str(uuid.uuid4())

    data = dict(data)
    data.setdefault("session_active_at", time.time())

    redis_client = await get_redis()
    await redis_client.set(f"session:{session_id}", json.dumps(data), ex=expire_seconds)
    return session_id


async def update_session_data(
    request: Request, updates: dict, expire_seconds: int = 86400
) -> bool:
    """
    Update existing session data in Redis.

    Args:
        request: FastAPI request
        updates: Dict of fields to update
        expire_seconds: Reset expiry to this value

    Returns:
        True if updated, False if no session exists
    """
    session_id = request.cookies.get("session_id")
    if not session_id:
        return False

    session_data = await get_session_data(request)
    if not session_data:
        return False

    session_data.update(updates)
    session_data["session_active_at"] = time.time()

    redis_client = await get_redis()
    await redis_client.set(
        f"session:{session_id}", json.dumps(session_data), ex=expire_seconds
    )
    return True


async def clear_session(request: Request) -> bool:
    """
    Clear session data from Redis.

    Returns:
        True if cleared, False if no session existed
    """
    session_id = request.cookies.get("session_id")
    if not session_id:
        return False

    redis_client = await get_redis()
    await redis_client.delete(f"session:{session_id}")
    return True
