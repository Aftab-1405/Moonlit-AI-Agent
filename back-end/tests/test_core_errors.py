"""Tests for ``core.errors`` — DB error classification and sanitization.

The bank-grade audit identified that raw DB driver errors leak schema
names, column names, and connection-string fragments to the API caller
and to the LLM in tool output. These tests verify the sanitization
helper strips every documented leakage vector.
"""

from __future__ import annotations

import logging
from dataclasses import FrozenInstanceError

import pytest

import core.errors as error_module
from core.errors import (
    classify_db_error,
    sanitize_error_message,
    sanitize_exception,
)
from core.logging import bind_request_id, clear_request_id


class TestClassifyDbError:
    """Tests for the stable error-category classifier."""

    @pytest.mark.parametrize(
        "message,expected",
        [
            ('relation "users" does not exist', "table_not_found"),
            ("table or view does not exist", "table_not_found"),
            ("unknown table 'foo'", "table_not_found"),
            ('column "foo" does not exist', "column_not_found"),
            ("invalid column name 'foo'", "column_not_found"),
            ("permission denied for table users", "permission_denied"),
            ("access denied for user 'bob'@'localhost'", "permission_denied"),
            ("insufficient privilege", "permission_denied"),
            ("statement timeout", "timeout"),
            ("max_execution_time exceeded", "timeout"),
            ("canceling statement due to timeout", "timeout"),
            ("deadlock detected", "deadlock"),
            ("violates foreign key constraint", "constraint_violation"),
            ("violates unique constraint", "constraint_violation"),
            ("violates not-null constraint", "constraint_violation"),
            ("violates check constraint", "constraint_violation"),
            ("duplicate key value violates unique constraint", "constraint_violation"),
            ("syntax error at or near", "syntax_error"),
            ("connection refused", "connection_error"),
            ("server closed the connection unexpectedly", "connection_error"),
            ("lost connection to MySQL server", "connection_error"),
            ("too many connections", "connection_error"),
            ("random unmapped error", "unknown"),
            ("", "unknown"),
        ],
    )
    def test_classifies_known_patterns(self, message: str, expected: str) -> None:
        """Verify the parametrized table maps each DB error message to its stable category."""
        assert classify_db_error(message) == expected


class TestSanitizeErrorMessage:
    """Tests for the PII-safe error formatter."""

    def test_strips_connection_string(self) -> None:
        """Replace embedded connection strings with a ``[connection-string]`` placeholder."""
        msg = "Error connecting to postgresql://user:secret@host:5432/db"
        result = sanitize_error_message(msg)
        assert "secret" not in result
        assert "[connection-string]" in result

    def test_strips_key_value_credentials(self) -> None:
        """Redact ``password=`` and ``user=`` style credentials from free-form text."""
        msg = "host=db.example.com password=hunter2 user=admin"
        result = sanitize_error_message(msg)
        assert "hunter2" not in result
        assert "admin" not in result
        assert "[redacted]" in result

    def test_strips_filesystem_paths(self) -> None:
        """Replace filesystem paths with a ``[path]`` placeholder."""
        msg = "Error in /home/user/app/config.py at line 42"
        result = sanitize_error_message(msg)
        assert "[path]" in result
        assert "/home/user/app/config.py" not in result

    def test_truncates_long_messages(self) -> None:
        """Truncate messages longer than max_length with an ellipsis character."""
        msg = "x" * 1000
        result = sanitize_error_message(msg)
        assert len(result) <= 281  # max_length + ellipsis char
        assert result.endswith("…")

    def test_preserves_short_safe_messages(self) -> None:
        """Pass through short messages that contain no leakage patterns unchanged."""
        msg = "Column not found"
        assert sanitize_error_message(msg) == "Column not found"

    def test_handles_empty(self) -> None:
        """Return an empty string for an empty input."""
        assert sanitize_error_message("") == ""


class TestSanitizeException:
    """Tests for the exception-formatter wrapper."""

    def test_extracts_message(self) -> None:
        """Extract the exception's message and sanitize embedded credentials."""
        exc = RuntimeError("host=db.example.com password=secret")
        result = sanitize_exception(exc)
        assert "secret" not in result

    def test_does_not_include_traceback(self) -> None:
        """Verify the sanitized exception text excludes the traceback frames."""
        try:
            raise ValueError("sensitive info")
        except ValueError as exc:
            result = sanitize_exception(exc)
        assert "Traceback" not in result
        assert "sensitive info" in result  # value preserved (no leakage pattern)


