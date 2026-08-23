"""
Conversation Streaming Service - Handles real-time AI response streaming, SSE parsing, and Firestore serialization.

Streaming lifecycle
-------------------
``create_streaming_generator`` is the heart of every chat / resume
request. It:

1. Loads the existing conversation (or seed-creates it) and verifies
   ownership.
2. Persists the user prompt as the first message of a new turn (lazy —
   deferred until the first non-empty agent event so we don't write a
   turn that immediately fails).
3. Streams SSE events from the LangGraph agent
   (:func:`agent_streamer.stream`) line-by-line. As events arrive we
   classify them (token / tool_start / tool_end / thinking / done /
   usage / interrupt / error) and accumulate an ``ordered_timeline``
   that mirrors what the frontend's eventTimeline will render.
4. On normal completion OR mid-stream abort (``CancelledError`` /
   ``GeneratorExit``), the accumulated timeline is persisted to
   Firestore as the assistant message (FIX [L6] ensures
   ``GeneratorExit`` propagates so the cleanup actually runs).
5. If the stream produced no content and no tools, ``has_fatal_error``
   is set and NO assistant message is persisted (the user's prompt
   remains as the last message and the UI shows the error event).

SSE event handling
------------------
``_parse_sse_event`` is the single point of JSON decoding for the SSE
``data: {…}\\n\\n`` wire format. Anything that isn't a ``data:`` line
is passed through verbatim (e.g. heartbeat comments).

Partial-response persistence
----------------------------
When the user closes the tab mid-stream, the underlying generator
receives ``GeneratorExit``. We persist whatever was streamed so far
plus a trailing ``_(Response stopped by user)_`` marker so the
conversation history reflects reality and the user can resume from the
interruption.
"""

import asyncio
import json
import logging
import uuid
from typing import AsyncGenerator, Optional

from fastapi.concurrency import run_in_threadpool

from api_contract.run_context import ResolvedRunPolicy
from core.errors import log_safe_exception, public_tool_error

logger = logging.getLogger(__name__)


def _build_tool_trace_summary(timeline: list[dict]) -> str | None:
    """Build a short human-readable summary of the tool calls in ``timeline``."""
    tools = [item for item in timeline if item.get("type") == "tool"]
    if not tools:
        return None
    summary_parts = []
    for t in tools:
        name = t.get("name", "unknown")
        status = t.get("status", "unknown")
        summary_parts.append(f"{name} ({status})")
    return "Tool activity: " + ", ".join(summary_parts)


def _parse_sse_event(sse_line: str) -> Optional[dict]:
    """Extract the JSON dict from a ``data: {…}\\n\\n`` SSE line.

    Returns ``None`` for non-``data:`` lines (e.g. heartbeat comments)
    so the caller can pass them through verbatim. ``[DONE]`` is mapped
    to ``{"type": "done"}`` for ergonomic handling.
    """
    line = sse_line.strip()
    if not line.startswith("data: "):
        return None
    payload = line[6:].strip()
    if not payload or payload == "[DONE]":
        return {"type": "done"}
    try:
        return json.loads(payload)
    except (json.JSONDecodeError, ValueError):
        return None


def _make_sse_error(message: str) -> str:
    """Build a single SSE error event string."""
    return f"data: {json.dumps({'type': 'error', 'message': message})}\n\n"


def _classify_error(raw: str) -> str:
    """Map a raw error string to a user-safe message."""
    lower = raw.lower()
    if "rate_limit" in lower or "quota" in lower or "429" in lower:
        return "API rate limit exceeded. Please wait a moment and try again."
    if "authentication" in lower or "401" in lower:
        return "Authentication error. Please check API keys."
    return "AI service error. Please try again."


