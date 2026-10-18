"""Coordinated deletion of one user's Moonlit-owned data."""

from __future__ import annotations

import asyncio


class AccountDeletionService:
    """Erase application data first and the Firebase identity last."""

    @staticmethod
    async def delete_user(
        user_id: str,
        *,
        conversation_repository=None,
        context_repository=None,
        usage_repository=None,
        memory_cleaner=None,
        checkpoint_cleaner=None,
        identity_gateway=None,
        sync_runner=None,
    ) -> dict:
        if not isinstance(user_id, str) or not user_id.strip():
            raise ValueError("A user ID is required")

        if conversation_repository is None:
            from service.conversations.conversation_repository import ConversationRepository

            conversation_repository = ConversationRepository
        if context_repository is None:
            from service.context.context_repository import ContextRepository

            context_repository = ContextRepository
        if usage_repository is None:
            from service.dashboard.usage_repository import UsageRepository

            usage_repository = UsageRepository
        if memory_cleaner is None:
            from service.conversations.vector_memory_cleanup import get_default_memory_cleaner

            memory_cleaner = get_default_memory_cleaner()
        if checkpoint_cleaner is None:
            from langgraph_orchestration.checkpointing import get_checkpointer

            checkpoint_cleaner = get_checkpointer()
        if identity_gateway is None:
            from firebase_admin import auth

            identity_gateway = auth
        if sync_runner is None:
            sync_runner = asyncio.to_thread

        # Current conversation metadata retains only the latest generation.
        # Include earlier turns and conversations whose documents are gone.
        await checkpoint_cleaner.adelete_user_threads(user_id)
        conversations = await sync_runner(conversation_repository.get_by_user, user_id)
        deleted_conversations = 0
        for conversation in conversations:
            conversation_id = conversation.get("id")
            if not conversation_id:
                raise RuntimeError("Conversation metadata is missing its identifier")

            # External vector memory is Moonlit-owned and therefore part of
            # erasure. A failure stops the operation before identity deletion
            # so the authenticated user can safely retry.
            await memory_cleaner.delete_conversation_pointers(conversation_id, user_id)
            deleted = await sync_runner(
                conversation_repository.delete,
                conversation_id,
                user_id,
                strict_subcollection_cleanup=True,
            )
            if not deleted:
                raise RuntimeError("Conversation deletion did not complete")
            deleted_conversations += 1

        retries = await sync_runner(
            conversation_repository.get_memory_cleanup_retries_for_user, user_id,
        )
        for retry in retries:
            conversation_id = retry.get('conversation_id')
            retry_id = retry.get('id')
            if not conversation_id or not retry_id:
                raise RuntimeError('Memory cleanup retry is missing its identifier')
            await memory_cleaner.delete_conversation_pointers(conversation_id, user_id)
            await sync_runner(conversation_repository.delete_memory_cleanup_retry, retry_id)

        if not await sync_runner(context_repository.delete, user_id):
            raise RuntimeError("User context deletion did not complete")
        await sync_runner(usage_repository.delete_user, user_id)

        # Keep this terminal: once Firebase deletes the identity there is no
        # authenticated principal left to retry an incomplete application-data
        # cleanup.
        await sync_runner(identity_gateway.delete_user, user_id)
        return {"deleted_conversations": deleted_conversations}