class TestPublicError:
    """Tests for stable, immutable error values crossing public boundaries."""

    @pytest.mark.parametrize(
        "raw_message,expected",
        [
            (
                'relation "private_payroll" does not exist password=super-secret',
                ("DB_TABLE_NOT_FOUND", "The requested table or view was not found."),
            ),
            (
                'column "salary" does not exist at host=private-db.internal',
                ("DB_COLUMN_NOT_FOUND", "The requested column was not found."),
            ),
            (
                "permission denied dsn=postgresql://admin:secret@private-db.local/payroll",
                ("DB_PERMISSION_DENIED", "Database permission denied."),
            ),
            (
                "statement timeout while running SELECT * FROM private_payroll",
                ("DB_TIMEOUT", "Database operation timed out."),
            ),
            (
                "deadlock detected request_id=provider-request-secret",
                (
                    "DB_DEADLOCK",
                    "Database operation could not complete due to a deadlock.",
                ),
            ),
            (
                "duplicate key violates unique constraint /srv/moonlit/private.sql",
                (
                    "DB_CONSTRAINT_VIOLATION",
                    "Database constraint rejected the operation.",
                ),
            ),
            (
                "syntax error near SELECT secret_column FROM private_table",
                ("DB_SYNTAX_ERROR", "Database query syntax is invalid."),
            ),
            (
                "connection refused by 10.12.4.8 password=network-secret",
                ("DB_CONNECTION_ERROR", "Database connection failed."),
            ),
            (
                "driver exploded token=unknown-secret /opt/moonlit/config.py",
                ("DB_OPERATION_FAILED", "Database operation failed."),
            ),
        ],
    )
    def test_database_exceptions_map_to_stable_public_errors(
        self,
        raw_message: str,
        expected: tuple[str, str],
    ) -> None:
        """Changing DB classification or exposing raw detail breaks the public contract."""
        result = error_module.public_database_error(RuntimeError(raw_message))

        assert (result.code, result.message) == expected
        assert all(
            secret not in f"{result.code} {result.message}"
            for secret in (
                "super-secret",
                "private_payroll",
                "salary",
                "private-db",
                "provider-request-secret",
                "private_table",
                "network-secret",
                "unknown-secret",
            )
        )

    def test_public_error_is_immutable(self) -> None:
        """Mutating a shared public mapping would destabilize later responses."""
        public = error_module.public_tool_error(
            "TOOL_EXECUTION_FAILED",
            "Tool execution failed.",
        )

        with pytest.raises(FrozenInstanceError):
            public.message = "raw failure"  # type: ignore[misc]

    def test_public_tool_error_preserves_the_declared_stable_contract(self) -> None:
        """Tool boundaries receive exactly the explicitly selected safe code/message."""
        public = error_module.public_tool_error(
            "TOOL_EXECUTION_FAILED",
            "Tool execution failed.",
        )
        assert (public.code, public.message) == (
            "TOOL_EXECUTION_FAILED",
            "Tool execution failed.",
        )


def test_safe_exception_log_is_sanitized_and_correlated(caplog: pytest.LogCaptureFixture) -> None:
    """Raw diagnostic fields must not leak even though useful correlation is retained."""
    logger = logging.getLogger("tests.safe-error")
    public = error_module.PublicError(
        "DB_PERMISSION_DENIED",
        "Database permission denied.",
    )
    raw = (
        "permission denied password=log-secret "
        "postgresql://admin:dsn-secret@private-db.internal/payroll "
        "SELECT salary FROM private_payroll "
        "/srv/moonlit/secrets.env x-amzn-requestid=provider-secret"
    )
    bind_request_id("req_safe_error_test")
    try:
        with caplog.at_level(logging.ERROR, logger=logger.name):
            error_module.log_safe_exception(
                logger,
                "execute_query",
                RuntimeError(raw),
                public,
            )
    finally:
        clear_request_id()

    record = caplog.records[-1]
    rendered = record.getMessage()
    assert "execute_query" in rendered
    assert "RuntimeError" in rendered
    assert "DB_PERMISSION_DENIED" in rendered
    assert "detail=" in rendered
    assert record.request_id == "req_safe_error_test"
    assert record.exc_info is None
    for secret in (
        "log-secret",
        "dsn-secret",
        "private-db.internal",
        "SELECT salary FROM private_payroll",
        "/srv/moonlit/secrets.env",
        "provider-secret",
    ):
        assert secret not in rendered
