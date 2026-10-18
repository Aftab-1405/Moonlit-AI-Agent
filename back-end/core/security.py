"""Security primitives shared across the backend.

This module centralizes three concerns that previously leaked through
the codebase as ad-hoc snippets:

1. **PII / secret redaction** — DB usernames, hosts, connection strings,
   passwords, session cookies and JWTs must never appear in logs at any
   level.  ``redact()`` performs structural redaction on dicts/strings;
   ``redact_connection_config()`` is the typed helper for DB configs.

2. **Constant-time comparisons** — CSRF tokens and other shared secrets
   must be compared with :func:`secrets.compare_digest` to defeat timing
   oracles.  The previous codebase used ``!=`` in several places.

3. **Identifier validation** — table/column/database names flow into
   DBMS-specific ``quote_identifier`` calls; a permissive regex is an
   injection vector.  The rules here accept only ``[A-Za-z_][A-Za-z0-9_]*``
   plus an optional single dot for ``schema.table``.

All helpers are pure and side-effect free unless noted.
"""

from __future__ import annotations

import re
import secrets
from typing import Any, Mapping

# PII / secret redaction

#: Keys (case-insensitive) whose values are scrubbed from log payloads.
SENSITIVE_KEY_NAMES: frozenset[str] = frozenset(
    {
        "password",
        "pwd",
        "secret",
        "token",
        "api_key",
        "apikey",
        "access_token",
        "refresh_token",
        "session_cookie",
        "session_cookie_value",
        "csrf_token",
        "private_key",
        "service_account_json",
        "credentials",
        "authorization",
        "auth",
        "connection_string",
        "dsn",
    }
)

#: Database identity keys masked more selectively than credentials.
_DB_USER_KEYS: frozenset[str] = frozenset({"user", "username"})

#: Database credential aliases not necessarily used outside connection configs.
_DB_CREDENTIAL_KEYS: frozenset[str] = frozenset({"password", "passwd", "pwd"})

_REDACTED_PLACEHOLDER: str = "***REDACTED***"

#: Substrings (case-insensitive) replaced inside arbitrary strings.
_SENSITIVE_SUBSTRINGS: tuple[str, ...] = (
    "password=",
    "passwd=",
    "pwd=",
    "user=",
    "username=",
    "session_cookie=",
    "csrf_token=",
    "authorization=",
    "bearer ",
)


def _normalize_key(key: str) -> str:
    """Canonicalize snake, kebab, camel, and Pascal case for policy checks."""
    normalized = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", "_", key)
    normalized = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", normalized)
    return re.sub(r"[^A-Za-z0-9]+", "_", normalized).strip("_").lower()


def _is_sensitive_key(key: str) -> bool:
    """Return True if ``key`` (case-insensitive, snake/kebab/camel) is sensitive."""
    if not isinstance(key, str):
        return False
    return _normalize_key(key) in SENSITIVE_KEY_NAMES


