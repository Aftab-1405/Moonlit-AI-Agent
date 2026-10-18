"""Tests for ``core.logging`` — request-id / correlation-id context.

These tests verify the request-scoped logging context that lets an
operator trace a single request across the API → service → LangGraph →
DB layers.
"""

from __future__ import annotations

import logging
from io import StringIO

from core.logging import (
    REQUEST_ID_HEADER,
    bind_request_id,
    clear_request_id,
    current_request_id,
)


class TestRequestId:
    """Tests for the request-id context."""

    def test_bind_returns_inbound_id_when_valid(self) -> None:
        """Return the inbound request-id verbatim when it passes validation."""
        rid = bind_request_id("req-abc-123")
        assert rid == "req-abc-123"
        assert current_request_id() == "req-abc-123"
        clear_request_id()

    def test_bind_generates_fresh_id_when_no_inbound(self) -> None:
        """Generate a fresh ``req_``-prefixed id when no inbound id is supplied."""
        rid = bind_request_id(None)
        assert rid.startswith("req_")
        assert current_request_id() == rid
        clear_request_id()

    def test_bind_replaces_invalid_inbound(self) -> None:
        """Replace an inbound id containing disallowed characters with a fresh one."""
        # Special characters are not allowed — must be replaced.
        rid = bind_request_id("invalid!!id")
        assert rid.startswith("req_")
        assert rid != "invalid!!id"
        clear_request_id()

    def test_bind_replaces_non_ascii_alphanumeric_inbound(self) -> None:
        """Catch Unicode alphanumerics bypassing the documented ASCII allowlist."""
        rid = bind_request_id("requést-id")
        assert rid.startswith("req_")
        assert rid != "requést-id"
        clear_request_id()

    def test_bind_respects_max_length(self) -> None:
        """Replace an inbound id that exceeds the 64-character maximum."""
        rid = bind_request_id("a" * 65)  # 65 chars, max is 64
        assert rid.startswith("req_")
        clear_request_id()

    def test_clear_resets_context(self) -> None:
        """Verify ``clear_request_id`` removes the bound id from the context."""
        bind_request_id("req-test")
        clear_request_id()
        assert current_request_id() is None

    def test_clear_when_no_context_is_safe(self) -> None:
        """Calling ``clear_request_id`` with no bound id must not raise."""
        # Clearing when nothing is bound must not raise.
        clear_request_id()
        clear_request_id()

    def test_request_id_header_constant(self) -> None:
        """Verify the ``X-Request-ID`` header name constant."""
        assert REQUEST_ID_HEADER == "X-Request-ID"

    def test_request_id_appears_in_log_records(self, caplog) -> None:
        """Verify the bound request_id is attached to root-logger log records."""
        from core.logging import install_request_id_filter

        root_logger = logging.getLogger()
        bind_request_id("req-log-test")
        try:
            with caplog.at_level(logging.INFO):
                install_request_id_filter()
                root_logger.info("hello")
            assert any(getattr(record, "request_id", None) == "req-log-test" for record in caplog.records), (
                f"request_id should be attached to log records; "
                f"got: {[getattr(r, 'request_id', None) for r in caplog.records]}"
            )
        finally:
            clear_request_id()

    def test_install_filter_enriches_propagated_child_records_exactly_once(self) -> None:
        """Catch child-logger records bypassing a filter attached only to root."""
        from core.logging import install_request_id_filter

        output = StringIO()
        handler = logging.StreamHandler(output)
        handler.setFormatter(logging.Formatter("request_id=%(request_id)s - %(message)s"))
        root_logger = logging.getLogger()
        child_logger = logging.getLogger("tests.request_id.child")
        root_logger.addHandler(handler)
        child_logger.setLevel(logging.INFO)

        try:
            install_request_id_filter()
            install_request_id_filter()
            bind_request_id("req-child-log")
            child_logger.info("correlated message")

            request_id_filters = [item for item in handler.filters if item.__class__.__name__ == "_RequestIdFilter"]
            assert len(request_id_filters) == 1
            assert "request_id=req-child-log" in output.getvalue()
            assert "correlated message" in output.getvalue()
        finally:
            clear_request_id()
            root_logger.removeHandler(handler)
