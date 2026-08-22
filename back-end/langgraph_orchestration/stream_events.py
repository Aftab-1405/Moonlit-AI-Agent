"""Pure translation helpers for LangGraph stream parts and SSE events.

This module owns the translation layer between LangGraph's internal v2
stream parts (``messages``, ``custom``, ``updates``) and the public SSE
event schema consumed by the browser UI. It is intentionally stateless
aside from :class:`ThinkTagParser`, which tracks the partial-delimiter
state that arises from chunked model output.
"""

from __future__ import annotations

import re

from langchain_core.messages import AIMessage, AIMessageChunk

from core.errors import canonicalize_coded_error_payload
from langgraph_orchestration.context_usage import build_usage_metrics

# ENH [TAG-STRIP]: Context-structure tags that should NEVER appear in the
# model's output. These are internal envelopes used to structure the model's
# INPUT — if the model mimics them in its output, they must be stripped
# before reaching the user. The model is instructed not to emit these
# (prompt_builder.py <response_rules>), but some models (especially Mistral
# Devstral) occasionally ignore the instruction. This is the safety net.
_CONTEXT_STRUCTURE_TAGS = [
    "assistant_response",
    "previous_assistant_turn",
    "previous_user_turn",
    "current_user_request",
    "system_instructions",
    "context_structure",
    "context_map",
    "retrieved_long_term_memory",
    "ongoing_task_checkpoint",
    "available_skills",
    "loaded_skill",
    "tool_selection_guide",
    "stop_conditions",
    "current_session_state",
    "memory_handling_rules",
    "response_rules",
    "evidence_and_hallucination_rules",
    "query_result_display_rules",
    "global_rules",
    "interaction_persona",
    "supported_scope",
    "identity",
    "authority",
    "source_and_recency",
    "memory_summaries",
    "user_quote",
    "skill_instructions",
    "usage_rule",
    "purpose",
    "previous_tool_activity",
    "system_nudge",
]

# Build a regex that matches any opening or closing context-structure tag
# Examples it matches: <assistant_response>, </assistant_response>,
#   <previous_assistant_turn turn="3">, </current_user_request>
_CONTEXT_TAG_PATTERN = re.compile(
    r"</?(?:" + "|".join(_CONTEXT_STRUCTURE_TAGS) + r")(?:\s[^>]*)?>",
    re.IGNORECASE,
)


