"""
Conversation Service - Handles conversation management, AI streaming, and Firestore persistence.

Consumes the LangGraph agent's SSE-encoded JSON events, passes them through
to the HTTP client, and persists completed messages to Firestore.
"""

import json
import uuid
import logging
from typing import Optional, AsyncGenerator

logger = logging.getLogger(__name__)


class ConversationService:
    """Service for managing conversations and AI interactions."""

    # ── Conversation CRUD ────────────────────────────────────────────

    @staticmethod
    def create_or_get_conversation_id(provided_id: Optional[str] = None) -> str:
        if provided_id:
            return provided_id
        return str(uuid.uuid4())

    @staticmethod
    def initialize_conversation(conversation_id: str, history: list = None) -> None:
        pass  # Stateless API

    @staticmethod
    def get_conversation_data(conversation_id: str, user_id: str) -> Optional[dict]:
        from repositories import ConversationRepository

        return ConversationRepository.get_for_user(conversation_id, user_id)

    @staticmethod
    def delete_user_conversation(conversation_id: str, user_id: str) -> None:
        from repositories import ConversationRepository

        ConversationRepository.delete(conversation_id, user_id)

    @staticmethod
    def get_user_conversations(user_id: str) -> list:
        from repositories import ConversationRepository

        return ConversationRepository.get_by_user(user_id)

    # ── AI Streaming (LangGraph SSE) ─────────────────────────────────

    @staticmethod
    async def create_streaming_generator(
        conversation_id: str,
        prompt: str,
        user_id: str,
        db_config: dict = None,
        enable_reasoning: bool = True,
        reasoning_effort: str = "medium",
        response_style: str = "balanced",
        max_rows: int = None,
        api_key: str = None,
        provider: str | None = None,
        model: str | None = None,
    ) -> AsyncGenerator[str, None]:
        """
        Consume SSE events from the LangGraph agent, pass them through
        to the client, and persist the completed message to Firestore.

        Yields:
            SSE ``data: {…}\\n\\n`` strings.
        """
        from repositories import ConversationRepository
        from agent import stream_conversation

        prompt_stored = False
        response_stored = False
        full_content: list[str] = []
        thinking_content: list[str] = []
        tools_used: list[dict] = []
        was_aborted = False
        has_error = False

        try:
            # Load conversation history for the checkpointer
            # (The LangGraph checkpointer handles per-thread state automatically
            #  via thread_id, but we still verify ownership.)
            conv_data = ConversationRepository.get(conversation_id)
            if conv_data and conv_data.get("user_id") != user_id:
                raise PermissionError("User does not own this conversation")

            # Stream from the LangGraph agent
            async for sse_line in stream_conversation(
                conversation_id,
                prompt,
                user_id,
                db_config=db_config,
                response_style=response_style,
                max_rows=max_rows,
                api_key=api_key,
                provider=provider or "gemini",
                model=model,
                enable_reasoning=enable_reasoning,
                reasoning_effort=reasoning_effort,
            ):
                # Parse the SSE data line to track content/tools for persistence
                event = _parse_sse_event(sse_line)
                if event is None:
                    # Forward unparseable lines as-is (shouldn't happen)
                    yield sse_line
                    continue

                event_type = event.get("type")

                if event_type == "token":
                    if not prompt_stored:
                        ConversationRepository.store_message(
                            conversation_id, "user", prompt, user_id
                        )
                        prompt_stored = True
                    full_content.append(event.get("content", ""))

                elif event_type == "tool_start":
                    if not prompt_stored:
                        ConversationRepository.store_message(
                            conversation_id, "user", prompt, user_id
                        )
                        prompt_stored = True
                    tools_used.append(
                        {
                            "name": event.get("name", ""),
                            "status": "running",
                            "args": json.dumps(event.get("args", {}), default=str),
                            "result": "null",
                        }
                    )

                elif event_type == "tool_end":
                    name = event.get("name", "")
                    for tool in tools_used:
                        if tool["name"] == name and tool["status"] == "running":
                            tool["status"] = "done"
                            tool["args"] = json.dumps(
                                event.get("args", {}), default=str
                            )
                            tool["result"] = json.dumps(
                                event.get("result", {}), default=str
                            )
                            break

                elif event_type == "thinking_token":
                    if not prompt_stored:
                        ConversationRepository.store_message(
                            conversation_id, "user", prompt, user_id
                        )
                        prompt_stored = True
                    chunk = event.get("content", "")
                    if chunk:
                        thinking_content.append(chunk)

                elif event_type == "error":
                    has_error = True

                # event_type "done" — pass-through only

                yield sse_line

        except GeneratorExit:
            was_aborted = True
            logger.info(f"Stream aborted for conversation {conversation_id}")

        except PermissionError:
            has_error = True
            yield _make_sse_error(
                "You don't have permission to access this conversation."
            )

        except Exception as err:
            has_error = True
            logger.error(f"Streaming error: {err}", exc_info=True)
            yield _make_sse_error(_classify_error(str(err)))

        finally:
            if prompt_stored and not response_stored and not has_error:
                response_text = "".join(full_content).strip()
                thinking_text = "".join(thinking_content).strip()
                if response_text or tools_used or thinking_text:
                    if not response_text and tools_used:
                        response_text = "(Used tools to gather information)"
                    if was_aborted and response_text:
                        response_text += "\n\n_(Response stopped by user)_"

                    ConversationRepository.store_message(
                        conversation_id,
                        "ai",
                        response_text,
                        user_id,
                        tools=tools_used if tools_used else None,
                        thinking=thinking_text or None,
                    )
                    response_stored = True
                    status = "partial (aborted)" if was_aborted else "complete"
                    logger.info(
                        f"Stored AI response ({status}): {len(response_text)} chars"
                    )
            elif has_error:
                logger.info(
                    f"Skipped storing error response for conversation {conversation_id}"
                )

    # ── Response headers ─────────────────────────────────────────────

    @staticmethod
    def get_streaming_headers(
        conversation_id: str,
        provider: str | None = None,
        model: str | None = None,
    ) -> dict:
        headers = {
            "X-Conversation-Id": conversation_id,
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        }
        if provider:
            headers["X-LLM-Provider"] = provider
        if model:
            headers["X-LLM-Model"] = model
        return headers

    @staticmethod
    def check_quota_error(error_message: str) -> bool:
        lower = error_message.lower()
        return "quota" in lower or "429" in lower or "rate" in lower


# ── module-level helpers ─────────────────────────────────────────────


def _parse_sse_event(sse_line: str) -> Optional[dict]:
    """Extract the JSON dict from a ``data: {…}\\n\\n`` SSE line."""
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
    lower = raw.lower()
    if "rate_limit" in lower or "quota" in lower or "429" in lower:
        return "API rate limit exceeded. Please wait a moment and try again."
    if "authentication" in lower or "401" in lower:
        return "Authentication error. Please check API keys."
    return "AI service error. Please try again."
