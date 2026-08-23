"""
Conversation Service - Handles conversation management. Delegates AI streaming to
ConversationStreamingService and historical logs compaction to ConversationCompactionService.
"""

import logging
import uuid
from typing import AsyncGenerator, Optional

from api_contract.run_context import ResolvedRunPolicy
from service.conversations.conversation_compaction_service import (
    ConversationCompactionService,
)
from service.conversations.conversation_streaming_service import (
    ConversationStreamingService,
)

logger = logging.getLogger(__name__)


class ConversationService:
    """Service for managing conversations and AI interactions (facade)."""

    @staticmethod
    def create_conversation_id() -> str:
        """Mint a canonical UUIDv4 for a new conversation."""
        return str(uuid.uuid4())

    @staticmethod
    def get_conversation_data(conversation_id: str, user_id: str) -> Optional[dict]:
        """Fetch a conversation if it exists and is owned by ``user_id``."""
        from service.conversations.conversation_repository import (
            ConversationRepository,
        )

        return ConversationRepository.get_for_user(conversation_id, user_id)

    @staticmethod
    def verify_conversation_owner(conversation_id: str, user_id: str) -> bool:
        """Return True if ``user_id`` owns the given conversation."""
        from service.conversations.conversation_repository import (
            ConversationRepository,
        )

        return ConversationRepository.verify_owner(conversation_id, user_id)

    @staticmethod
    def delete_user_conversation(conversation_id: str, user_id: str) -> None:
        """Delete a conversation and best-effort clean up its external vector memory."""
        from service.conversations.conversation_repository import (
            ConversationRepository,
        )
        from service.conversations.vector_memory_cleanup import (
            get_default_memory_cleaner,
            run_memory_cleanup_sync,
        )

        if ConversationRepository.get_for_user(conversation_id, user_id) is None:
            raise ValueError("Conversation not found")

        memory_cleaner = get_default_memory_cleaner()
        try:
            run_memory_cleanup_sync(memory_cleaner, conversation_id, user_id)
        except Exception as cleanup_err:
            logger.warning(
                "Failed to clean up external memory during conversation delete: %s",
                cleanup_err,
            )
            ConversationRepository.create_memory_cleanup_retry(conversation_id, user_id, cleanup_err)

        ConversationRepository.delete(conversation_id, user_id)

    @staticmethod
    def retry_external_memory_cleanups() -> int:
        """Retry pending Qdrant cleanups recorded as cleanup-retry records."""
        from service.conversations.conversation_repository import (
            ConversationRepository,
        )
        from service.conversations.vector_memory_cleanup import (
            get_default_memory_cleaner,
        )

        return ConversationRepository.retry_qdrant_cleanups(get_default_memory_cleaner())

    @staticmethod
    def rename_user_conversation(conversation_id: str, user_id: str, title: str) -> str:
        """Rename a conversation (verifies ownership) and return the new title."""
        from service.conversations.conversation_repository import (
            ConversationRepository,
        )

        return ConversationRepository.rename(conversation_id, user_id, title)

    @staticmethod
    def get_user_conversations(user_id: str) -> list:
        """List all conversations owned by ``user_id``."""
        from service.conversations.conversation_repository import (
            ConversationRepository,
        )

        return ConversationRepository.get_by_user(user_id)


    @staticmethod
    def create_streaming_generator(
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
        """Facade over ConversationStreamingService.create_streaming_generator."""
        return ConversationStreamingService.create_streaming_generator(
            conversation_id=conversation_id,
            prompt=prompt,
            user_id=user_id,
            db_config=db_config,
            enable_reasoning=enable_reasoning,
            reasoning_effort=reasoning_effort,
            response_style=response_style,
            max_rows=max_rows,
            api_key=api_key,
            run_policy=run_policy,
            resume=resume,
        )

    @staticmethod
    def get_streaming_headers(conversation_id: str) -> dict:
        """Return SSE-friendly HTTP headers for a streaming response."""
        return ConversationStreamingService.get_streaming_headers(conversation_id)

    @staticmethod
    def check_quota_error(error_message: str) -> bool:
        """Return True if the error message indicates a quota/rate-limit failure."""
        return ConversationStreamingService.check_quota_error(error_message)


    @staticmethod
    async def check_and_summarize(
        conversation_id: str,
        user_id: str,
        model: str = None,
        *,
        pressure_budget_tokens: int | None = None,
    ) -> dict:
        """Facade over ConversationCompactionService.check_and_summarize."""
        return await ConversationCompactionService.check_and_summarize(
            conversation_id=conversation_id,
            user_id=user_id,
            model=model,
            pressure_budget_tokens=pressure_budget_tokens,
        )