class ContextTagStripper:
    """Streaming-safe stripper for leaked context-structure XML tags.

    ENH [TAG-STRIP]: Some models (especially Mistral Devstral) occasionally
    mimic the context-structure tags they see in their input (e.g.,
    wrapping their response in <assistant_response>...</assistant_response>).
    The system prompt instructs them not to, but this is a safety net.

    Streaming-safe: buffers text that ends with a partial tag prefix (e.g.,
    "<assistan") and only emits text once it's clear the partial prefix
    is NOT the start of a context-structure tag.
    """

    def __init__(self) -> None:
        self.buffer = ""

    def process_chunk(self, chunk: str) -> str:
        """Process a chunk and return text safe to emit to the user.

        Returns the text with any complete context-structure tags removed.
        Partial tag prefixes at the end are buffered until the next chunk.

        FIX [AUDIT-2-A]: the previous condition
        ``tag.startswith(partial[1:]) or partial[1:].startswith(tag)``
        was always True when ``partial[1:]`` was empty (because
        ``str.startswith("")`` is True for any string), causing every
        trailing ``<`` to be buffered even when the next chunk made it
        clear the ``<`` was a math/comparison operator. The second
        ``or`` clause was also semantically wrong: it checked whether
        the partial already contained a full tag name as a prefix,
        which is irrelevant to deciding whether to buffer. The new
        check is a single ``tag.startswith(partial[1:])`` — the
        partial is a prefix of some context tag — which correctly
        handles both the empty-partial case (buffer the ``<`` for one
        chunk) and the non-tag case (emit as soon as the next char
        rules out every context tag).
        """
        if not chunk:
            return ""
        self.buffer += chunk

        # Remove any complete context-structure tags
        self.buffer = _CONTEXT_TAG_PATTERN.sub("", self.buffer)

        # Check if the buffer ends with a partial tag prefix that could
        # be the start of a context-structure tag. If so, hold it back.
        # We check for "<" followed by up to 30 chars that could be a tag name.
        safe_end = len(self.buffer)
        for i in range(len(self.buffer) - 1, max(-1, len(self.buffer) - 32), -1):
            if self.buffer[i] == "<":
                # Found a potential tag start — check if it could be a context tag.
                partial_after_lt = self.buffer[i + 1 :].lower()
                # FIX [AUDIT-2-A]: only buffer if some context tag starts
                # with the partial. The empty-partial case (buffer ends
                # with exactly "<") is True here, which is correct: we
                # must wait one chunk to see whether "<" is the start of
                # a context tag. The next chunk will either complete the
                # tag (regex strips it) or rule it out (we emit "<").
                could_be_tag = any(tag.startswith(partial_after_lt) for tag in _CONTEXT_STRUCTURE_TAGS)
                if could_be_tag:
                    safe_end = i
                break  # Only check the last "<"

        safe_text = self.buffer[:safe_end]
        self.buffer = self.buffer[safe_end:]
        return safe_text

    def flush(self) -> str:
        """Emit any remaining buffered text. Called when the stream ends."""
        # Remove any remaining context tags (in case of incomplete stream)
        result = _CONTEXT_TAG_PATTERN.sub("", self.buffer)
        self.buffer = ""
        return result


class ThinkTagParser:
    """Streaming parser for ``<think>`` / ``</think>`` blocks.

    Why a streaming parser?
    -----------------------
    Bedrock (and most LLM providers) emit model output as a sequence of
    short ``AIMessageChunk`` deltas. A ``<think>`` or ``</think>``
    delimiter may be SPLIT across two chunks (e.g., chunk N ends with
    ``"<thi"`` and chunk N+1 starts with ``"nk>"``). Naively scanning
    each chunk in isolation would (a) fail to detect the delimiter and
    (b) leak the partial ``"<thi"`` text as a token to the client.

    Algorithm
    ---------
    - Maintain a ``buffer`` of unprocessed text and an ``in_think_block``
      flag.
    - For each chunk, append to the buffer, then loop:
        * Look for the active delimiter (``<think>`` or ``</think>``).
        * If found, emit any text BEFORE it as a token (or
          ``thinking_token`` if inside a think block), flip
          ``in_think_block``, and continue with the remainder.
        * If not found, compute the longest suffix of the buffer that
          is also a PREFIX of the delimiter (via
          :func:`_delimiter_suffix_length`). The buffer up to that
          suffix is safe to emit; the suffix itself is held back until
          the next chunk arrives (or :meth:`flush` runs).
    - On :meth:`flush`, the remaining buffer is emitted — but see FIX
      [L3] below for the partial-delimiter guard.

    FIX [L3]: ``flush()`` previously returned the entire buffer as a
    single ``token`` event, which leaked any trailing partial delimiter
    (e.g., buffer = ``"some text<thin"`` was rendered to the client
    verbatim). The fix detects a trailing partial delimiter on flush
    and emits only the safe prefix, dropping the partial bytes so they
    never reach the UI.
    """

    def __init__(self) -> None:
        self.in_think_block = False
        self.buffer = ""

    def process_chunk(self, chunk: str) -> list[tuple[str, str]]:
        if not chunk:
            return []
        self.buffer += chunk
        results: list[tuple[str, str]] = []
        while self.buffer:
            delimiter = "</think>" if self.in_think_block else "<think>"
            token_type = "thinking_token" if self.in_think_block else "token"
            delimiter_index = self.buffer.find(delimiter)
            if delimiter_index >= 0:
                if delimiter_index:
                    results.append((token_type, self.buffer[:delimiter_index]))
                self.buffer = self.buffer[delimiter_index + len(delimiter) :]
                self.in_think_block = not self.in_think_block
                continue

            partial_length = _delimiter_suffix_length(self.buffer, delimiter)
            safe_length = len(self.buffer) - partial_length
            if safe_length:
                results.append((token_type, self.buffer[:safe_length]))
                self.buffer = self.buffer[safe_length:]
            break
        return results

    def flush(self) -> list[tuple[str, str]]:
        """Emit any remaining buffered text as a final event.

        FIX [L3]: Detect a trailing partial delimiter on flush and emit
        only the safe prefix, dropping the partial bytes. The previous
        implementation returned the entire buffer verbatim, so a stream
        ending with ``"some text<thin"`` would render ``"<thin"`` to the
        client as if it were model output. The dropped bytes are
        intentionally discarded — they could not have been meaningful
        model output (they were awaiting a delimiter completion that
        never came).
        """
        if not self.buffer:
            return []
        token_type = "thinking_token" if self.in_think_block else "token"
        delimiter = "</think>" if self.in_think_block else "<think>"
        partial_length = _delimiter_suffix_length(self.buffer, delimiter)
        safe_text = self.buffer[: len(self.buffer) - partial_length]
        self.buffer = ""
        if not safe_text:
            return []
        return [(token_type, safe_text)]


