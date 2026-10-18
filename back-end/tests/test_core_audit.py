"""Tests for ``core.audit`` — structured audit-event emitter.

These tests verify the SOX/PCI-compliant audit log:

- Emits a single-line JSON record at INFO level.
- Redacts PII / secrets from the ``details`` payload.
- Never raises (best-effort logging).
- Includes the required SOX fields (event_id, ts, actor, action,
  resource, outcome, pid).
"""

from __future__ import annotations

import io
import json
import logging

import pytest

import core.audit as audit_module
from core.audit import audit_log, pseudonymize_audit_actor
from core.logging import bind_request_id, clear_request_id


@pytest.fixture
def audit_buffer():
    """Attach a buffer to the ``audit`` logger and yield it."""
    buf = io.StringIO()
    handler = logging.StreamHandler(buf)
    handler.setLevel(logging.INFO)
    audit_logger = logging.getLogger("audit")
    audit_logger.addHandler(handler)
    audit_logger.setLevel(logging.INFO)
    # Clear any cached handlers from prior tests.
    yield buf
    audit_logger.removeHandler(handler)


@pytest.fixture
def isolated_audit_logger():
    """Restore the process-global audit logger after sink-configuration tests."""
    audit_logger = logging.getLogger("audit")
    original_handlers = list(audit_logger.handlers)
    original_propagate = audit_logger.propagate
    yield audit_logger
    for handler in list(audit_logger.handlers):
        if handler not in original_handlers:
            audit_logger.removeHandler(handler)
            handler.close()
    audit_logger.handlers = original_handlers
    audit_logger.propagate = original_propagate


def _last_audit_record(buf: io.StringIO) -> dict:
    """Parse the last JSON line from the audit buffer."""
    lines = [line for line in buf.getvalue().strip().split("\n") if line.strip()]
    assert lines, "No audit record emitted"
    return json.loads(lines[-1])


