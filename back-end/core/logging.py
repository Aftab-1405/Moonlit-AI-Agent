"""Request-scoped logging context (correlation-ID / request-ID).

Every inbound HTTP request is assigned a unique, opaque request ID.
The ID is attached to every log record via a ``logging.Filter`` so that
operators can trace a single request across the API → service →
LangGraph → DB layers.

The ID is also echoed back to the client in the ``X-Request-ID`` header
so customer-support tickets can be matched to backend logs without
PII disclosure.

Usage
-----
The middleware in ``main.py`` calls :func:`bind_request_id` at request
start and :func:`clear_request_id` at request end. Application code
reads the current ID with :func:`current_request_id`.
"""

from __future__ import annotations

import contextvars
import logging
import secrets
from typing import Final

#: ContextVar holding the current request ID (or None).
_request_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar("request_id", default=None)

#: Header inspected for an inbound request ID. If absent, a fresh ID is
#: generated. We do NOT trust the inbound value unconditionally — it is
#: sanitized to ``[A-Za-z0-9_-]{1,64}`` and replaced if invalid.
REQUEST_ID_HEADER: Final[str] = "X-Request-ID"

#: Root logger whose active handlers receive the correlation filter.
_ROOT_LOGGER: logging.Logger = logging.getLogger()


class _RequestIdFilter(logging.Filter):
    """Inject the current request ID into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        """Attach the current request ID to ``record`` and accept it."""
        record.request_id = _request_id_var.get() or "-"
        return True


def install_request_id_filter() -> None:
    """Attach the request-ID filter to every active root handler exactly once.

    Logger filters do not run for records propagated from child loggers, while
    root-handler filters do. Installation therefore happens after application
    logging handlers have been configured.
    """
    for handler in _ROOT_LOGGER.handlers:
        if not any(isinstance(item, _RequestIdFilter) for item in handler.filters):
            handler.addFilter(_RequestIdFilter())


def _generate_request_id() -> str:
    """Return a fresh, opaque request ID."""
    return f"req_{secrets.token_urlsafe(12)}"


def bind_request_id(inbound: str | None = None) -> str:
    """Bind a request ID to the current async context.

    Args:
        inbound: Optional inbound ID from the ``X-Request-ID`` header.
            Sanitized to ``[A-Za-z0-9_-]{1,64}``; replaced with a fresh
            ID if missing or invalid.

    Returns:
        The bound request ID.
    """
    rid = _sanitize_inbound(inbound) if inbound else _generate_request_id()
    _request_id_var.set(rid)
    return rid


def clear_request_id() -> None:
    """Clear the bound request ID. Safe to call when no ID is bound."""
    _request_id_var.set(None)


def current_request_id() -> str | None:
    """Return the current request ID, or ``None`` if none is bound."""
    return _request_id_var.get()


def _sanitize_inbound(value: str) -> str:
    """Return ``value`` if it matches the safe charset, else a fresh ID."""
    if (
        1 <= len(value) <= 64
        and value.isascii()
        and all(c.isalnum() or c in "-_" for c in value)
    ):
        return value
    return _generate_request_id()


__all__ = [
    "REQUEST_ID_HEADER",
    "bind_request_id",
    "clear_request_id",
    "current_request_id",
    "install_request_id_filter",
]
