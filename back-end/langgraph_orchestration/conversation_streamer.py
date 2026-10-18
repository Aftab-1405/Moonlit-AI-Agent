"""Conversation streaming adapter backed by LangGraph orchestration."""

from typing import AsyncGenerator

from api_contract.run_context import ResolvedRunPolicy
from langgraph_orchestration.stream_conversation import stream_conversation


class LangGraphConversationAgentStreamer:
    """Conversation agent streamer backed by LangGraph."""

    async def stream(
        self,
        conversation_id: str,
        prompt: str | None,
        user_id: str,
        *,
        db_config: dict | None = None,
        response_style: str = "balanced",
        max_rows: int | None = None,
        api_key: str | None = None,
        enable_reasoning: bool = True,
        reasoning_effort: str = "medium",
        resume: dict | None = None,
        run_policy: ResolvedRunPolicy,
    ) -> AsyncGenerator[str, None]:
        """Stream a conversation turn as SSE lines from the LangGraph agent.

        Args:
            conversation_id: ID of the target conversation.
            prompt: The user's prompt text, or ``None`` for a resume-only turn.
            user_id: ID of the user issuing the turn.
            db_config: Optional database connection descriptor for tool calls.
            response_style: One of ``"concise"``, ``"balanced"``, ``"detailed"``.
            max_rows: Row cap passed to ``execute_query`` (``None`` = default).
            api_key: Optional provider API key override.
            run_policy: Immutable effective mode, model, and run budgets.
            enable_reasoning: Whether to enable reasoning/thinking output.
            reasoning_effort: Reasoning effort level (``"low"|"medium"|"high"``).
            resume: Optional resume payload for an interrupted agent run.

        Yields:
            SSE-encoded ``data: {...}\\n\\n`` lines for the browser UI.
        """
        async for sse_line in stream_conversation(
            conversation_id,
            prompt,
            user_id,
            db_config=db_config,
            response_style=response_style,
            max_rows=max_rows,
            api_key=api_key,
            run_policy=run_policy,
            enable_reasoning=enable_reasoning,
            reasoning_effort=reasoning_effort,
            resume=resume,
        ):
            yield sse_line
