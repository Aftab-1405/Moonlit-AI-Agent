"""Conversation feature protocols."""

from typing import Any, AsyncGenerator, Protocol, runtime_checkable

from api_contract.run_context import ResolvedRunPolicy


@runtime_checkable
class ConversationMemoryCleaner(Protocol):
    """Port for deleting non-Firestore memory linked to a conversation."""

    async def delete_conversation_pointers(self, conversation_id: str, user_id: str) -> None:
        """Delete external memory pointers for a conversation."""


@runtime_checkable
class ConversationSummaryMemoryWriter(Protocol):
    """Port for storing long-context memory summaries for a conversation."""

    async def store_summary_block(
        self,
        conversation_id: str,
        user_id: str,
        *,
        text: str,
        start_message_idx: int,
        end_message_idx: int,
        memory_bullets: list[dict] | None = None,
        covers_from_turn: int | None = None,
        covers_to_turn: int | None = None,
        covers_message_ids: list | None = None,
        created_from_unsummarized_tail: bool = True,
    ) -> dict:
        """Store an externally indexed summary block."""


@runtime_checkable
class ConversationAgentStreamer(Protocol):
    """Port for streaming agent events into a conversation."""

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
        """Yield SSE events from the configured agent implementation."""


@runtime_checkable
class ConversationSummarizationContextProvider(Protocol):
    """Port for prompt/tool metadata needed when summarizing conversations."""

    def build_system_prompt(self, response_style: str = "balanced") -> str:
        """Return the system prompt used for token budgeting."""

    def get_tools(self) -> list[Any]:
        """Return tool schemas used for token budgeting."""
