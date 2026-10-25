"""Runtime checks for validated boundaries made explicit during typing cleanup."""

import asyncio
from types import SimpleNamespace

import pytest

from service.context.context_service import ContextService
from vamp_memory.qdrant_vector_store import QdrantVectorMemoryStore


def test_refresh_schema_requires_a_database_before_fetching(monkeypatch):
    from service.database.ai_tool_executor import AIToolExecutor

    calls = []
    monkeypatch.setattr(AIToolExecutor, "_fetch_tables_and_columns", lambda *args: calls.append(args) or ([], {}))
    monkeypatch.setattr(ContextService, "store_schema_context", lambda *args: calls.append(args))

    with pytest.raises(ValueError, match="database"):
        ContextService.refresh_schema_context_from_database("user-1", {"db_type": "postgresql"})
    assert calls == []


def test_closed_qdrant_store_rejects_reinitialization():
    store = object.__new__(QdrantVectorMemoryStore)
    store.client = SimpleNamespace(close=lambda: None)
    store._ready = True
    store._ready_lock = None
    store.collection_name = "test-memory"

    async def close_then_reopen():
        await store.aclose()
        await store.aclose()
        assert store.client is None
        with pytest.raises(RuntimeError, match="closed"):
            await store.ensure_ready()

    asyncio.run(close_then_reopen())