class ConversationStreamingService:
    """Handles the streaming generation lifecycle and event serialization."""

    @staticmethod
    async def create_streaming_generator(
        conversation_id: str,
        prompt: str | None,
        user_id: str,
        run_policy: ResolvedRunPolicy,
        db_config: dict = None,
        enable_reasoning: bool = True,
        reasoning_effort: str = "medium",
        response_style: str = "balanced",
        max_rows: int = None,
        api_key: str = None,
        resume: dict | None = None,
    ) -> AsyncGenerator[str, None]:
        """Consume SSE events from the LangGraph agent, persist them, and pass them through to the client.

        Yields SSE ``data: {…}\\n\\n`` strings. See the module docstring for
        the full lifecycle description.
        """
        from service.conversations.agent_streaming import (
            get_default_agent_streamer,
        )
        from service.conversations.conversation_repository import (
            ConversationRepository,
        )

        prompt_stored = False
        response_stored = False
        current_turn_id = None
        current_turn_index = None
        # Ordered timeline mirrors the frontend's eventTimeline exactly.
        ordered_timeline: list[dict] = []
        was_aborted = False
        # has_fatal_error: True only when an unrecoverable error occurred BEFORE
        # any content was produced (e.g. PermissionError, startup failure).
        has_fatal_error = False
        last_usage_metrics = None

        try:
            conv_data = await run_in_threadpool(ConversationRepository.get, conversation_id)
            if conv_data and conv_data.get("user_id") != user_id:
                raise PermissionError("User does not own this conversation")

            if resume is not None and conv_data and conv_data.get("messages"):
                last_msg = conv_data["messages"][-1]
                current_turn_id = last_msg.get("turn_id")
                current_turn_index = last_msg.get("turn_index")

            def ensure_turn_metadata() -> tuple[str, int]:
                nonlocal current_turn_id, current_turn_index
                if current_turn_id is None:
                    current_turn_id = str(uuid.uuid4())
                if current_turn_index is None:
                    existing_messages = conv_data.get("messages", []) if conv_data else []
                    max_turn_index = -1
                    for msg in existing_messages:
                        ti = msg.get("turn_index")
                        if ti is not None:
                            try:
                                max_turn_index = max(max_turn_index, int(ti))
                            except (ValueError, TypeError):
                                pass
                    current_turn_index = max_turn_index + 1
                return current_turn_id, current_turn_index

            async def store_prompt_once() -> None:
                nonlocal prompt_stored
                if not prompt or prompt_stored:
                    return
                turn_id, turn_index = ensure_turn_metadata()
                await run_in_threadpool(
                    ConversationRepository.store_message,
                    conversation_id,
                    "user",
                    prompt,
                    user_id,
                    turn_id=turn_id,
                    turn_index=turn_index,
                    message_role="user",
                    is_final_assistant_response=False,
                )
                prompt_stored = True

            # Establish the conversation and persist the user turn before
            # orchestration touches task/checkpoint state.
            await store_prompt_once()
            if prompt_stored or conv_data:
                try:
                    from service.firestore.firestore_service import FirestoreService

                    db = FirestoreService.get_db()
                    await run_in_threadpool(
                        db.collection("conversations").document(conversation_id).update,
                        {"task_mode": run_policy.task_mode},
                    )
                except Exception as e:
                    public = public_tool_error(
                        "CONVERSATION_TASK_MODE_SAVE_FAILED",
                        "Conversation task mode could not be saved.",
                    )
                    log_safe_exception(logger, "save_conversation_task_mode", e, public)
            agent_streamer = get_default_agent_streamer()
            async for sse_line in agent_streamer.stream(
                conversation_id,
                prompt,
                user_id,
                db_config=db_config,
                response_style=response_style,
                max_rows=max_rows,
                api_key=api_key,
                enable_reasoning=enable_reasoning,
                reasoning_effort=reasoning_effort,
                resume=resume,
                run_policy=run_policy,
            ):
                event = _parse_sse_event(sse_line)
                if event is None:
                    yield sse_line
                    continue

                event_type = event.get("type")

                # Core user prompt storage trigger
                if (
                    prompt
                    and not prompt_stored
                    and event_type
                    in (
                        "token",
                        "tool_start",
                        "thinking_token",
                        "agent_interrupt",
                        "workflow_status",
                        "skills_activated",
                    )
                ):
                    await store_prompt_once()

                if event_type == "token":
                    await store_prompt_once()
                    chunk = event.get("content", "")
                    if chunk:
                        if ordered_timeline and ordered_timeline[-1]["type"] == "text":
                            ordered_timeline[-1]["content"] += chunk
                        else:
                            ordered_timeline.append({"type": "text", "content": chunk})

                elif event_type == "tool_start":
                    await store_prompt_once()
                    for item in ordered_timeline:
                        if item["type"] == "thinking":
                            item["is_complete"] = True
                    ordered_timeline.append(
                        {
                            "type": "tool",
                            "name": event.get("name", ""),
                            "status": "running",
                            "args": json.dumps(event.get("args", {}), default=str),
                            "result": "null",
                        }
                    )

                elif event_type == "tool_end":
                    name = event.get("name", "")
                    for item in reversed(ordered_timeline):
                        if item["type"] == "tool" and item["name"] == name and item["status"] == "running":
                            item["status"] = "done"
                            item["args"] = json.dumps(event.get("args", {}), default=str)
                            res_val = event.get("result") or {}
                            if name == "execute_query" and isinstance(res_val, dict):
                                # Strip large query rows and preview arrays
                                res_val = dict(res_val)
                                res_val.pop("data", None)
                                res_val.pop("preview", None)
                            item["result"] = json.dumps(res_val, default=str)
                            break

                elif event_type == "thinking_token":
                    await store_prompt_once()
                    chunk = event.get("content", "")
                    if chunk:
                        if ordered_timeline and ordered_timeline[-1]["type"] == "thinking":
                            ordered_timeline[-1]["content"] += chunk
                        else:
                            ordered_timeline.append(
                                {
                                    "type": "thinking",
                                    "content": chunk,
                                    "is_complete": False,
                                }
                            )

                elif event_type == "workflow_status":
                    await store_prompt_once()
                    stage = event.get("stage", "status")
                    status_val = event.get("status")
                    content = event.get("content", "Preparing context...")
                    step_id = f"workflow-{stage}"

                    existing_item = None
                    for item in ordered_timeline:
                        if item.get("type") == "thinking" and item.get("id") == step_id:
                            existing_item = item
                            break

                    if existing_item:
                        existing_item["content"] = content
                        existing_item["is_complete"] = status_val == "done"
                    else:
                        ordered_timeline.append(
                            {
                                "type": "thinking",
                                "id": step_id,
                                "content": content,
                                "is_complete": (status_val == "done"),
                            }
                        )

                elif event_type == "skills_activated":
                    await store_prompt_once()
                    skills = event.get("skills", [])
                    if skills:
                        existing_item = None
                        for item in ordered_timeline:
                            if item.get("type") == "skill":
                                existing_item = item
                                break
                        if existing_item:
                            existing_skills = existing_item.get("skills", [])
                            existing_item["skills"] = list(dict.fromkeys([*existing_skills, *skills]))
                        else:
                            ordered_timeline.append(
                                {
                                    "type": "skill",
                                    "skills": skills,
                                    "id": f"skill-{len(ordered_timeline)}",
                                }
                            )

                elif event_type == "error":
                    logger.warning(
                        "Agent emitted error event for conversation %s",
                        conversation_id,
                    )
                    error_message = event.get("message") or event.get("content")
                    if error_message:
                        ordered_timeline.append(
                            {
                                "type": "text",
                                "content": f"Error: {error_message}",
                            }
                        )

                elif event_type == "usage_metrics":
                    # ENH [CTX-SINGLE-SOURCE]: Spread all fields from the
                    # event instead of listing them explicitly. This ensures
                    # new fields like activePercent and modelPercent are
                    # automatically stored on the message's usage in Firestore
                    # and restored when the conversation is loaded later.
                    last_usage_metrics = {k: v for k, v in event.items() if k != "type"}

                elif event_type == "agent_interrupt" and prompt and not prompt_stored:
                    await store_prompt_once()

                yield sse_line

        except asyncio.CancelledError:
            was_aborted = True
            logger.info("Stream cancelled for conversation %s", conversation_id)
            raise

        except GeneratorExit:
            # FIX [L6]: GeneratorExit MUST be re-raised. The original code
            # set was_aborted=True and fell through to the finally block,
            # which awaited run_in_threadpool(...). That await blocked the
            # StreamingResponse's aclose() for several seconds while the
            # partial-response store ran — long enough for uvicorn to log
            # "RuntimeError: Unexpected ASGI message" and for the client to
            # time out. Re-raising lets the generator unwind promptly; the
            # finally block still runs (Python guarantees it), but the
            # generator's aclose() doesn't block on it.
            was_aborted = True
            logger.info(f"Stream aborted for conversation {conversation_id}")
            raise

        except PermissionError:
            has_fatal_error = True
            yield _make_sse_error("You don't have permission to access this conversation.")

        except Exception as err:
            if not ordered_timeline and not prompt_stored:
                has_fatal_error = True
            public = public_tool_error(
                "CONVERSATION_STREAM_FAILED",
                _classify_error(str(err)),
            )
            log_safe_exception(logger, "stream_conversation_response", err, public)
            yield _make_sse_error(public.message)

        finally:
            should_store_response = (
                (prompt_stored or resume is not None) and not response_stored and not has_fatal_error
            )
            if should_store_response:
                for item in ordered_timeline:
                    if item["type"] == "thinking":
                        item["is_complete"] = True
                if was_aborted:
                    for item in ordered_timeline:
                        if item["type"] == "text":
                            item["content"] = item["content"].rstrip()
                    ordered_timeline.append({"type": "text", "content": "\n\n_(Response stopped by user)_"})
                response_text = "".join(item["content"] for item in ordered_timeline if item["type"] == "text").strip()
                tools_used = [item for item in ordered_timeline if item["type"] == "tool"]

                if not response_text and tools_used:
                    response_text = "(Used tools to gather information)"

                ensure_turn_metadata()
                tool_trace_summary = _build_tool_trace_summary(ordered_timeline)

                try:
                    await run_in_threadpool(
                        ConversationRepository.store_message,
                        conversation_id,
                        "ai",
                        response_text,
                        user_id,
                        tools=None,
                        thinking=None,
                        timeline=ordered_timeline if ordered_timeline else None,
                        append=(resume is not None),
                        usage=last_usage_metrics,
                        turn_id=current_turn_id,
                        turn_index=current_turn_index,
                        message_role="assistant",
                        is_final_assistant_response=(not was_aborted),
                        tool_trace_summary=tool_trace_summary,
                    )
                    response_stored = True
                    status = "partial (aborted)" if was_aborted else "complete"
                    logger.info(
                        "Stored AI response (%s): %d chars, %d timeline items for conversation %s",
                        status,
                        len(response_text),
                        len(ordered_timeline),
                        conversation_id,
                    )
                except Exception as store_err:
                    public = public_tool_error(
                        "CONVERSATION_RESPONSE_SAVE_FAILED",
                        "Conversation response could not be saved.",
                    )
                    log_safe_exception(logger, "save_conversation_response", store_err, public)
            elif has_fatal_error:
                logger.info(
                    "Skipped storing response due to fatal error for conversation %s",
                    conversation_id,
                )

    @staticmethod
    def get_streaming_headers(conversation_id: str) -> dict:
        """Return SSE-friendly HTTP headers for a streaming chat response."""
        return {
            "X-Conversation-Id": conversation_id,
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Content-Encoding": "identity",
            "Connection": "keep-alive",
        }

    @staticmethod
    def check_quota_error(error_message: str) -> bool:
        """Return True if the error message indicates a quota or rate-limit failure."""
        lower = error_message.lower()
        return "quota" in lower or "429" in lower or "rate" in lower
