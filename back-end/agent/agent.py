"""
LangGraph agent — streams agentic conversation over SSE.

Builds a ReAct graph via :func:`graph.build_react_agent`, then streams with
``version='v2'`` unified stream parts (messages + custom tool events).

See: https://docs.langchain.com/oss/python/langgraph/streaming
"""

from __future__ import annotations

import logging
from typing import AsyncGenerator, Optional

from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage
from fastapi.concurrency import run_in_threadpool

from .checkpointing import get_checkpointer
from .graph import build_react_agent
from .model_factory import get_chat_model, get_default_model
from .prompt_builder import PromptBuilder
from .stream_protocol import sse_encode, sse_error, sse_done
from .tools import ALL_TOOLS

logger = logging.getLogger(__name__)

# Safety limit — prevents runaway tool loops
MAX_AGENT_STEPS = 25


async def stream_conversation(
    conversation_id: str,
    message: str,
    user_id: str,
    *,
    db_config: Optional[dict] = None,
    response_style: str = "balanced",
    max_rows: Optional[int] = None,
    api_key: Optional[str] = None,
    provider: str = "gemini",
    model: Optional[str] = None,
    enable_reasoning: bool = True,
    reasoning_effort: str = "medium",
) -> AsyncGenerator[str, None]:
    """
    Stream a full agent turn as SSE-encoded JSON events.

    Yields ``data: {…}\\n\\n`` strings ready for a ``StreamingResponse``.
    Event types: ``token``, ``tool_start``, ``tool_end``,
    ``thinking_token``, ``error``, ``done``.
    """
    try:
        selected_model = model or get_default_model(provider)
        chat_model = get_chat_model(
            provider,
            selected_model,
            api_key,
            enable_reasoning=enable_reasoning,
            reasoning_effort=reasoning_effort,
        )
        logger.info(
            "Agent invocation: provider=%s, model=%s, conversation=%s",
            provider,
            selected_model,
            conversation_id,
        )

        system_prompt = PromptBuilder.build_system_prompt(response_style)
        checkpointer = get_checkpointer()
        agent = build_react_agent(
            chat_model,
            ALL_TOOLS,
            system_prompt=system_prompt,
            checkpointer=checkpointer,
        )

        config = {
            "configurable": {
                "thread_id": conversation_id,
                "user_id": user_id,
                "db_config": db_config,
                "max_rows": max_rows,
                "tool_cache": {},
            },
            "recursion_limit": MAX_AGENT_STEPS,
        }

        if not await _has_checkpoint(checkpointer, conversation_id):
            history = await _load_firestore_history(conversation_id)
            initial_messages = history + [HumanMessage(content=message)]
            if history:
                logger.info(
                    "Seeded %s messages from Firestore for conversation %s",
                    len(history),
                    conversation_id,
                )
        else:
            initial_messages = [HumanMessage(content=message)]

        async for part in agent.astream(
            {"messages": initial_messages},
            config=config,
            stream_mode=["messages", "custom"],
            version="v2",
            durability="async",
        ):
            if part["type"] == "messages":
                msg_chunk, _metadata = part["data"]
                if not isinstance(msg_chunk, AIMessageChunk):
                    continue

                content = msg_chunk.content
                if isinstance(content, list):
                    for block in content:
                        if not isinstance(block, dict):
                            if block:
                                yield sse_encode({"type": "token", "content": str(block)})
                            continue
                        block_type = block.get("type")
                        if block_type == "thinking":
                            thinking = block.get("thinking", "")
                            if thinking:
                                yield sse_encode(
                                    {"type": "thinking_token", "content": thinking}
                                )
                        elif block_type == "text":
                            text = block.get("text", "")
                            if text:
                                yield sse_encode({"type": "token", "content": text})
                elif content:
                    yield sse_encode({"type": "token", "content": content})

            elif part["type"] == "custom":
                yield sse_encode(part["data"])

        yield sse_done()

    except Exception as e:
        logger.error("Agent stream error: %s", e, exc_info=True)
        yield sse_error(_friendly_error(str(e)))
        yield sse_done()


async def _has_checkpoint(checkpointer, thread_id: str) -> bool:
    try:
        result = await checkpointer.aget_tuple(
            {"configurable": {"thread_id": thread_id}}
        )
        return result is not None
    except Exception as e:
        logger.warning("Could not check checkpointer state for %s: %s", thread_id, e)
        return False


async def _load_firestore_history(conversation_id: str) -> list:
    try:
        from repositories import ConversationRepository

        conv_data = await run_in_threadpool(
            ConversationRepository.get, conversation_id
        )
        if not conv_data or not conv_data.get("messages"):
            return []

        lc_messages = []
        for msg in conv_data["messages"]:
            sender = msg.get("sender")
            content = msg.get("content", "")
            if not content:
                continue
            if sender == "user":
                lc_messages.append(HumanMessage(content=content))
            elif sender == "ai":
                lc_messages.append(AIMessage(content=content))

        return lc_messages

    except Exception as e:
        logger.warning(
            "Failed to load Firestore history for seeding (conversation %s): %s",
            conversation_id,
            e,
        )
        return []


def _friendly_error(raw: str) -> str:
    lower = raw.lower()
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