def _delimiter_suffix_length(value: str, delimiter: str) -> int:
    """Return the length of the trailing ``value`` suffix that prefixes ``delimiter``."""
    for length in range(min(len(delimiter) - 1, len(value)), 0, -1):
        if value.endswith(delimiter[:length]):
            return length
    return 0


def translate_stream_part(
    part: dict,
    think_parser: ThinkTagParser,
    budget_info: dict,
) -> tuple[list[dict], dict | None]:
    """Translate one LangGraph v2 part into public events.

    ``budget_info`` is updated in place because output-token counters span model
    calls inside one tool loop.
    """
    part_type = part.get("type")
    if part_type == "messages":
        data = part.get("data")
        if not isinstance(data, (tuple, list)) or not data:
            return [], None
        message = data[0]
        if not isinstance(message, (AIMessageChunk, AIMessage)):
            return [], None
        return _translate_message(message, think_parser, budget_info), None

    if part_type == "custom":
        event = part.get("data")
        if not isinstance(event, dict):
            return [], None
        event = canonicalize_coded_error_payload(event)
        if isinstance(event.get("result"), dict):
            event["result"] = canonicalize_coded_error_payload(event["result"])
        completed_tool = None
        if event.get("type") == "tool_end":
            result = event.get("result")
            if event.get("name") == "execute_query" and isinstance(result, dict) and result.get("success", True):
                completed_tool = event
        return [event], completed_tool

    if part_type == "updates":
        interrupt = extract_interrupt_event(part.get("data"))
        return ([interrupt] if interrupt else []), None

    return [], None


