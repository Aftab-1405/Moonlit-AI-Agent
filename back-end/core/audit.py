"""Structured audit-event emitter for SOX / PCI / internal-bank compliance.

The backend runs inside a bank — every privileged action (SQL execution,
conversation deletion, auth event, memory mutation, connection lifecycle)
must emit a structured audit record that an external SIEM can ingest.

Design
------
- **Single emitter**: :func:`audit_log` is the only public entry point.
- **JSON line format**: every record is a single-line JSON object so it
  can be streamed to a file, Redis Stream, or Kinesis Firehose without
  parsing.
- **PII-safe**: the ``core.security.redact`` helper is applied to every
  ``details`` payload before serialization.
- **Idempotent**: callers may pass an ``idempotency_key`` so duplicate
  audit records (e.g. on retry) can be de-duplicated downstream.
- **Concurrency-safe telemetry**: the process-local delivery-failure counter
  is protected by a lock; event delivery uses :mod:`logging` handlers.

Usage
-----
>>> audit_log(
...     actor="user:u-123",
...     action="sql.execute",
...     resource="db:customers/query",
...     outcome="success",
...     details={"row_count": 42, "execution_time_ms": 18},
... )

Notes
-----
This module never raises — audit logging is best-effort. A failure to
emit an audit record must not break the request path.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import secrets
import time
from logging.handlers import RotatingFileHandler
from threading import Lock
from typing import Any, Mapping

from core.logging import current_request_id
from core.security import redact

#: Dedicated logger — operators can route audit events to a separate
#: sink (file, syslog, Kinesis) without affecting application logs.
_AUDIT_LOGGER_NAME: str = "audit"

_audit_logger: logging.Logger = logging.getLogger(_AUDIT_LOGGER_NAME)
_audit_logger.setLevel(logging.INFO)
_delivery_logger = logging.getLogger("core.audit.delivery")
_delivery_failure_lock = Lock()
_delivery_failures = 0

# Attach a NullHandler so that "no audit handler configured" never breaks
# the request path. Operators add a real handler (FileHandler, syslog,
# CloudWatch agent) via deployment configuration.
if not _audit_logger.handlers:
    _audit_logger.addHandler(logging.NullHandler())


def _record_delivery_failure(handler_name: str) -> None:
    """Record a payload-free signal that the audit delivery boundary failed."""
    global _delivery_failures
    with _delivery_failure_lock:
        _delivery_failures += 1
        failure_count = _delivery_failures
    try:
        _delivery_logger.warning(
            "Audit sink write failed: handler=%s failure_count=%d",
            handler_name,
            failure_count,
        )
    except Exception:
        # A secondary observability outage must not escape the original
        # best-effort security-audit boundary.
        pass


class _AuditRotatingFileHandler(RotatingFileHandler):
    """Rotating audit handler that creates every active file with mode 0600."""

    _moonlit_audit_handler = True

    def _open(self):
        descriptor = os.open(
            self.baseFilename,
            os.O_WRONLY | os.O_APPEND | os.O_CREAT,
            0o600,
        )
        os.chmod(self.baseFilename, 0o600)
        return os.fdopen(
            descriptor,
            self.mode,
            encoding=self.encoding,
            errors=self.errors,
        )

    def handleError(self, record: logging.LogRecord) -> None:
        """Count a handler failure without copying its record into another sink."""
        del record
        _record_delivery_failure(type(self).__name__)


def audit_delivery_failure_count() -> int:
    """Return the process-local count of audit emission/delivery failures."""
    with _delivery_failure_lock:
        return _delivery_failures


def audit_sink_configured() -> bool:
    """Return whether the dedicated application audit handler is installed."""
    return any(getattr(handler, "_moonlit_audit_handler", False) for handler in _audit_logger.handlers)


def configure_audit_logging(
    path: str,
    *,
    max_bytes: int,
    backup_count: int,
) -> bool:
    """Configure one dedicated rotating audit file handler idempotently."""
    if max_bytes <= 0 or backup_count < 0:
        raise ValueError("Audit rotation settings are invalid")

    owned_handlers = [
        handler for handler in _audit_logger.handlers if getattr(handler, "_moonlit_audit_handler", False)
    ]
    absolute_path = os.path.abspath(path)
    if (
        len(owned_handlers) == 1
        and owned_handlers[0].baseFilename == absolute_path
        and owned_handlers[0].maxBytes == max_bytes
        and owned_handlers[0].backupCount == backup_count
    ):
        return True

    try:
        handler = _AuditRotatingFileHandler(
            absolute_path,
            maxBytes=max_bytes,
            backupCount=backup_count,
            encoding="utf-8",
        )
    except Exception:
        _record_delivery_failure("configuration")
        return False

    for existing in owned_handlers:
        _audit_logger.removeHandler(existing)
        existing.close()
    for existing in list(_audit_logger.handlers):
        if isinstance(existing, logging.NullHandler):
            _audit_logger.removeHandler(existing)
    _audit_logger.addHandler(handler)
    _audit_logger.propagate = False
    return True


def _new_event_id() -> str:
    """Return a fresh, sortable audit-event ID."""
    return f"evt_{secrets.token_urlsafe(12)}"


def pseudonymize_audit_actor(actor: str, *, key: str | None = None) -> str:
    """Replace authenticated user IDs with a stable, non-reversible audit subject."""
    if not isinstance(actor, str) or not actor.startswith("user:"):
        return actor
    subject = actor.removeprefix("user:")
    if subject in {"", "anonymous", "unknown"}:
        return actor

    secret = (
        key
        or os.getenv("AUDIT_ACTOR_PSEUDONYM_KEY")
        or os.getenv("SECRET_KEY")
        or "moonlit-development-audit-subject"
    )
    digest = hmac.new(
        secret.encode("utf-8"),
        f"moonlit-audit-actor:{subject}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()[:32]
    return f"user:pseudo_{digest}"


def audit_log(
    *,
    actor: str,
    action: str,
    resource: str,
    outcome: str,
    details: Mapping[str, Any] | None = None,
    idempotency_key: str | None = None,
    request_id: str | None = None,
    actor_ip: str | None = None,
) -> None:
    """Emit a structured audit event.

    Args:
        actor: Identifier of the actor (e.g. ``"user:u-123"``,
            ``"system:vamp-maintenance"``, ``"agent:langgraph"``).
        action: Dotted action path (e.g. ``"sql.execute"``,
            ``"conversation.delete"``, ``"auth.login"``).
        resource: Identifier of the affected resource (e.g.
            ``"db:customers/query"``, ``"conversation:c-456"``).
        outcome: ``"success"``, ``"failure"``, or ``"denied"``.
        details: Optional mapping with action-specific metadata. PII and
            secrets are redacted automatically.
        idempotency_key: Optional de-duplication key (e.g. request ID).
        request_id: Optional correlation ID for cross-service tracing.
        actor_ip: Optional IP of the originating client.

    Notes:
        - Never raises; logging failures are swallowed.
        - Emits a single JSON line at INFO level on the ``audit`` logger.
    """
    try:
        safe_details = redact(dict(details)) if details else {}
        payload = {
            "event_id": _new_event_id(),
            "ts": time.time(),
            "actor": pseudonymize_audit_actor(actor),
            "action": action,
            "resource": resource,
            "outcome": outcome,
            "details": safe_details,
        }
        if idempotency_key:
            payload["idempotency_key"] = idempotency_key
        effective_request_id = request_id or current_request_id()
        if effective_request_id:
            payload["request_id"] = effective_request_id
        if actor_ip:
            payload["actor_ip"] = actor_ip
        payload["pid"] = os.getpid()
        _audit_logger.info(json.dumps(payload, separators=(",", ":"), default=str))
    except Exception:  # pragma: no cover - audit must never break request
        _record_delivery_failure("emitter")


__all__ = [
    "audit_delivery_failure_count",
    "audit_log",
    "audit_sink_configured",
    "configure_audit_logging",
    "pseudonymize_audit_actor",
]