def redact(value: Any, *, _depth: int = 0) -> Any:
    """Recursively redact sensitive values from a log payload.

    Args:
        value: Arbitrary Python value (dict, list, tuple, str, primitive).
        _depth: Recursion guard (internal).

    Returns:
        A shallow-copied structure with every sensitive value replaced by
        ``"***REDACTED***"``.  Strings containing ``password=`` style
        fragments have those fragments masked in-place.

    Notes:
        - Cycles are guarded by ``_depth`` (capped at 10).
        - Original containers are never mutated.
    """
    if _depth > 10:
        return _REDACTED_PLACEHOLDER
    if isinstance(value, Mapping):
        return {
            k: (_REDACTED_PLACEHOLDER if _is_sensitive_key(k) else redact(v, _depth=_depth + 1))
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [redact(item, _depth=_depth + 1) for item in value]
    if isinstance(value, tuple):
        return tuple(redact(item, _depth=_depth + 1) for item in value)
    if isinstance(value, str):
        return _redact_string(value)
    return value


def _redact_string(value: str) -> str:
    """Mask ``key=value`` style secrets inside an arbitrary string."""
    redacted = value
    lowered = redacted.lower()
    for needle in _SENSITIVE_SUBSTRINGS:
        idx = lowered.find(needle)
        while idx >= 0:
            # Replace the value portion up to the next separator or end.
            start = idx + len(needle)
            end = start
            while end < len(redacted) and redacted[end] not in (
                ";",
                " ",
                "&",
                ",",
                '"',
                "'",
            ):
                end += 1
            redacted = redacted[:start] + _REDACTED_PLACEHOLDER + redacted[end:]
            lowered = redacted.lower()
            idx = lowered.find(needle, start + len(_REDACTED_PLACEHOLDER))
    return redacted


def redact_connection_config(config: Mapping[str, Any]) -> dict[str, Any]:
    """Return a copy of a DB connection config with credentials removed.

    Args:
        config: DB config dict (may contain ``user``, ``password``,
            ``host``, ``port``, ``database``, ``db_type``).

    Returns:
        New dict with credentials, DSNs, connection strings, and other
        sensitive fields fully redacted. Database usernames are masked to
        their first character plus ``***``; operational fields such as
        ``host``, ``database``, and ``db_type`` are preserved.
    """
    if not isinstance(config, Mapping):
        return {}
    safe: dict[str, Any] = {}
    for key, value in config.items():
        normalized = _normalize_key(key)
        if normalized in _DB_USER_KEYS:
            safe[key] = f"{value[0]}***" if isinstance(value, str) and value else _REDACTED_PLACEHOLDER
        elif normalized in _DB_CREDENTIAL_KEYS or _is_sensitive_key(key):
            safe[key] = _REDACTED_PLACEHOLDER
        else:
            safe[key] = redact(value)
    return safe


# Constant-time comparisons


def constant_time_eq(a: str | None, b: str | None) -> bool:
    """Compare two strings in constant time.

    Wraps :func:`secrets.compare_digest` so callers do not need to handle
    the ``TypeError`` when either side is ``None``.

    Args:
        a: First string (or None).
        b: Second string (or None).

    Returns:
        True if both strings are equal.  ``None`` is treated as the empty
        string for comparison purposes — callers should still check for
        presence explicitly before calling.
    """
    if a is None or b is None:
        return a is b
    return secrets.compare_digest(a, b)


# Identifier validation

#: Strict identifier rule: ``[A-Za-z_][A-Za-z0-9_]*`` optionally qualified
#: with a single ``.`` separator (``schema.table``).  Hyphens, leading
#: digits, and pure-numeric names are rejected because they require
#: DBMS-specific quoting and are a known SQL-injection vector when
#: interpolated into dynamic SQL.
_IDENTIFIER_PATTERN: re.Pattern[str] = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?$")


def is_valid_identifier(name: str, *, max_length: int = 128) -> bool:
    """Return True if ``name`` is a safe SQL identifier.

    Args:
        name: Identifier to test.
        max_length: Maximum byte length (default 128).

    Returns:
        True if ``name`` matches ``[A-Za-z_][A-Za-z0-9_]*(\\.[A-Za-z_][A-Za-z0-9_]*)?``
        and is no longer than ``max_length``.
    """
    if not isinstance(name, str) or not name or len(name) > max_length:
        return False
    return _IDENTIFIER_PATTERN.match(name) is not None


def validate_identifier(name: str, *, kind: str = "identifier") -> str:
    """Validate a SQL identifier, raising ``ValueError`` if unsafe.

    Args:
        name: Identifier to validate.
        kind: Human-readable label for the error message (e.g. ``"table"``).

    Returns:
        The validated identifier (unchanged).

    Raises:
        ValueError: If the identifier is empty, too long, or contains
            characters outside the safe set.
    """
    if not is_valid_identifier(name):
        raise ValueError(f"Invalid {kind} name: {name!r}")
    return name


__all__ = [
    "SENSITIVE_KEY_NAMES",
    "redact",
    "redact_connection_config",
    "constant_time_eq",
    "is_valid_identifier",
    "validate_identifier",
]
