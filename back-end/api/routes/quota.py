# File: api/routes/quota.py
"""User quota status API routes."""

import logging
from fastapi import APIRouter, Request, Depends

from dependencies import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/quota", tags=["quota"])


@router.get("/status")
async def get_quota_status(request: Request, user: dict = Depends(get_current_user)):
    """
    Get current user's rate limit quota status.

    Returns usage for minute, hour, and day timeframes with reset times.
    Also returns 'enabled' flag so frontend knows whether to display quota UI.
    """
    user_id = user.get("uid") or user
    user_quota = request.app.state.user_quota

    usage = await user_quota.get_usage(user_id)

    return {
        "status": "success",
        "user_id": user_id,
        "enabled": user_quota.config.enabled,
        "quota": usage.to_dict(),
    }
