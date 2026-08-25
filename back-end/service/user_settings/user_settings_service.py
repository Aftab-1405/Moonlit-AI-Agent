"""Per-user application preferences stored in Firestore."""

from __future__ import annotations

import logging
from typing import Any

from config import get_config
from service.context.context_repository import ContextRepository

logger = logging.getLogger(__name__)
Config = get_config()

DEFAULT_PREFERENCES: dict[str, Any] = {
    "theme": Config.USER_SETTINGS_DEFAULT_THEME,
    "confirmBeforeRun": Config.USER_SETTINGS_DEFAULT_CONFIRM_BEFORE_RUN,
    "queryTimeout": Config.USER_SETTINGS_DEFAULT_QUERY_TIMEOUT,
    "maxRows": Config.USER_SETTINGS_DEFAULT_MAX_ROWS,
    "nullDisplay": Config.USER_SETTINGS_DEFAULT_NULL_DISPLAY,
    "rememberConnection": Config.USER_SETTINGS_DEFAULT_REMEMBER_CONNECTION,
    "defaultDbType": Config.USER_SETTINGS_DEFAULT_DB_TYPE,
    "connectionPersistence": Config.USER_SETTINGS_DEFAULT_CONNECTION_PERSISTENCE,
    "enableReasoning": Config.USER_SETTINGS_DEFAULT_ENABLE_REASONING,
    "reasoningEffort": Config.USER_SETTINGS_DEFAULT_REASONING_EFFORT,
    "responseStyle": Config.USER_SETTINGS_DEFAULT_RESPONSE_STYLE,
    "taskMode": "auto",
    "llmProvider": Config.USER_SETTINGS_DEFAULT_LLM_PROVIDER,
    "llmModel": Config.USER_SETTINGS_DEFAULT_LLM_MODEL,
}

_INT_KEYS = {"queryTimeout", "maxRows", "connectionPersistence"}
_BOOL_KEYS = {"confirmBeforeRun", "rememberConnection", "enableReasoning"}
_ENUMS = {
    "theme": {"light", "dark"},
    "defaultDbType": {"mysql", "postgresql", "sqlserver", "oracle"},
    "connectionPersistence": {0, 5, 15, 30, 60},
    "reasoningEffort": {"low", "medium", "high"},
    "responseStyle": {"concise", "balanced", "detailed"},
    "taskMode": {"auto", "normal", "tool_task", "long_task"},
}


def _normalize_user_id(user: Any) -> str:
    """Normalize a user id (string or dict) to a stable Firestore document id."""
    return ContextRepository._normalize_user_id(user)


def _coerce_value(key: str, value: Any) -> Any:
    """Coerce a raw preference value to the expected type for ``key``, returning None on invalid input."""
    if value is None:
        return None

    if key in _BOOL_KEYS:
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "yes", "on"}
        return bool(value)

    if key in _INT_KEYS:
        try:
            coerced = int(value)
        except (TypeError, ValueError):
            return None
        if key in _ENUMS and coerced not in _ENUMS[key]:
            return None
        return coerced

    if key in _ENUMS:
        normalized = str(value).strip()
        if key == "theme":
            normalized = normalized.lower()
        if key == "defaultDbType":
            normalized = normalized.lower()
        if key == "reasoningEffort":
            normalized = normalized.lower()
        if key == "responseStyle":
            normalized = normalized.lower()
        if key == "taskMode":
            normalized = normalized.lower()
        return normalized if normalized in _ENUMS[key] else None

    if key in {"llmProvider", "llmModel", "nullDisplay"}:
        text = str(value).strip()
        return text or None

    return value


def _sanitize_patch(patch: dict[str, Any]) -> dict[str, Any]:
    """Accept camelCase frontend keys and legacy connectionPersistenceMinutes."""
    if not patch:
        return {}

    incoming = dict(patch)
    if "connectionPersistence" not in incoming and "connectionPersistenceMinutes" in incoming:
        incoming["connectionPersistence"] = incoming.pop("connectionPersistenceMinutes")

    sanitized: dict[str, Any] = {}
    for key, value in incoming.items():
        if key not in DEFAULT_PREFERENCES:
            continue
        coerced = _coerce_value(key, value)
        if coerced is not None or key in {"llmProvider", "llmModel"}:
            sanitized[key] = coerced
    return sanitized


class UserSettingsService:
    """Read/write merged preferences on user_context/{uid}.preferences."""

    @staticmethod
    def get_merged(user_id: Any) -> dict[str, Any]:
        """Return the user's preferences merged on top of DEFAULT_PREFERENCES."""
        uid = _normalize_user_id(user_id)
        doc = ContextRepository.get(uid) or {}
        stored = doc.get("preferences") if isinstance(doc.get("preferences"), dict) else {}
        merged = {**DEFAULT_PREFERENCES, **stored}
        merged["taskMode"] = (
            _coerce_value("taskMode", stored.get("taskMode"))
            or DEFAULT_PREFERENCES["taskMode"]
        )
        return merged

    @staticmethod
    def get_merged_with_legacy_session_backfill(
        user_id: Any, session_persistence_minutes: Any | None
    ) -> dict[str, Any]:
        """Return settings and migrate legacy session persistence if needed."""
        uid = _normalize_user_id(user_id)
        prefs = UserSettingsService.get_merged(uid)
        if session_persistence_minutes is None:
            return prefs

        doc = ContextRepository.get(uid) or {}
        if doc.get("preferences"):
            return prefs

        try:
            legacy_minutes = int(session_persistence_minutes)
        except (TypeError, ValueError):
            return prefs

        return UserSettingsService.save(
            uid,
            {"connectionPersistence": legacy_minutes},
        )

    @staticmethod
    def save(user_id: Any, patch: dict[str, Any]) -> dict[str, Any]:
        """Sanitize and persist a preference patch, returning the merged preferences."""
        uid = _normalize_user_id(user_id)
        sanitized = _sanitize_patch(patch)
        if not sanitized:
            return UserSettingsService.get_merged(uid)

        current = UserSettingsService.get_merged(uid)
        merged = {**current, **sanitized}
        ContextRepository.update(uid, {"preferences": merged})
        logger.info("Updated preferences for user %s: %s", uid, list(sanitized.keys()))
        return merged

    @staticmethod
    def connection_persistence_minutes(prefs: dict[str, Any]) -> int:
        """Return the connection persistence minutes from ``prefs`` (0 on invalid)."""
        try:
            return int(prefs.get("connectionPersistence", 0))
        except (TypeError, ValueError):
            return 0
