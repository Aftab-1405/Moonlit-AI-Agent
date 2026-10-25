"""User quota status API routes."""

import logging

from fastapi import APIRouter, Depends, Request

from dependencies import AuthenticatedUser, get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/quota", tags=["User Quota"])


@router.get("/status")
async def get_quota_status(request: Request, user: AuthenticatedUser = Depends(get_current_user)):
    """Return the authenticated user's current rate-limit quota usage across all timeframes.

    Returns:
        A dict with the following fields:

            - ``status`` (str): Always ``"success"`` on a successful lookup.
            - ``user_id`` (str): The Firebase UID the quota snapshot belongs to.
            - ``enabled`` (bool): Whether the rate-limiter is active for this deployment
              (the frontend uses this to decide whether to render the quota UI).
            - ``quota`` (dict): Per-timeframe usage details as produced by
              ``user_quota.get_usage(...).to_dict()`` — typically contains
              ``minute``, ``hour``, and ``day`` windows, each with ``limit``,
              ``remaining``, ``used``, and ``resets_at`` fields.
    """
    user_id = user["uid"]
    user_quota = request.app.state.user_quota

    usage = await user_quota.get_usage(user_id)

    return {
        "status": "success",
        "user_id": user_id,
        "enabled": user_quota.config.enabled,
        "quota": usage.to_dict(),
    }
