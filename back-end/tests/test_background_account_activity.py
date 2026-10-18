"""Background account writers participate in the account erasure barrier."""

import asyncio
import threading
from types import SimpleNamespace

import pytest

import core.account_activity as account_activity
import langgraph_orchestration.tools as tool_module
import vamp_memory.vamp_memory_service as vamp_module


@pytest.mark.asyncio
async def test_summary_creation_holds_account_admission(monkeypatch):
    active_users = set()
    writes = []

    async def admitted(user_id, operation):
        active_users.add(user_id)
        try:
            return await operation()
        finally:
            active_users.remove(user_id)

    async def create_block(conversation_id, user_id, **kwargs):
        writes.append((conversation_id, user_id, set(active_users)))
        return {"created": False, "user_id": user_id}

    monkeypatch.setattr(vamp_module, "run_account_work", admitted)
    service = vamp_module.VampMemoryService(
        summary_repo=SimpleNamespace(create_block=create_block),
    )
    await service.store_summary_block(
        "conversation", "owner", text="summary", start_message_idx=0, end_message_idx=1,
    )
    assert writes == [("conversation", "owner", {"owner"})]
    assert active_users == set()


@pytest.mark.asyncio
async def test_vector_retry_metadata_is_written_while_account_is_admitted(monkeypatch):
    active_users = set()
    writes = []

    async def admitted(user_id, operation):
        active_users.add(user_id)
        try:
            return await operation()
        finally:
            active_users.remove(user_id)

    async def write_failure(conversation_id, summary_id, *, reason):
        writes.append((conversation_id, summary_id, set(active_users)))

    async def broken_index(block):
        raise RuntimeError("vector storage unavailable")

    monkeypatch.setattr(vamp_module, "run_account_work", admitted)
    service = vamp_module.VampMemoryService(
        summary_repo=SimpleNamespace(mark_vector_failed=write_failure),
    )
    monkeypatch.setattr(service, "index_summary_block", broken_index)

    assert await service._index_with_failure_record(
        {"user_id": "owner", "conversation_id": "conversation", "summary_id": "summary"}
    ) is False
    assert writes == [("conversation", "summary", {"owner"})]
    assert active_users == set()


@pytest.mark.asyncio
async def test_erasing_account_does_not_index_or_write_retry_metadata(monkeypatch):
    writes = []

    async def rejected(user_id, operation):
        raise account_activity.AccountBusyError("account erasure in progress")

    async def write_indexed(*args, **kwargs):
        writes.append("indexed")

    async def write_failed(*args, **kwargs):
        writes.append("failed")

    monkeypatch.setattr(vamp_module, "run_account_work", rejected)
    service = vamp_module.VampMemoryService(
        summary_repo=SimpleNamespace(
            mark_vector_indexed=write_indexed,
            mark_vector_failed=write_failed,
        ),
    )

    assert await service._index_with_failure_record(
        {"user_id": "owner", "conversation_id": "conversation", "summary_id": "summary"}
    ) is False
    assert writes == []


@pytest.mark.asyncio
async def test_database_tool_executor_runs_with_its_account_admitted(monkeypatch):
    active_users = set()
    writes = []

    async def admitted(user_id, operation):
        active_users.add(user_id)
        try:
            return await operation()
        finally:
            active_users.remove(user_id)

    def executor(arguments, user_id, db_config, max_rows):
        writes.append((user_id, set(active_users)))
        return {"success": True, "connected": False}

    monkeypatch.setattr(tool_module, "run_account_work", admitted)
    monkeypatch.setattr(tool_module, "_try_writer", lambda: lambda event: None)
    await tool_module._execute_tool(
        "get_connection_status", {}, {"configurable": {"user_id": "owner"}}, executor,
    )

    assert writes == [("owner", {"owner"})]
    assert active_users == set()


@pytest.mark.asyncio
async def test_timed_out_database_thread_keeps_erasure_blocked_until_it_finishes(monkeypatch):
    store = account_activity.AccountActivityStore()
    started = asyncio.Event()
    released = asyncio.Event()
    finish = threading.Event()
    loop = asyncio.get_running_loop()
    release = store.release

    async def observed_release(user_id, token):
        await release(user_id, token)
        released.set()

    def executor(arguments, user_id, db_config, max_rows):
        loop.call_soon_threadsafe(started.set)
        finish.wait(timeout=5)
        return {"success": True, "connected": False}

    monkeypatch.setattr(account_activity, "get_account_activity_store", lambda: store)
    monkeypatch.setattr(store, "release", observed_release)
    monkeypatch.setattr(tool_module, "_try_writer", lambda: lambda event: None)
    monkeypatch.setattr(tool_module, "_tool_timeout_seconds", lambda *args: 0.1)
    deletion_token = await store.admit("owner")
    execution = asyncio.create_task(tool_module._execute_tool(
        "get_connection_status", {}, {"configurable": {"user_id": "owner"}}, executor,
    ))
    try:
        await asyncio.wait_for(started.wait(), timeout=2)
        result = await asyncio.wait_for(execution, timeout=2)
        assert "TOOL_TIMEOUT" in result
        with pytest.raises(account_activity.AccountBusyError):
            await store.begin_erasure("owner", deletion_token)
        finish.set()
        await asyncio.wait_for(released.wait(), timeout=2)
        await store.begin_erasure("owner", deletion_token)
    finally:
        finish.set()
        await execution
        await release("owner", deletion_token)
