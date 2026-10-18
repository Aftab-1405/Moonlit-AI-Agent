"""In-flight checkpoint mutations must remain visible to account erasure."""

import asyncio

import pytest
from langgraph.checkpoint.base import empty_checkpoint

from api_contract.run_context import RunControl, create_checkpoint_generation
from core.account_activity import AccountActivityStore, AccountBusyError, current_account_user_id
from langgraph_orchestration.checkpoint_savers import FullCopyInMemorySaver
from langgraph_orchestration.checkpointing import GenerationCheckpointer, _await_sync_call, _clone_generation


class BlockedSaver(FullCopyInMemorySaver):
    def __init__(self):
        super().__init__()
        self.started = asyncio.Event()
        self.finish = asyncio.Event()
        self.completed = asyncio.Event()

    async def aput(self, *args):
        self.started.set()
        await self.finish.wait()
        result = await super().aput(*args)
        self.completed.set()
        return result

    async def aput_writes(self, *args):
        self.started.set()
        await self.finish.wait()
        await super().aput_writes(*args)
        self.completed.set()

    async def acopy_thread(self, *args):
        self.started.set()
        await self.finish.wait()
        await super().acopy_thread(*args)
        self.completed.set()


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["checkpoint", "writes", "clone", "activation"])
async def test_cancelled_checkpoint_mutation_blocks_erasure_until_durable_completion(monkeypatch, operation):
    store = AccountActivityStore()
    monkeypatch.setattr("core.account_activity.get_account_activity_store", lambda: store)
    saver = BlockedSaver()
    source = create_checkpoint_generation("user-1:conversation", "source", 1)
    target = create_checkpoint_generation("user-1:conversation", "target", 2, source_generation=source)
    checkpoint = empty_checkpoint()
    await FullCopyInMemorySaver.aput(
        saver,
        {"configurable": {"thread_id": source.physical_thread_id, "checkpoint_ns": ""}},
        checkpoint,
        {},
        {},
    )
    adapter = GenerationCheckpointer(
        saver,
        target,
        reserved_generation=target,
        active_generation=target,
        run_control=RunControl(deadline_monotonic=100, tool_limit=1),
        monotonic=lambda: 1,
    )
    config = {
        "configurable": {
            "thread_id": target.logical_thread_id,
            "checkpoint_id": checkpoint["id"],
            "checkpoint_ns": "",
        }
    }

    async def blocked_thread_call(func, *args):
        saver.started.set()
        await saver.finish.wait()
        result = func(*args)
        saver.completed.set()
        return result

    if operation == "activation":
        monkeypatch.setattr("langgraph_orchestration.checkpointing.asyncio.to_thread", blocked_thread_call)

    async def mutate():
        if operation == "checkpoint":
            return await adapter.aput(config, checkpoint, {}, {})
        if operation == "writes":
            return await adapter.aput_writes(config, [("messages", "private text")], "task")
        if operation == "activation":
            return await _await_sync_call(
                saver.put,
                {"configurable": {"thread_id": target.physical_thread_id, "checkpoint_ns": ""}},
                checkpoint,
                {},
                {},
            )
        return await _clone_generation(saver, source, target)

    context_token = current_account_user_id.set("user-1")
    try:
        caller = asyncio.create_task(mutate())
        await saver.started.wait()
        deletion = await store.admit("user-1", allow_pending=True)
        with pytest.raises(AccountBusyError):
            await store.begin_erasure("user-1", deletion)
        caller.cancel()
        with pytest.raises(asyncio.CancelledError):
            await caller
        with pytest.raises(AccountBusyError):
            await store.begin_erasure("user-1", deletion)
        saver.finish.set()
        await asyncio.wait_for(saver.completed.wait(), timeout=1)
        await asyncio.sleep(0)
        await store.begin_erasure("user-1", deletion)
        if operation == "writes":
            assert saver.writes[(target.physical_thread_id, "", checkpoint["id"])]
        else:
            assert saver.storage[target.physical_thread_id]
        await saver.adelete_user_threads("user-1")
        assert not saver.storage and not saver.writes and not saver.blobs
    finally:
        saver.finish.set()
        current_account_user_id.reset(context_token)
        await asyncio.sleep(0)
