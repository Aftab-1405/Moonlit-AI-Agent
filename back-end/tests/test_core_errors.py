"""Tests for ``core.errors`` — DB error classification and safe diagnostics.

The bank-grade audit identified that raw DB driver errors leak schema
names, column names, and connection-string fragments to the API caller,
LLM tool output, and server diagnostics.
"""

from __future__ import annotations

import logging
from dataclasses import FrozenInstanceError

import pytest

import core.errors as error_module
from core.errors import (
    classify_db_error,
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
            ("Unknown column 'x' in 'field list'", "column_not_found"),
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
                "Unknown column 'x' in 'field list'",
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

    def test_public_tool_error_uses_catalog_message_for_known_code(self) -> None:
        """A known code can never be paired with caller-derived text."""
        public = error_module.public_tool_error(
            "DB_TIMEOUT",
            "forged password=do-not-return",
        )
        assert (public.code, public.message) == (
            "DB_TIMEOUT",
            "Database operation timed out.",
        )


@pytest.mark.parametrize(
    "raw_message,sentinel",
    [
        ("firebase token rejected: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
        ("cannot resolve customerhostsentinel", "customerhostsentinel"),
        ("password authentication failed: correcthorsebatterystaple", "correcthorsebatterystaple"),
        ("connect failed: fd00::1234", "fd00::1234"),
    ],
)
def test_safe_exception_log_never_renders_exception_message(
    caplog: pytest.LogCaptureFixture,
    raw_message: str,
    sentinel: str,
) -> None:
    """Correlated diagnostics retain metadata without rendering exception text."""
    logger = logging.getLogger("tests.safe-error")
    public = error_module.PublicError("DB_CONNECTION_ERROR", "Database connection failed.")
    bind_request_id("req_safe_error_test")
    try:
        with caplog.at_level(logging.ERROR, logger=logger.name):
            error_module.log_safe_exception(logger, "connect_database", RuntimeError(raw_message), public)
    finally:
        clear_request_id()

    record = caplog.records[-1]
    rendered = record.getMessage()
    assert sentinel not in rendered
    assert "detail=" not in rendered
    assert "connect_database" in rendered
    assert "RuntimeError" in rendered
    assert "DB_CONNECTION_ERROR" in rendered
    assert record.request_id == "req_safe_error_test"
    assert record.exc_info is None