class TestAuditLog:
    """Tests for the ``audit_log`` emitter."""

    def test_emits_single_json_line(self, audit_buffer: io.StringIO) -> None:
        """Emit a single JSON record with the supplied actor/action/resource/outcome."""
        audit_log(
            actor="user:u-123",
            action="sql.execute",
            resource="db:customers/query",
            outcome="success",
        )
        record = _last_audit_record(audit_buffer)
        assert record["actor"] == pseudonymize_audit_actor("user:u-123")
        assert "u-123" not in record["actor"]
        assert record["action"] == "sql.execute"
        assert record["resource"] == "db:customers/query"
        assert record["outcome"] == "success"

    def test_includes_required_sox_fields(self, audit_buffer: io.StringIO) -> None:
        """Verify every SOX-required field is present with the correct type."""
        audit_log(
            actor="user:u-123",
            action="auth.login",
            resource="session",
            outcome="success",
        )
        record = _last_audit_record(audit_buffer)
        for field in ("event_id", "ts", "actor", "action", "resource", "outcome", "pid"):
            assert field in record, f"Missing required field: {field}"
        assert isinstance(record["event_id"], str)
        assert isinstance(record["ts"], float)
        assert isinstance(record["pid"], int)

    def test_redacts_secrets_from_details(self, audit_buffer: io.StringIO) -> None:
        """Redact password from details while preserving non-sensitive fields."""
        audit_log(
            actor="user:u-123",
            action="db.connect",
            resource="db:customers",
            outcome="success",
            details={"password": "secret123", "user": "alice", "host": "db.example.com"},
        )
        record = _last_audit_record(audit_buffer)
        # password must be redacted.
        assert record["details"]["password"] == "***REDACTED***"
        # host is not sensitive and should be preserved.
        assert record["details"]["host"] == "db.example.com"
        # The raw secret must never appear in the serialized JSON.
        assert "secret123" not in audit_buffer.getvalue()

    def test_supports_optional_fields(self, audit_buffer: io.StringIO) -> None:
        """Include optional SOX fields (idempotency_key, request_id, actor_ip) when supplied."""
        audit_log(
            actor="user:u-123",
            action="sql.execute",
            resource="db:customers/query",
            outcome="failure",
            details={"reason": "timeout"},
            idempotency_key="req-abc-123",
            request_id="req-xyz-789",
            actor_ip="203.0.113.42",
        )
        record = _last_audit_record(audit_buffer)
        assert record["idempotency_key"] == "req-abc-123"
        assert record["request_id"] == "req-xyz-789"
        assert record["actor_ip"] == "203.0.113.42"

    def test_inherits_bound_request_id(self, audit_buffer: io.StringIO) -> None:
        """Correlate an HTTP audit event without requiring every caller to pass the request ID."""
        bind_request_id("req-core-002")
        try:
            audit_log(
                actor="user:u-123",
                action="settings.update",
                resource="user:settings",
                outcome="success",
            )
        finally:
            clear_request_id()

        assert _last_audit_record(audit_buffer)["request_id"] == "req-core-002"

    def test_explicit_request_id_overrides_bound_context(self, audit_buffer: io.StringIO) -> None:
        """Preserve explicit correlation IDs for non-HTTP callers and focused tests."""
        bind_request_id("req-context")
        try:
            audit_log(
                actor="user:u-123",
                action="settings.update",
                resource="user:settings",
                outcome="success",
                request_id="req-explicit",
            )
        finally:
            clear_request_id()

        assert _last_audit_record(audit_buffer)["request_id"] == "req-explicit"

    def test_never_raises_on_bad_details(self, audit_buffer: io.StringIO) -> None:
        """Fallback to str() when details contain an unserializable object."""

        # An unserializable object in details must not raise.
        class Unserializable:
            def __repr__(self):
                return "<unserializable>"

        # Should not raise — the emitter uses default=str fallback.
        audit_log(
            actor="user:u-123",
            action="test.action",
            resource="test:res",
            outcome="success",
            details={"obj": Unserializable()},
        )
        # Record should have been emitted (with str() fallback).
        assert audit_buffer.getvalue().strip()

    def test_never_raises_when_event_and_telemetry_sinks_both_fail(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Keep the user operation available even if both logging boundaries are unavailable."""

        def fail(*_args, **_kwargs) -> None:
            raise OSError("private-logging-failure")

        monkeypatch.setattr(audit_module._audit_logger, "info", fail)
        monkeypatch.setattr(audit_module._delivery_logger, "warning", fail)

        audit_log(
            actor="user:u-123",
            action="settings.update",
            resource="user:settings",
            outcome="success",
        )

    def test_event_id_is_unique(self, audit_buffer: io.StringIO) -> None:
        """Verify event_id values are unique across consecutive audit_log calls."""
        for _ in range(10):
            audit_log(
                actor="user:u-123",
                action="test.action",
                resource="test:res",
                outcome="success",
            )
        lines = [line for line in audit_buffer.getvalue().strip().split("\n") if line]
        event_ids = [json.loads(line)["event_id"] for line in lines]
        assert len(set(event_ids)) == 10, "event_id must be unique per call"


class TestAuditSink:
    """Tests for the dedicated rotating JSON-lines delivery boundary."""

    def test_configures_one_private_rotating_sink(
        self,
        tmp_path,
        isolated_audit_logger: logging.Logger,
    ) -> None:
        """Write one JSON line through one idempotently configured owner-only handler."""
        from core.audit import audit_sink_configured, configure_audit_logging

        audit_path = tmp_path / "audit.jsonl"

        assert configure_audit_logging(str(audit_path), max_bytes=4096, backup_count=2)
        assert configure_audit_logging(str(audit_path), max_bytes=4096, backup_count=2)
        assert audit_sink_configured()

        audit_log(
            actor="user:u-123",
            action="settings.update",
            resource="user:settings",
            outcome="success",
        )
        owned_handlers = [
            handler for handler in isolated_audit_logger.handlers if getattr(handler, "_moonlit_audit_handler", False)
        ]
        assert len(owned_handlers) == 1
        owned_handlers[0].flush()
        assert json.loads(audit_path.read_text(encoding="utf-8"))["action"] == "settings.update"
        assert audit_path.stat().st_mode & 0o777 == 0o600

    def test_sink_failure_is_counted_without_logging_the_payload(
        self,
        tmp_path,
        isolated_audit_logger: logging.Logger,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        """Expose a sink outage without copying the failed security event to ordinary logs."""
        from core.audit import (
            audit_delivery_failure_count,
            configure_audit_logging,
        )

        assert configure_audit_logging(
            str(tmp_path / "audit.jsonl"),
            max_bytes=4096,
            backup_count=2,
        )
        handler = next(
            item for item in isolated_audit_logger.handlers if getattr(item, "_moonlit_audit_handler", False)
        )
        before = audit_delivery_failure_count()
        failed_record = logging.LogRecord(
            "audit",
            logging.INFO,
            __file__,
            1,
            "private-audit-payload",
            (),
            None,
        )

        with caplog.at_level(logging.WARNING, logger="core.audit.delivery"):
            handler.handleError(failed_record)

        assert audit_delivery_failure_count() == before + 1
        rendered = " ".join(record.getMessage() for record in caplog.records)
        assert "Audit sink write failed" in rendered
        assert "private-audit-payload" not in rendered
