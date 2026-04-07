# File: auth/decorators.py
"""
Authentication dependencies for FastAPI.

This module provides FastAPI dependency functions for authentication.
The main implementation is in dependencies.py - this file re-exports
for backward compatibility and provides additional auth utilities.
"""

from dependencies import (
    get_current_user,
    get_current_user_optional,
    get_session_data,
)

# Re-export for backward compatibility
__all__ = [
    "get_current_user",
    "get_current_user_optional",
    "get_session_data",
]


def get_user_id_from_user(user: dict) -> str:
    """
    Extract user ID from user dict.

    Args:
        user: User dict from get_current_user dependency

    Returns:
        User ID string
    """
    if isinstance(user, dict):
        return user.get("uid") or user.get("id") or str(user)
    return str(user)
