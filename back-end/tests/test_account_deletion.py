from __future__ import annotations

import pytest

from service.dashboard.account_deletion import AccountDeletionService


class _MemoryCleaner:
    events = None

    async def delete_conversation_pointers(self, conversation_id, user_id):
        self.events.append(("memory", conversation_id, user_id))


class _CheckpointCleaner:
    events = None

    async def adelete_user_threads(self, user_id):
        self.events.append(("account_checkpoints", user_id))


class _Conversations:
    events = None

    @classmethod
    def get_by_user(cls, user_id):
        cls.events.append(("list", user_id))
        return [{"id": "conversation-1"}, {"id": "conversation-2"}]

    @classmethod
    def delete(cls, conversation_id, user_id, *, strict_subcollection_cleanup=False):
        cls.events.append(
            ("conversation", conversation_id, user_id, strict_subcollection_cleanup)
        )
        return True

    @classmethod
    def get_memory_cleanup_retries_for_user(cls, user_id):
        return [{'id': 'retry-1', 'conversation_id': 'already-deleted', 'status': 'failed'}]

    @classmethod
    def delete_memory_cleanup_retry(cls, retry_id):
        cls.events.append(("memory_retry", retry_id))


class _Context:
    events = None

    @classmethod
    def delete(cls, user_id):
        cls.events.append(("context", user_id))
        return True


class _Usage:
    events = None

    @classmethod
    def delete_user(cls, user_id):
        cls.events.append(("usage", user_id))


class _Identity:
    events = None

    @classmethod
    def delete_user(cls, user_id):
        cls.events.append(("identity", user_id))


async def _run_direct(function, *args, **kwargs):
    return function(*args, **kwargs)


async def _delete(events):
    for boundary in (
        _Conversations,
        _Context,
        _Usage,
        _Identity,
        _MemoryCleaner,
        _CheckpointCleaner,
    ):
        boundary.events = events
    return await AccountDeletionService.delete_user(
        "user-1",
        conversation_repository=_Conversations,
        context_repository=_Context,
        usage_repository=_Usage,
        memory_cleaner=_MemoryCleaner(),
        checkpoint_cleaner=_CheckpointCleaner(),
        identity_gateway=_Identity,
        sync_runner=_run_direct,
    )


@pytest.mark.asyncio
async def test_account_erasure_deletes_moonlit_data_before_firebase_identity():
    events = []

    result = await _delete(events)

    assert result == {"deleted_conversations": 2}
    assert events[-1] == ("identity", "user-1")
    assert ("context", "user-1") in events[:-1]
    assert ("usage", "user-1") in events[:-1]
    assert ('account_checkpoints', 'user-1') in events[:-1]
    assert events.index(('memory', 'already-deleted', 'user-1')) < events.index(('memory_retry', 'retry-1'))
    assert (
        "conversation",
        "conversation-1",
        "user-1",
        True,
    ) in events[:-1]
    assert all("external_database" not in repr(event) for event in events)


@pytest.mark.asyncio
async def test_account_erasure_keeps_identity_when_moonlit_cleanup_fails():
    events = []

    class FailingUsage(_Usage):
        @classmethod
        def delete_user(cls, user_id):
            cls.events.append(("usage", user_id))
            raise RuntimeError("storage unavailable")

    for boundary in (
        _Conversations,
        _Context,
        FailingUsage,
        _Identity,
        _MemoryCleaner,
        _CheckpointCleaner,
    ):
        boundary.events = events

    with pytest.raises(RuntimeError, match="storage unavailable"):
        await AccountDeletionService.delete_user(
            "user-1",
            conversation_repository=_Conversations,
            context_repository=_Context,
            usage_repository=FailingUsage,
            memory_cleaner=_MemoryCleaner(),
            checkpoint_cleaner=_CheckpointCleaner(),
            identity_gateway=_Identity,
            sync_runner=_run_direct,
        )

    assert ("identity", "user-1") not in events


@pytest.mark.asyncio
async def test_failed_retry_cleanup_retains_record_and_identity(monkeypatch):
    async def fail_retry(self, conversation_id, user_id):
        self.events.append(('memory', conversation_id, user_id))
        if conversation_id == 'already-deleted':
            raise RuntimeError('vectors unavailable')

    monkeypatch.setattr(_MemoryCleaner, 'delete_conversation_pointers', fail_retry)
    events = []
    with pytest.raises(RuntimeError, match='vectors unavailable'):
        await _delete(events)
    assert ('memory_retry', 'retry-1') not in events
    assert ('identity', 'user-1') not in events


@pytest.mark.asyncio
async def test_checkpoint_failure_prevents_account_deletion(monkeypatch):
    async def fail(self, user_id):
        raise RuntimeError('checkpoints unavailable')

    monkeypatch.setattr(_CheckpointCleaner, 'adelete_user_threads', fail)
    events = []
    with pytest.raises(RuntimeError, match='checkpoints unavailable'):
        await _delete(events)
    assert not any(event[0] in {'conversation', 'identity'} for event in events)
