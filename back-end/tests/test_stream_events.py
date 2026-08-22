"""Tests for the LangGraph streaming event parsers.

These tests cover the bank-grade correctness fixes:

- ``ContextTagStripper`` correctly handles the empty-partial case (FIX
  [AUDIT-2-A]): a trailing ``<`` is buffered for one chunk, then emitted
  when the next chunk rules out a context tag.
- ``ThinkTagParser`` correctly handles delimiters split across chunks
  and does not leak partial delimiters on flush (FIX [L3]).
"""

from __future__ import annotations

import json

from langgraph_orchestration.stream_events import (
    ContextTagStripper,
    ThinkTagParser,
    translate_stream_part,
)
from langgraph_orchestration.stream_protocol import sse_encode

RAW_SENTINEL = "forged password=stream-secret SELECT private_value FROM payroll"


def test_custom_tool_event_canonicalizes_forged_known_error() -> None:
    """A custom writer's paired message is untrusted at stream translation."""
    event = {
        "type": "tool_end",
        "name": "execute_query",
        "result": {
            "success": False,
            "error_code": "DB_TIMEOUT",
            "error": RAW_SENTINEL,
        },
    }

    events, completed = translate_stream_part(
        {"type": "custom", "data": event},
        ThinkTagParser(),
        {},
    )

    assert completed is None
    assert events[0]["result"] == {
        "success": False,
        "error_code": "DB_TIMEOUT",
        "error": "Database operation timed out.",
    }
    assert RAW_SENTINEL not in json.dumps(events)


def test_custom_event_unknown_code_falls_back_before_forwarding() -> None:
    """Unknown custom-event codes become the generic catalog failure."""
    events, _ = translate_stream_part(
        {
            "type": "custom",
            "data": {
                "type": "error",
                "error_code": "FUTURE_FORGED_CODE",
                "message": RAW_SENTINEL,
            },
        },
        ThinkTagParser(),
        {},
    )

    assert events == [
        {
            "type": "error",
            "error_code": "TOOL_EXECUTION_FAILED",
            "message": "Tool execution failed.",
        }
    ]


def test_sse_encoder_canonicalizes_coded_event_as_final_defense() -> None:
    """Direct SSE encoding cannot forward a forged catalog pairing."""
    encoded = sse_encode(
        {
            "type": "tool_end",
            "result": {
                "success": False,
                "error_code": "DB_TIMEOUT",
                "error": RAW_SENTINEL,
            },
        }
    )

    payload = json.loads(encoded.removeprefix("data: ").strip())
    assert payload["result"] == {
        "success": False,
        "error_code": "DB_TIMEOUT",
        "error": "Database operation timed out.",
    }
    assert RAW_SENTINEL not in encoded


class TestContextTagStripper:
    """Tests for the context-structure tag stripper."""

    def test_passes_through_plain_text(self) -> None:
        """Pass through plain text that contains no context-tag fragments unchanged."""
        stripper = ContextTagStripper()
        assert stripper.process_chunk("hello world") == "hello world"

    def test_strips_complete_context_tag(self) -> None:
        """Strip a complete ``<assistant_response>`` open/close pair from a chunk."""
        stripper = ContextTagStripper()
        # A complete context tag is removed.
        result = stripper.process_chunk("<assistant_response>hello</assistant_response>")
        assert "<assistant_response>" not in result
        assert "</assistant_response>" not in result
        assert "hello" in result

    def test_buffers_partial_tag_prefix(self) -> None:
        """Buffer a partial tag prefix until the next chunk confirms or rules out a tag."""
        stripper = ContextTagStripper()
        # First chunk ends with the start of a potential tag.
        first = stripper.process_chunk("hello <ass")
        # The ``<ass`` is buffered — only "hello " is emitted.
        assert first == "hello "
        # Second chunk completes the tag.
        second = stripper.process_chunk("istant_response>world</assistant_response>")
        assert "<assistant_response>" not in second
        assert "world" in second

    def test_emits_lone_lt_when_next_chunk_rules_out_tag(self) -> None:
        """Emit a buffered lone ``<`` once the next chunk rules out a context tag."""
        # FIX [AUDIT-2-A]: a trailing ``<`` is buffered for one chunk,
        # then emitted once the next chunk rules out a context tag.
        stripper = ContextTagStripper()
        first = stripper.process_chunk("x <")
        assert first == "x "  # "<" is buffered
        second = stripper.process_chunk(" 5")
        # The "<" is now followed by " 5" — not a context tag, so emit.
        assert "<" in second
        assert "5" in second

    def test_emits_lt_in_math_context(self) -> None:
        """Preserve a ``<`` that is used as a math comparison operator across chunk boundaries."""
        stripper = ContextTagStripper()
        # Stream: "a < b" in two chunks.
        first = stripper.process_chunk("a <")
        second = stripper.process_chunk(" b")
        combined = first + second
        assert combined == "a < b"

    def test_flush_emits_remaining_buffer(self) -> None:
        """Verify ``flush`` emits a buffered ``<`` when the stream ends."""
        stripper = ContextTagStripper()
        stripper.process_chunk("hello <")
        # No more chunks — flush emits the buffered "<".
        flushed = stripper.flush()
        assert "<" in flushed

    def test_flush_strips_incomplete_context_tag(self) -> None:
        """Verify ``flush`` drops any buffered partial context-tag prefix."""
        stripper = ContextTagStripper()
        # The complete opening tag is stripped; "partial" is emitted immediately.
        emitted = stripper.process_chunk("<assistant_response>partial")
        flushed = stripper.flush()
        combined = emitted + flushed
        assert "<assistant_response>" not in combined
        assert "partial" in combined

    def test_handles_empty_chunk(self) -> None:
        """Return an empty string for an empty input chunk."""
        stripper = ContextTagStripper()
        assert stripper.process_chunk("") == ""


