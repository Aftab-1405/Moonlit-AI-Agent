"""
SSE stream protocol — encode agent events as ``data: {...}\\n\\n`` lines.

Event types
-----------
  token          – LLM content token
  tool_start     – tool invocation begun
  tool_end       – tool invocation finished (includes UI result)
  ui_action      – guided frontend action for the browser UI
  agent_interrupt – graph paused for human input; resume with /resume_agent
  agent_step_limit_reached – total safety budget exhausted; task can be resumed
  thinking_token – reasoning/chain-of-thought token
  skills_activated – skill instructions loaded by the agent via read_skill
  error          – recoverable error message
  done           – stream complete

JSON encoding (FIX [L5])
------------------------
The previous implementation used ``json.dumps(event, default=str)``. The
``default=str`` fallback silently stringified any non-JSON-serializable
object — datetimes became ``"2024-01-01 00:00:00+00:00"`` (no ISO
timezone marker), ``Decimal('1.5')`` became the unusable string
``"Decimal('1.5')"``, and Pydantic models lost their typed structure.
The client received strings where it expected typed values and had no
way to detect the data corruption.

:sse_encode now uses :func:`_json_default`, which:
  - Serializes ``datetime`` / ``date`` to ISO 8601 (timezone-aware).
  - Converts ``Decimal`` to ``float`` (preserves numeric type).
  - Calls ``model_dump()`` on Pydantic v2 models (and ``dict()`` on
    Pydantic v1 models as a fallback).
  - Logs a warning and falls back to ``str()`` for anything else, so
    genuinely unexpected types are at least visible in metrics rather
    than silently corrupted.
"""

import json
import logging
from typing import Any, Dict

from core.errors import canonicalize_coded_error_payload

logger = logging.getLogger(__name__)


def _json_default(obj):
    """Typed fallback for :func:`json.dumps` — see module docstring (FIX [L5])."""
    from datetime import date, datetime
    from decimal import Decimal

    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    # Pydantic v2 models expose ``model_dump``; v1 models expose ``dict``.
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    if hasattr(obj, "dict") and callable(getattr(obj, "dict", None)):
        try:
            return obj.dict()
        except Exception:
            pass
    logger.warning(
        "SSE event contains non-serializable %s; str-casting as last resort",
        type(obj).__name__,
    )
    return str(obj)


def sse_encode(event: Dict[str, Any]) -> str:
    """Encode *event* dict as a single SSE ``data:`` line.

    FIX [L5]: Uses :func:`_json_default` instead of bare ``default=str``
    so datetimes, Decimals, and Pydantic models are serialized with
    their proper types instead of being silently stringified.
    """
    safe_event = canonicalize_coded_error_payload(event)
    if isinstance(safe_event.get("result"), dict):
        safe_event["result"] = canonicalize_coded_error_payload(safe_event["result"])
    return f"data: {json.dumps(safe_event, default=_json_default)}\n\n"


def sse_error(message: str) -> str:
    """Encode a recoverable ``error`` SSE event with the given message."""
    return sse_encode({"type": "error", "message": message})


def sse_done() -> str:
    """Encode the terminal ``done`` SSE event that closes the stream."""
    return sse_encode({"type": "done"})
