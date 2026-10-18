"""Authenticated dashboard API routes."""

import time
from enum import IntEnum

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.concurrency import run_in_threadpool
from firebase_admin import auth

from config import get_config
from core.account_activity import AccountBusyError, track_account_request
from dependencies import (
    clear_all_user_session_state,
    clear_session_state,
    get_all_user_session_state,
    get_current_user,
    get_session_data,
    verify_csrf_token,
)
from service.dashboard.account_deletion import AccountDeletionService
from service.dashboard.dashboard_service import DashboardService
from service.dashboard.usage_analytics import UsageAnalyticsService
from service.dashboard.usage_repository import UsageRepository

router = APIRouter(prefix="/user/dashboard", tags=["User Dashboard"])
Config = get_config()
RECENT_AUTH_MAX_AGE_SECONDS = 300
RECENT_AUTH_FUTURE_TOLERANCE_SECONDS = 60


class UsageDays(IntEnum):
    SEVEN = 7
    THIRTY = 30
    NINETY = 90


def is_recent_authentication(decoded_claims: dict, *, now=None) -> bool:
    """Return whether Firebase confirms a recent interactive sign-in."""
    try:
        auth_time = float(decoded_claims["auth_time"])
    except (KeyError, TypeError, ValueError):
        return False
    now = time.time() if now is None else float(now)
    age = now - auth_time
    return -RECENT_AUTH_FUTURE_TOLERANCE_SECONDS <= age <= RECENT_AUTH_MAX_AGE_SECONDS


@router.get("/overview")
async def get_dashboard_overview(user: dict = Depends(get_current_user)):
    user_id = user.get("uid") or user
    data = await run_in_threadpool(
        DashboardService.get_overview,
        user_id,
        usage_repository=UsageRepository,
    )
    return {"status": "success", "data": data}


@router.get("/usage")
async def get_dashboard_usage(
    days: UsageDays = UsageDays.THIRTY,
    user: dict = Depends(get_current_user),
):
    user_id = user.get("uid") or user
    data = await run_in_threadpool(
        UsageAnalyticsService.get_usage,
        user_id,
        days=int(days),
        repository=UsageRepository,
    )
    return {"status": "success", "data": data}


# This route deliberately lives at /user/account while the read-only routes
# remain grouped below /user/dashboard.
account_router = APIRouter(prefix="/user", tags=["User Account"])


@account_router.delete("/account")
async def delete_user_account(
    request: Request,
    response: Response,
    user: dict = Depends(get_current_user),
):
    """Permanently erase Moonlit data after a recent Firebase reauthentication."""
    verify_csrf_token(request)
    session_cookie = request.cookies.get(Config.SESSION_COOKIE_NAME)
    if not session_cookie:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Recent authentication required")

    try:
        decoded = await run_in_threadpool(
            auth.verify_session_cookie,
            session_cookie,
            check_revoked=Config.FIREBASE_SESSION_CHECK_REVOKED,
        )
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Recent authentication required",
        ) from error

    user_id = user.get("uid") or user
    if decoded.get("uid") != user_id or not is_recent_authentication(decoded):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Please sign in again before deleting your account",
        )

    activity_store, activity_token = await track_account_request(request, user_id, allow_pending=True)
    try:
        await activity_store.begin_erasure(user_id, activity_token)
    except AccountBusyError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail='Account work is still running. Stop active responses and retry account deletion.',
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail='Account activity service temporarily unavailable',
        ) from exc

    current_session_data = await get_session_data(request) or {}
    session_states = await get_all_user_session_state(user_id)
    if current_session_data and current_session_data not in session_states:
        session_states.append(current_session_data)
    for session_state in session_states:
        db_config = session_state.get("db_config")
        if not db_config:
            continue
        from service.database.database_service import DatabaseService

        disconnect_result = await run_in_threadpool(DatabaseService.disconnect, db_config, user_id)
        if not isinstance(disconnect_result, dict) or disconnect_result.get("status") != "success":
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Could not close all database connections. Please retry account deletion.",
            )

    await clear_all_user_session_state(user_id)
    await request.app.state.user_quota.delete_user_usage(user_id)
    result = await AccountDeletionService.delete_user(user_id)
    await clear_session_state(request)
    await activity_store.complete_erasure(user_id, activity_token)
    response.delete_cookie(
        key=Config.SESSION_COOKIE_NAME,
        path="/",
        secure=Config.SESSION_COOKIE_SECURE,
        httponly=Config.SESSION_COOKIE_HTTPONLY,
        samesite=Config.SESSION_COOKIE_SAMESITE,
    )
    response.delete_cookie(
        key=Config.CSRF_COOKIE_NAME,
        path="/",
        secure=Config.SESSION_COOKIE_SECURE,
        httponly=False,
        samesite=Config.SESSION_COOKIE_SAMESITE,
    )
    return {"status": "success", **result}