def _translate_message(
    message: AIMessage | AIMessageChunk,
    think_parser: ThinkTagParser,
    budget_info: dict,
) -> list[dict]:
    events: list[dict] = []
    response_metadata = getattr(message, "response_metadata", {}) or {}
    usage_metadata = getattr(message, "usage_metadata", {}) or {}
    metrics = response_metadata.get("metrics", {})
    usage = response_metadata.get("usage", {})
    stop_reason = response_metadata.get("stopReason")
    if stop_reason == "model_context_window_exceeded":
        raise RuntimeError("model_context_window_exceeded")

    input_tokens = usage_metadata.get("input_tokens") or usage.get("inputTokens")
    output_tokens = usage_metadata.get("output_tokens") or usage.get("outputTokens")
    total_tokens = usage_metadata.get("total_tokens") or usage.get("totalTokens")
    latency_ms = metrics.get("latencyMs")

    # ENH [TOK]: Derive input_tokens from total - output when the model
    # returns total_tokens but not input_tokens directly. Some Bedrock
    # model variants omit input_tokens while still providing total_tokens.
    if input_tokens is None and total_tokens is not None and output_tokens is not None:
        input_tokens = max(0, total_tokens - output_tokens)

    # Store the complete input payload reported by the provider. This drives
    # modelPercent only; activePercent is based on the independently counted
    # unsummarized conversation tail.
    #
    # Use max() within one turn because later tool-loop model invocations
    # include earlier tool activity and therefore represent the peak payload.
    if input_tokens is not None:
        new_payload = int(input_tokens)
        prev_payload = int(budget_info.get("input_payload_tokens") or 0)
        budget_info["input_payload_tokens"] = max(prev_payload, new_payload)

    if total_tokens is not None or latency_ms is not None:
        events.append(
            build_usage_metrics(
                budget_info,
                inputTokens=input_tokens,
                outputTokens=output_tokens,
                totalTokens=total_tokens,
                latencyMs=latency_ms,
                stopReason=stop_reason,
            )
        )

    content = message.content
    if isinstance(content, str):
        events.extend(_text_events(content, think_parser))
        return events
    if not isinstance(content, list):
        return events

    for block in content:
        if not isinstance(block, dict):
            if block:
                events.append({"type": "token", "content": str(block)})
            continue
        block_type = block.get("type")
        if block_type == "thinking":
            thinking = block.get("thinking", "")
            if thinking:
                events.append({"type": "thinking_token", "content": str(thinking)})
        elif block_type == "reasoning_content":
            reasoning = block.get("reasoning_content", {})
            if isinstance(reasoning, dict):
                thinking = reasoning.get("text") or reasoning.get("reasoningText")
                if thinking:
                    events.append({"type": "thinking_token", "content": str(thinking)})
        elif block_type == "text":
            events.extend(_text_events(str(block.get("text", "")), think_parser))
    return events


def _text_events(text: str, parser: ThinkTagParser) -> list[dict]:
    """Translate one text chunk into ``token``/``thinking_token`` events."""
    return [{"type": token_type, "content": content} for token_type, content in parser.process_chunk(text)]


def extract_interrupt_event(data) -> dict | None:
    """Extract the first ``agent_interrupt`` event from a LangGraph updates part."""
    if not isinstance(data, dict) or "__interrupt__" not in data:
        return None
    interrupts = data.get("__interrupt__") or []
    if not interrupts:
        return None
    first = interrupts[0]
    payload = getattr(first, "value", first)
    interrupt_id = getattr(first, "id", None)
    if not isinstance(payload, dict):
        payload = {"message": str(payload)}
    return {"type": "agent_interrupt", "id": interrupt_id, "payload": payload}


def friendly_error(raw: str) -> str:
    """Map a raw provider error string to a user-facing recovery message."""
    lower = raw.lower()
    if "model_context_window_exceeded" in lower or "context window" in lower:
        # WENH [2]: Updated message to be accurate — compaction runs in the
        # exception handler now (see stream_conversation.py), but if it
        # failed, the user should know to simplify their request. The
        # previous message ("The task checkpoint was preserved; continue the
        # task to resume from compacted context.") was misleading because
        # the user has no way to "continue the task" mid-error and
        # compaction may not have run at all.
        return (
            "The conversation context grew too large. Compaction has been "
            "triggered — please retry your request. If it fails again, try "
            "simplifying your query or starting a new conversation."
        )
    if "429" in lower or "rate_limit" in lower or "too_many_requests" in lower:
        return "Rate limit exceeded. Please wait a moment and try again."
    if "401" in lower or "authentication" in lower or "unauthorized" in lower:
        return "Authentication error. Please contact support."
    if "503" in lower or "service unavailable" in lower:
        return "AI service is temporarily unavailable. Please try again later."
    if "timeout" in lower or "timed out" in lower:
        return "Request timed out. Please try a simpler query."
    if "connection" in lower:
        return "Unable to connect to AI service. Check your internet connection."
    return "Something went wrong. Please try again."