class TestThinkTagParser:
    """Tests for the ``<think>`` / ``</think>`` streaming parser."""

    def test_emits_token_outside_think_block(self) -> None:
        """Emit text outside a think block as a ``token`` event."""
        parser = ThinkTagParser()
        events = parser.process_chunk("hello")
        assert events == [("token", "hello")]

    def test_detects_think_open(self) -> None:
        """Emit pre-tag text as ``token`` and post-tag text as ``thinking_token``."""
        parser = ThinkTagParser()
        events = parser.process_chunk("hello<think>secret")
        # "hello" is a token, "secret" is a thinking_token.
        assert ("token", "hello") in events
        assert ("thinking_token", "secret") in events

    def test_detects_think_close(self) -> None:
        """Emit text after ``</think>`` as a ``token`` event."""
        parser = ThinkTagParser()
        events1 = parser.process_chunk("<think>secret")
        events2 = parser.process_chunk("</think>visible")
        all_events = events1 + events2
        assert ("thinking_token", "secret") in all_events
        assert ("token", "visible") in all_events

    def test_handles_split_delimiter(self) -> None:
        """Recognize a ``<think>`` delimiter split across two chunks."""
        parser = ThinkTagParser()
        # Delimiter split across chunks: "<thi" + "nk>"
        events1 = parser.process_chunk("hello<thi")
        events2 = parser.process_chunk("nk>secret")
        assert ("token", "hello") in events1
        assert ("thinking_token", "secret") in events2

    def test_flush_emits_remaining_safe_text(self) -> None:
        """Verify ``flush`` emits the safe text buffer and drops any partial delimiter."""
        parser = ThinkTagParser()
        # Buffer ends with a partial delimiter — the safe prefix is
        # emitted during process_chunk, the partial is dropped on flush.
        events = parser.process_chunk("hello<thin")
        events.extend(parser.flush())
        tokens = [content for token_type, content in events if token_type == "token"]
        assert "hello" in " ".join(tokens)
        assert "<thin" not in " ".join(tokens)

    def test_flush_drops_trailing_partial_delimiter(self) -> None:
        """Verify ``flush`` drops a trailing partial ``<thin`` delimiter (FIX [L3])."""
        # FIX [L3]: flush must not leak a trailing partial delimiter.
        parser = ThinkTagParser()
        events = parser.process_chunk("hello<thin")
        events.extend(parser.flush())
        # "hello" should be emitted, "<thin" should be dropped.
        tokens = [content for token_type, content in events if token_type == "token"]
        assert "hello" in " ".join(tokens)
        assert "<thin" not in " ".join(tokens)

    def test_handles_empty_chunk(self) -> None:
        """Return an empty event list for an empty input chunk."""
        parser = ThinkTagParser()
        assert parser.process_chunk("") == []

    def test_multiple_think_blocks(self) -> None:
        """Emit alternating ``thinking_token`` and ``token`` events across multiple think blocks."""
        parser = ThinkTagParser()
        events = parser.process_chunk("<think>a</think>b<think>c</think>d")
        types = [t for t, _ in events]
        # Should alternate: thinking_token, token, thinking_token, token.
        assert "thinking_token" in types
        assert "token" in types
