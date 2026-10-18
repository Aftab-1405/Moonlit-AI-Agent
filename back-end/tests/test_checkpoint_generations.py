"""Behavioral tests for immutable LangGraph checkpoint generations."""

from __future__ import annotations

import asyncio
from copy import deepcopy
from dataclasses import FrozenInstanceError
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any

import pytest
from langgraph.checkpoint.base import (
    WRITES_IDX_MAP,
    BaseCheckpointSaver,
    CheckpointTuple,
    empty_checkpoint,
)
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.checkpoint.redis.util import (
    from_storage_safe_id,
    from_storage_safe_str,
    to_storage_safe_id,
    to_storage_safe_str,
)
from langgraph.constants import TASKS

from api_contract.orchestration_protocols import TaskRunAcquisition
from api_contract.run_context import (
    CheckpointGeneration,
    RunControl,
    create_checkpoint_generation,
)
from langgraph_orchestration.checkpoint_savers import (
    FullCopyAsyncRedisSaver,
    FullCopyInMemorySaver,
)
from langgraph_orchestration.checkpointing import (
    GenerationCheckpointer,
    prepare_checkpoint_generation,
)
from service.conversations.orchestration_access import (
    FirestoreConversationTaskStateStore,
)

WALL_NOW = datetime(2026, 8, 24, 10, 0, tzinfo=timezone.utc)


class GenerationStateStore:
    """Owner-fenced generation selection with immutable snapshot reads."""

    def __init__(
        self,
        *,
        owner: str,
        fence: int,
        reserved: CheckpointGeneration,
        active: CheckpointGeneration | None,
    ) -> None:
        self.owner = owner
        self.fence = fence
        self.reserved = deepcopy(reserved)
        self.active = deepcopy(active)

    def activate_checkpoint_generation(
        self,
        conversation_id: str,
        generation: CheckpointGeneration,
        run_id: str,
        fence: int,
    ) -> bool:
        del conversation_id
        if (run_id, fence) != (self.owner, self.fence):
            return False
        if generation != self.reserved:
            return False
        self.active = deepcopy(generation)
        return True


class BarrierCheckpointSaver(BaseCheckpointSaver):
    """Complete async saver surface with one pre-durable-write barrier."""

    def __init__(self) -> None:
        self.inner = InMemorySaver()
        super().__init__(serde=self.inner.serde)
        self.blocked_thread_id: str | None = None
        self.before_commit = asyncio.Event()
        self.allow_commit = asyncio.Event()
        self._barrier_used = False

    async def aget(self, config):
        return await self.inner.aget(config)

    async def aget_tuple(self, config):
        return await self.inner.aget_tuple(config)

    async def alist(self, config, *, filter=None, before=None, limit=None):
        async for item in self.inner.alist(
            config,
            filter=filter,
            before=before,
            limit=limit,
        ):
            yield item

    async def aput(self, config, checkpoint, metadata, new_versions):
        thread_id = config["configurable"]["thread_id"]
        if thread_id == self.blocked_thread_id and not self._barrier_used:
            self._barrier_used = True
            self.before_commit.set()
            await self.allow_commit.wait()
        return await self.inner.aput(config, checkpoint, metadata, new_versions)

    async def aput_writes(self, config, writes, task_id, task_path=""):
        return await self.inner.aput_writes(config, writes, task_id, task_path)

    async def adelete_thread(self, thread_id):
        return await self.inner.adelete_thread(thread_id)

    def get_next_version(self, current, channel):
        return self.inner.get_next_version(current, channel)

    async def read_generation(self, generation: CheckpointGeneration):
        return await self.inner.aget_tuple(
            {"configurable": {"thread_id": generation.physical_thread_id}}
        )


class ProductionShapedRedisSaver(FullCopyAsyncRedisSaver):
    """Deterministic Redis-boundary adapter without a live Redis service."""

    def __init__(self) -> None:
        BaseCheckpointSaver.__init__(self)
        self.checkpoints: dict[str, dict[tuple[str, str], dict[str, Any]]] = {}
        self.raw_writes: dict[str, list[dict[str, Any]]] = {}
        self.boundaries: list[str] = []

    async def alist(self, config, *, filter=None, before=None, limit=None):
        del filter, before
        thread_id = config["configurable"]["thread_id"]
        items = sorted(
            self.checkpoints.get(thread_id, {}).items(),
            reverse=True,
        )
        if limit is not None:
            items = items[:limit]
        for (checkpoint_ns, checkpoint_id), stored in items:
            writes = [
                raw
                for raw in self.raw_writes.get(thread_id, [])
                if from_storage_safe_str(raw["checkpoint_ns"]) == checkpoint_ns
                and from_storage_safe_id(raw["checkpoint_id"]) == checkpoint_id
            ]
            writes.sort(key=lambda raw: (raw["task_path"], raw["task_id"], raw["idx"]))
            yield CheckpointTuple(
                config={
                    "configurable": {
                        "thread_id": thread_id,
                        "checkpoint_ns": checkpoint_ns,
                        "checkpoint_id": checkpoint_id,
                    }
                },
                checkpoint=deepcopy(stored["checkpoint"]),
                metadata=deepcopy(stored["metadata"]),
                parent_config=(
                    {
                        "configurable": {
                            "thread_id": thread_id,
                            "checkpoint_ns": checkpoint_ns,
                            "checkpoint_id": stored["parent_checkpoint_id"],
                        }
                    }
                    if stored["parent_checkpoint_id"] is not None
                    else None
                ),
                pending_writes=[
                    (
                        raw["task_id"],
                        raw["channel"],
                        self.serde.loads_typed(
                            (raw["type"], self._decode_blob(raw["blob"]))
                        ),
                    )
                    for raw in writes
                ],
            )

    async def aput(self, config, checkpoint, metadata, new_versions):
        del new_versions
        configurable = config["configurable"]
        thread_id = configurable["thread_id"]
        checkpoint_ns = configurable.get("checkpoint_ns", "")
        checkpoint_id = checkpoint["id"]
        parent_checkpoint_id = configurable.get("checkpoint_id")
        if parent_checkpoint_id == checkpoint_id:
            parent_checkpoint_id = None
        self.checkpoints.setdefault(thread_id, {})[(checkpoint_ns, checkpoint_id)] = {
            "checkpoint": deepcopy(checkpoint),
            "metadata": deepcopy(metadata),
            "parent_checkpoint_id": parent_checkpoint_id,
        }
        self.boundaries.extend(["checkpoint_index", "latest_pointer", "checkpoint_ttl"])
        return {
            "configurable": {
                "thread_id": thread_id,
                "checkpoint_ns": checkpoint_ns,
                "checkpoint_id": checkpoint_id,
            }
        }

    async def aput_writes(self, config, writes, task_id, task_path=""):
        configurable = config["configurable"]
        thread_id = configurable["thread_id"]
        for position, (channel, value) in enumerate(writes):
            type_, blob = self.serde.dumps_typed(value)
            self.raw_writes.setdefault(thread_id, []).append(
                {
                    "checkpoint_ns": to_storage_safe_str(
                        configurable.get("checkpoint_ns", "")
                    ),
                    "checkpoint_id": to_storage_safe_id(configurable["checkpoint_id"]),
                    "task_id": task_id,
                    "task_path": task_path,
                    "idx": WRITES_IDX_MAP.get(channel, position),
                    "channel": channel,
                    "type": type_,
                    "blob": self._encode_blob(blob),
                }
            )
        self.boundaries.extend(["write_redis", "write_registry", "write_ttl"])

    async def _aload_full_thread_write_records(self, thread_id: str):
        self.boundaries.append("writes_index")
        return deepcopy(self.raw_writes.get(thread_id, []))


def _memory_write_manifest(saver: InMemorySaver, thread_id: str) -> list[tuple]:
    records = []
    for (stored_thread_id, checkpoint_ns, checkpoint_id), writes in saver.writes.items():
        if stored_thread_id != thread_id:
            continue
        for (task_id, idx), (_task_id, channel, value, task_path) in writes.items():
            records.append(
                (
                    checkpoint_ns,
                    checkpoint_id,
                    task_path,
                    task_id,
                    idx,
                    channel,
                    saver.serde.loads_typed(value),
                )
            )
    return sorted(records, key=repr)


def _redis_write_manifest(saver: ProductionShapedRedisSaver, thread_id: str) -> list[tuple]:
    return sorted(
        (
            record["checkpoint_ns"],
            record["checkpoint_id"],
            record["task_path"],
            record["task_id"],
            record["idx"],
            record["channel"],
            record["type"],
            record["blob"],
        )
        for record in saver.raw_writes.get(thread_id, [])
    )


class FakeSnapshot:
    def __init__(self, ref: "FakeDocumentReference") -> None:
        self._ref = ref
        self.exists = True
        self.update_time = ref.version

    def to_dict(self) -> dict:
        return deepcopy(self._ref.data)


class FakeDocumentReference:
    """Minimal Firestore CAS document used by the real generation store."""

    def __init__(self, data: dict) -> None:
        self.data = deepcopy(data)
        self.version = 1

    def get(self, **_kwargs) -> FakeSnapshot:
        return FakeSnapshot(self)

    def update(self, updates: dict, *, option, **_kwargs) -> None:
        expected_version = getattr(option, "_last_update_time", None)
        if expected_version is not None and expected_version != self.version:
            raise RuntimeError("unexpected CAS conflict")
        self.data.update(deepcopy(updates))
        self.version += 1


def _generation_record(generation: CheckpointGeneration) -> dict[str, Any]:
    return {
        "logical_thread_id": generation.logical_thread_id,
        "physical_thread_id": generation.physical_thread_id,
        "run_id": generation.run_id,
        "fence": generation.fence,
        "source_generation": (
            _generation_record(generation.source_generation)
            if generation.source_generation is not None
            else None
        ),
    }


def _acquisition(
    generation: CheckpointGeneration,
    *,
    active: CheckpointGeneration | None = None,
) -> TaskRunAcquisition:
    return TaskRunAcquisition(
        acquired=True,
        run_id=generation.run_id,
        fence=generation.fence,
        lease_expires_at=WALL_NOW + timedelta(seconds=30),
        previous_status="",
        previous_task_mode="normal",
        reserved_checkpoint_generation=generation,
        active_checkpoint_generation=active,
    )


def _checkpoint(checkpoint_id: str, value: str) -> dict:
    checkpoint = empty_checkpoint()
    checkpoint["id"] = checkpoint_id
    checkpoint["channel_values"] = {"messages": [value]}
    checkpoint["channel_versions"] = {
        "messages": f"{int(checkpoint_id):032}.0"
    }
    checkpoint["updated_channels"] = ["messages"]
    return checkpoint


async def _seed_checkpoint(
    saver: InMemorySaver,
    physical_thread_id: str,
    checkpoint_id: str,
    value: str,
    *,
    parent_config: dict | None = None,
    checkpoint_ns: str = "",
) -> dict:
    config = deepcopy(parent_config) if parent_config is not None else {"configurable": {}}
    config["configurable"]["thread_id"] = physical_thread_id
    config["configurable"]["checkpoint_ns"] = checkpoint_ns
    checkpoint = _checkpoint(checkpoint_id, value)
    return await saver.aput(
        config,
        checkpoint,
        {"source": "loop", "step": 1, "parents": {}},
        checkpoint["channel_versions"],
    )


def test_fresh_generation_identity_is_frozen_and_canonical() -> None:
    generation = create_checkpoint_generation("user-1:conversation-1", "run-a", 7)

    assert generation.logical_thread_id == "user-1:conversation-1"
    assert generation.run_id == "run-a"
    assert generation.fence == 7
    assert generation.source_generation is None
    assert generation.physical_thread_id == "user-1:conversation-1:checkpoint-generation:7:run-a"
    with pytest.raises(FrozenInstanceError):
        generation.fence = 8  # type: ignore[misc]


@pytest.mark.asyncio
async def test_fresh_generation_starts_empty_without_deleting_prior_state() -> None:
    saver = InMemorySaver()
    old_generation = create_checkpoint_generation("user-1:conversation-1", "run-old", 2)
    await _seed_checkpoint(saver, old_generation.physical_thread_id, "0001", "old-state")
    generation = create_checkpoint_generation("user-1:conversation-1", "run-a", 3)
    acquisition = _acquisition(generation, active=old_generation)
    store = GenerationStateStore(owner="run-a", fence=3, reserved=generation, active=old_generation)
    control = RunControl(deadline_monotonic=100.0, tool_limit=20)

    checkpointer = await prepare_checkpoint_generation(
        saver,
        conversation_id="conversation-1",
        acquisition=acquisition,
        task_state_store=store,
        run_control=control,
        monotonic=lambda: 1.0,
    )

    assert isinstance(checkpointer, GenerationCheckpointer)
    assert await checkpointer.aget_tuple(
        {"configurable": {"thread_id": generation.logical_thread_id}}
    ) is None
    assert store.active == generation
    old_state = await saver.aget_tuple(
        {"configurable": {"thread_id": old_generation.physical_thread_id}}
    )
    assert old_state is not None
    assert old_state.checkpoint["channel_values"]["messages"] == ["old-state"]


@pytest.mark.asyncio
async def test_fresh_generation_rewrites_every_async_saver_path() -> None:
    saver = InMemorySaver()
    generation = create_checkpoint_generation("user-1:conversation-1", "run-a", 1)
    control = RunControl(deadline_monotonic=100.0, tool_limit=20)
    checkpointer = GenerationCheckpointer(
        saver,
        generation,
        reserved_generation=generation,
        active_generation=generation,
        run_control=control,
        monotonic=lambda: 1.0,
    )
    logical_config = {
        "configurable": {
            "thread_id": generation.logical_thread_id,
            "checkpoint_ns": "",
        }
    }
    checkpoint = _checkpoint("0001", "generation-state")

    written = await checkpointer.aput(
        logical_config,
        checkpoint,
        {"source": "loop", "step": 1, "parents": {}},
        checkpoint["channel_versions"],
    )
    await checkpointer.aput_writes(
        written,
        [("messages", "pending-state")],
        "task-1",
        "tools",
    )

    assert await saver.aget_tuple(logical_config) is None
    assert await checkpointer.aget(logical_config) == checkpoint
    listed = [item async for item in checkpointer.alist(None)]
    assert len(listed) == 1
    assert listed[0].config["configurable"]["thread_id"] == generation.logical_thread_id
    assert listed[0].pending_writes == [("task-1", "messages", "pending-state")]

    await checkpointer.adelete_thread(generation.logical_thread_id)
    assert await saver.aget_tuple(
        {"configurable": {"thread_id": generation.physical_thread_id}}
    ) is None


def test_fresh_generation_rewrites_every_sync_saver_path() -> None:
    saver = InMemorySaver()
    generation = create_checkpoint_generation("user-1:conversation-1", "run-a", 1)
    checkpointer = GenerationCheckpointer(
        saver,
        generation,
        reserved_generation=generation,
        active_generation=generation,
        run_control=RunControl(deadline_monotonic=100.0, tool_limit=20),
        monotonic=lambda: 1.0,
    )
    logical_config = {
        "configurable": {
            "thread_id": generation.logical_thread_id,
            "checkpoint_ns": "subgraph",
        }
    }
    checkpoint = _checkpoint("0001", "generation-state")

    written = checkpointer.put(
        logical_config,
        checkpoint,
        {"source": "loop", "step": 1, "parents": {}},
        checkpoint["channel_versions"],
    )
    checkpointer.put_writes(
        written,
        [("messages", "pending-state")],
        "task-1",
        "tools",
    )

    assert saver.get_tuple(logical_config) is None
    assert checkpointer.get(logical_config) == checkpoint
    listed = list(checkpointer.list(None))
    assert len(listed) == 1
    assert listed[0].config["configurable"]["thread_id"] == generation.logical_thread_id
    assert listed[0].pending_writes == [("task-1", "messages", "pending-state")]

    checkpointer.delete_thread(generation.logical_thread_id)
    assert saver.get_tuple(
        {"configurable": {"thread_id": generation.physical_thread_id}}
    ) is None


@pytest.mark.asyncio
async def test_preparation_rejects_target_state_in_non_default_namespace() -> None:
    saver = InMemorySaver()
    generation = create_checkpoint_generation("user-1:conversation-1", "run-a", 3)
    await _seed_checkpoint(
        saver,
        generation.physical_thread_id,
        "0001",
        "unexpected-target-state",
        checkpoint_ns="subgraph",
    )
    store = GenerationStateStore(owner="run-a", fence=3, reserved=generation, active=None)

    with pytest.raises(RuntimeError, match="not empty"):
        await prepare_checkpoint_generation(
            saver,
            conversation_id="conversation-1",
            acquisition=_acquisition(generation),
            task_state_store=store,
            run_control=RunControl(deadline_monotonic=100.0, tool_limit=20),
            monotonic=lambda: 1.0,
        )

    assert store.active is None


@pytest.mark.asyncio
async def test_resume_clone_preserves_checkpoint_and_pending_write_fidelity() -> None:
    saver = FullCopyInMemorySaver()
    source = create_checkpoint_generation("user-1:conversation-1", "run-old", 4)
    first_config = await _seed_checkpoint(
        saver,
        source.physical_thread_id,
        "0001",
        "source-state-1",
    )
    source_config = await _seed_checkpoint(
        saver,
        source.physical_thread_id,
        "0002",
        "source-state-2",
        parent_config=first_config,
    )
    await saver.aput_writes(source_config, [("messages", "pending-state")], "task-1", "tools")
    generation = create_checkpoint_generation(
        "user-1:conversation-1",
        "run-a",
        5,
        source_generation=source,
    )
    acquisition = _acquisition(generation, active=source)
    store = GenerationStateStore(owner="run-a", fence=5, reserved=generation, active=source)

    checkpointer = await prepare_checkpoint_generation(
        saver,
        conversation_id="conversation-1",
        acquisition=acquisition,
        task_state_store=store,
        run_control=RunControl(deadline_monotonic=100.0, tool_limit=20),
        monotonic=lambda: 1.0,
    )

    cloned = await checkpointer.aget_tuple(
        {"configurable": {"thread_id": generation.logical_thread_id}}
    )
    source_state = await saver.aget_tuple(
        {"configurable": {"thread_id": source.physical_thread_id}}
    )
    assert cloned is not None and source_state is not None
    assert cloned.checkpoint == source_state.checkpoint
    assert cloned.metadata == source_state.metadata
    assert cloned.pending_writes == source_state.pending_writes
    assert cloned.config["configurable"]["thread_id"] == generation.logical_thread_id
    assert store.active == generation


@pytest.mark.asyncio
async def test_resume_clone_preserves_real_multi_namespace_state() -> None:
    saver = FullCopyInMemorySaver()
    source = create_checkpoint_generation("user-1:conversation-1", "run-old", 4)
    sub_first = await _seed_checkpoint(
        saver,
        source.physical_thread_id,
        "1001",
        "sub-1",
        checkpoint_ns="worker",
    )
    sub_latest = await _seed_checkpoint(
        saver,
        source.physical_thread_id,
        "1002",
        "sub-2",
        parent_config=sub_first,
        checkpoint_ns="worker",
    )
    root_first = await _seed_checkpoint(
        saver,
        source.physical_thread_id,
        "0001",
        "root-1",
    )
    root_latest = await _seed_checkpoint(
        saver,
        source.physical_thread_id,
        "0002",
        "root-2",
        parent_config=root_first,
    )
    await saver.aput_writes(
        root_latest,
        [("messages", "root-pending"), ("custom", {"root": 2})],
        "root-task",
        "root-path",
    )
    await saver.aput_writes(
        sub_latest,
        [("messages", "sub-pending"), ("custom", {"sub": 2})],
        "sub-task",
        "sub-path",
    )
    generation = create_checkpoint_generation(
        "user-1:conversation-1",
        "run-a",
        5,
        source_generation=source,
    )
    store = GenerationStateStore(owner="run-a", fence=5, reserved=generation, active=source)

    await prepare_checkpoint_generation(
        saver,
        conversation_id="conversation-1",
        acquisition=_acquisition(generation, active=source),
        task_state_store=store,
        run_control=RunControl(deadline_monotonic=100.0, tool_limit=20),
        monotonic=lambda: 1.0,
    )

    target_items = [
        item
        async for item in saver.alist(
            {"configurable": {"thread_id": generation.physical_thread_id}}
        )
    ]
    by_identity = {
        (
            item.config["configurable"]["checkpoint_ns"],
            item.config["configurable"]["checkpoint_id"],
        ): item
        for item in target_items
    }
    assert set(by_identity) == {
        ("", "0001"),
        ("", "0002"),
        ("worker", "1001"),
        ("worker", "1002"),
    }
    assert by_identity[("", "0002")].parent_config["configurable"]["checkpoint_id"] == "0001"
    assert by_identity[("worker", "1002")].parent_config["configurable"]["checkpoint_id"] == "1001"
    assert by_identity[("", "0002")].pending_writes == [
        ("root-task", "messages", "root-pending"),
        ("root-task", "custom", {"root": 2}),
    ]
    assert by_identity[("worker", "1002")].pending_writes == [
        ("sub-task", "messages", "sub-pending"),
        ("sub-task", "custom", {"sub": 2}),
    ]
    assert store.active == generation


@pytest.mark.asyncio
async def test_in_memory_full_copy_preserves_hidden_task_paths_without_aliasing() -> None:
    saver = FullCopyInMemorySaver()
    source = create_checkpoint_generation("user-1:conversation-1", "run-old", 4)
    source_config = await _seed_checkpoint(
        saver,
        source.physical_thread_id,
        "0001",
        "source-state",
    )
    await saver.aput_writes(
        source_config,
        [(TASKS, {"send": "task-a"})],
        "task-a",
        "z-path",
    )
    await saver.aput_writes(
        source_config,
        [(TASKS, {"send": "task-z"})],
        "task-z",
        "a-path",
    )
    generation = create_checkpoint_generation(
        "user-1:conversation-1",
        "run-a",
        5,
        source_generation=source,
    )
    store = GenerationStateStore(owner="run-a", fence=5, reserved=generation, active=source)

    await prepare_checkpoint_generation(
        saver,
        conversation_id="conversation-1",
        acquisition=_acquisition(generation, active=source),
        task_state_store=store,
        run_control=RunControl(deadline_monotonic=100.0, tool_limit=20),
        monotonic=lambda: 1.0,
    )

    assert _memory_write_manifest(
        saver,
        generation.physical_thread_id,
    ) == _memory_write_manifest(saver, source.physical_thread_id)
    assert saver.storage[generation.physical_thread_id] is not saver.storage[
        source.physical_thread_id
    ]
    assert saver.storage[generation.physical_thread_id][""] is not saver.storage[
        source.physical_thread_id
    ][""]


@pytest.mark.asyncio
async def test_resume_clone_fails_closed_when_saver_has_no_full_copy_capability() -> None:
    saver = InMemorySaver()
    source = create_checkpoint_generation("user-1:conversation-1", "run-old", 4)
    await _seed_checkpoint(saver, source.physical_thread_id, "0001", "source-state")
    generation = create_checkpoint_generation(
        "user-1:conversation-1",
        "run-a",
        5,
        source_generation=source,
    )
    store = GenerationStateStore(owner="run-a", fence=5, reserved=generation, active=source)

    with pytest.raises(RuntimeError, match="full-thread copy"):
        await prepare_checkpoint_generation(
            saver,
            conversation_id="conversation-1",
            acquisition=_acquisition(generation, active=source),
            task_state_store=store,
            run_control=RunControl(deadline_monotonic=100.0, tool_limit=20),
            monotonic=lambda: 1.0,
        )

    assert store.active == source


@pytest.mark.asyncio
async def test_redis_full_copy_preserves_raw_write_identity_through_owned_boundaries() -> None:
    saver = ProductionShapedRedisSaver()
    source = create_checkpoint_generation("user-1:conversation-1", "run-old", 4)
    first_config = await _seed_checkpoint(
        saver,
        source.physical_thread_id,
        "0001",
        "source-state-1",
    )
    latest_config = await _seed_checkpoint(
        saver,
        source.physical_thread_id,
        "0002",
        "source-state-2",
        parent_config=first_config,
    )
    await saver.aput_writes(
        latest_config,
        [(TASKS, {"send": "task-a"})],
        "task-a",
        "z-path",
    )
    await saver.aput_writes(
        latest_config,
        [(TASKS, {"send": "task-z"})],
        "task-z",
        "a-path",
    )
    await saver.aput_writes(
        latest_config,
        [(TASKS, {"send": "regular-at-zero"}), ("__interrupt__", "special")],
        "task-mixed",
        "m-path",
    )
    saver.boundaries.clear()
    generation = create_checkpoint_generation(
        "user-1:conversation-1",
        "run-a",
        5,
        source_generation=source,
    )
    store = GenerationStateStore(owner="run-a", fence=5, reserved=generation, active=source)

    await prepare_checkpoint_generation(
        saver,
        conversation_id="conversation-1",
        acquisition=_acquisition(generation, active=source),
        task_state_store=store,
        run_control=RunControl(deadline_monotonic=100.0, tool_limit=20),
        monotonic=lambda: 1.0,
    )

    assert _redis_write_manifest(
        saver,
        generation.physical_thread_id,
    ) == _redis_write_manifest(saver, source.physical_thread_id)
    assert {
        "writes_index",
        "checkpoint_index",
        "latest_pointer",
        "checkpoint_ttl",
        "write_redis",
        "write_registry",
        "write_ttl",
    } <= set(saver.boundaries)
    assert saver.boundaries.count("writes_index") == 3
    target_latest = saver.checkpoints[generation.physical_thread_id][("", "0002")]
    assert target_latest["parent_checkpoint_id"] == "0001"
    assert store.active == generation


@pytest.mark.asyncio
async def test_redis_full_copy_pages_complete_raw_write_index() -> None:
    documents = [
        {
            "checkpoint_ns": "",
            "checkpoint_id": "0001",
            "task_id": f"task-{index}",
            "task_path": f"path-{index}",
            "idx": 0,
            "channel": TASKS,
            "type": "json",
            "$.blob": "e30=",
        }
        for index in range(3)
    ]

    class PagedWriteIndex:
        def __init__(self) -> None:
            self.offsets: list[int] = []

        async def search(self, query):
            self.offsets.append(query._offset)
            return SimpleNamespace(
                docs=documents[query._offset : query._offset + query._num]
            )

    saver = object.__new__(FullCopyAsyncRedisSaver)
    saver._COPY_PAGE_SIZE = 2
    saver.checkpoint_writes_index = PagedWriteIndex()

    records = await FullCopyAsyncRedisSaver._aload_full_thread_write_records(
        saver,
        "source-thread",
    )

    assert [record["task_id"] for record in records] == [
        "task-0",
        "task-1",
        "task-2",
    ]
    assert saver.checkpoint_writes_index.offsets == [0, 2]


def test_redis_full_copy_rejects_fractional_effective_index() -> None:
    saver = ProductionShapedRedisSaver()
    type_, blob = saver.serde.dumps_typed({"send": "task"})

    with pytest.raises(RuntimeError, match="effective index"):
        saver._normalize_write_record(
            {
                "checkpoint_ns": to_storage_safe_str(""),
                "checkpoint_id": to_storage_safe_id("0001"),
                "task_id": "task-1",
                "task_path": "path-1",
                "idx": 0.5,
                "channel": TASKS,
                "type": type_,
                "blob": saver._encode_blob(blob),
            }
        )


@pytest.mark.asyncio
async def test_resume_clone_failure_never_activates_reserved_generation_or_enters_graph(
    monkeypatch,
) -> None:
    class FailingCloneSaver(FullCopyInMemorySaver):
        async def acopy_thread(self, source_thread_id, target_thread_id):
            await super().acopy_thread(source_thread_id, target_thread_id)
            del self.storage[target_thread_id][""]["0002"]
            raise RuntimeError("clone storage unavailable")

    saver = FailingCloneSaver()
    source = create_checkpoint_generation("user-1:conversation-1", "run-old", 4)
    await _seed_checkpoint(saver, source.physical_thread_id, "0001", "source-state-1")
    await _seed_checkpoint(saver, source.physical_thread_id, "0002", "source-state-2")
    generation = create_checkpoint_generation(
        "user-1:conversation-1",
        "run-a",
        5,
        source_generation=source,
    )
    acquisition = _acquisition(generation, active=source)
    store = GenerationStateStore(owner="run-a", fence=5, reserved=generation, active=source)
    graph_entries: list[bool] = []

    class FakeLease:
        def __init__(self, *_args, **_kwargs) -> None:
            self.acquired = False
            self.run_id = "run-a"
            self.fence = 5

        async def acquire(self):
            self.acquired = True
            return acquisition

        def register_stream_task(self, _task) -> None:
            return None

        def ensure_owned(self) -> None:
            return None

        async def interrupt(self, _reason):
            self.acquired = False
            return True

        async def close(self):
            return None

    def build_agent(*_args, **_kwargs):
        graph_entries.append(True)
        return object()

    from langgraph_orchestration import stream_conversation as stream_module
    from service.conversations.run_context import resolve_run_policy

    monkeypatch.setattr(stream_module, "TaskRunLease", FakeLease)
    monkeypatch.setattr(stream_module, "get_checkpointer", lambda: saver)
    monkeypatch.setattr(
        stream_module,
        "get_conversation_task_state_store",
        lambda: store,
    )
    monkeypatch.setattr(stream_module, "build_react_agent", build_agent)
    policy = resolve_run_policy(
        "continue",
        "normal",
        "normal",
        "bedrock",
        "provider.model-v1",
        False,
    )

    events = [
        event
        async for event in stream_module.stream_conversation(
            "conversation-1",
            "continue",
            "user-1",
            run_policy=policy,
            resume={"continue_task": True},
        )
    ]

    assert events
    assert graph_entries == []
    assert store.active == source
    assert store.reserved == generation
    partial = await saver.aget_tuple(
        {"configurable": {"thread_id": generation.physical_thread_id}}
    )
    assert partial is not None
    assert partial.checkpoint["channel_values"]["messages"] == ["source-state-1"]


def test_takeover_acquisition_reserves_one_generation_without_activating_it(monkeypatch) -> None:
    source = create_checkpoint_generation("user-1:conversation-1", "run-old", 4)
    ref = FakeDocumentReference(
        {
            "task_status": "resumable_interrupt",
            "task_mode": "long_task",
            "task_run_fence": 4,
            "reserved_checkpoint_generation": _generation_record(source),
            "active_checkpoint_generation": _generation_record(source),
        }
    )
    store = FirestoreConversationTaskStateStore()
    monkeypatch.setattr(store, "_conversation_ref", lambda _conversation_id: ref)

    result = store.try_acquire_task_run(
        "conversation-1",
        "tool_task",
        "run-b",
        30,
        "user-1:conversation-1",
        True,
    )

    assert result.reserved_checkpoint_generation.run_id == "run-b"
    assert result.reserved_checkpoint_generation.fence == 5
    assert result.reserved_checkpoint_generation.source_generation == result.active_checkpoint_generation
    assert ref.data["reserved_checkpoint_generation"] == _generation_record(
        result.reserved_checkpoint_generation
    )
    assert ref.data["active_checkpoint_generation"] == _generation_record(
        result.active_checkpoint_generation
    )


def test_resume_acquisition_without_active_source_never_reserves_empty_generation(
    monkeypatch,
) -> None:
    ref = FakeDocumentReference(
        {
            "task_status": "resumable_interrupt",
            "task_mode": "long_task",
            "task_run_fence": 4,
        }
    )
    store = FirestoreConversationTaskStateStore()
    monkeypatch.setattr(store, "_conversation_ref", lambda _conversation_id: ref)

    with pytest.raises(RuntimeError, match="resumable checkpoint source"):
        store.try_acquire_task_run(
            "conversation-1",
            "tool_task",
            "run-b",
            30,
            "user-1:conversation-1",
            True,
        )

    assert ref.data["task_status"] == "resumable_interrupt"
    assert "reserved_checkpoint_generation" not in ref.data
    assert ref.version == 1


@pytest.mark.parametrize(
    "status",
    [
        "paused_error",
        "paused_cancelled",
        "paused_step_limit",
        "",
        "running",
    ],
)
def test_resume_rejects_every_non_resumable_status_before_mutation(
    monkeypatch,
    status: str,
) -> None:
    source = create_checkpoint_generation("user-1:conversation-1", "run-old", 4)
    data = {
        "task_status": status,
        "task_mode": "long_task",
        "task_run_fence": 4,
        "reserved_checkpoint_generation": _generation_record(source),
        "active_checkpoint_generation": _generation_record(source),
    }
    if status == "running":
        data.update(
            {
                "task_run_id": "run-old",
                "task_lease_expires_at": datetime(2000, 1, 1, tzinfo=timezone.utc),
            }
        )
    ref = FakeDocumentReference(data)
    store = FirestoreConversationTaskStateStore()
    monkeypatch.setattr(store, "_conversation_ref", lambda _conversation_id: ref)

    with pytest.raises(RuntimeError, match="resumable checkpoint source"):
        store.try_acquire_task_run(
            "conversation-1",
            "tool_task",
            "run-b",
            30,
            "user-1:conversation-1",
            True,
        )

    assert ref.data == data
    assert ref.version == 1


def test_resume_rejects_mismatched_reserved_and_active_source_identity_before_mutation(
    monkeypatch,
) -> None:
    source = create_checkpoint_generation("user-1:conversation-1", "run-old", 4)
    mismatched = create_checkpoint_generation("user-1:conversation-1", "run-other", 3)
    data = {
        "task_status": "resumable_interrupt",
        "task_mode": "long_task",
        "task_run_fence": 4,
        "reserved_checkpoint_generation": _generation_record(mismatched),
        "active_checkpoint_generation": _generation_record(source),
    }
    ref = FakeDocumentReference(data)
    store = FirestoreConversationTaskStateStore()
    monkeypatch.setattr(store, "_conversation_ref", lambda _conversation_id: ref)

    with pytest.raises(RuntimeError, match="resumable checkpoint source"):
        store.try_acquire_task_run(
            "conversation-1",
            "tool_task",
            "run-b",
            30,
            "user-1:conversation-1",
            True,
        )

    assert ref.data == data
    assert ref.version == 1


@pytest.mark.asyncio
async def test_stale_blocked_write_cannot_become_active_after_takeover(monkeypatch) -> None:
    logical_thread_id = "user-1:conversation-1"
    generation_a = create_checkpoint_generation(logical_thread_id, "run-a", 1)
    generation_b = create_checkpoint_generation(logical_thread_id, "run-b", 2)
    future_expiry = datetime(2099, 1, 1, tzinfo=timezone.utc)
    ref = FakeDocumentReference(
        {
            "task_status": "running",
            "task_mode": "normal",
            "task_run_id": "run-a",
            "task_run_fence": 1,
            "task_lease_expires_at": future_expiry,
            "reserved_checkpoint_generation": _generation_record(generation_a),
            "active_checkpoint_generation": _generation_record(generation_a),
        }
    )
    store = FirestoreConversationTaskStateStore()
    monkeypatch.setattr(store, "_conversation_ref", lambda _conversation_id: ref)
    saver = BarrierCheckpointSaver()
    saver.blocked_thread_id = generation_a.physical_thread_id
    control_a = RunControl(deadline_monotonic=100.0, tool_limit=20)
    checkpointer_a = GenerationCheckpointer(
        saver,
        generation_a,
        reserved_generation=generation_a,
        active_generation=generation_a,
        run_control=control_a,
        monotonic=lambda: 1.0,
    )
    checkpoint_a = _checkpoint("0001", "checkpoint-a")
    write_a = asyncio.create_task(
        checkpointer_a.aput(
            {"configurable": {"thread_id": logical_thread_id, "checkpoint_ns": ""}},
            checkpoint_a,
            {"source": "loop", "step": 1, "parents": {}},
            checkpoint_a["channel_versions"],
        )
    )
    await saver.before_commit.wait()

    ref.data.update(
        {
            "task_run_id": "run-b",
            "task_run_fence": 2,
            "reserved_checkpoint_generation": _generation_record(generation_b),
        }
    )
    assert store.activate_checkpoint_generation(
        "conversation-1",
        generation_b,
        "run-b",
        2,
    ) is True
    control_a.mark_ownership_lost()
    checkpointer_b = GenerationCheckpointer(
        saver,
        generation_b,
        reserved_generation=generation_b,
        active_generation=generation_b,
        run_control=RunControl(deadline_monotonic=100.0, tool_limit=20),
        monotonic=lambda: 1.0,
    )
    checkpoint_b = _checkpoint("0001", "checkpoint-b")
    await checkpointer_b.aput(
        {"configurable": {"thread_id": logical_thread_id, "checkpoint_ns": ""}},
        checkpoint_b,
        {"source": "loop", "step": 1, "parents": {}},
        checkpoint_b["channel_versions"],
    )
    saver.allow_commit.set()
    await write_a

    assert ref.data["active_checkpoint_generation"] == _generation_record(generation_b)
    state_b = await saver.read_generation(generation_b)
    state_a = await saver.read_generation(generation_a)
    assert state_b is not None and state_a is not None
    assert state_b.checkpoint["channel_values"]["messages"] == ["checkpoint-b"]
    assert state_a.checkpoint["channel_values"]["messages"] == ["checkpoint-a"]


@pytest.mark.asyncio
async def test_generation_access_rejects_expired_run_deadline() -> None:
    generation = create_checkpoint_generation("user-1:conversation-1", "run-a", 1)
    control = RunControl(deadline_monotonic=5.0, tool_limit=20)
    with pytest.raises(RuntimeError, match="deadline"):
        GenerationCheckpointer(
            InMemorySaver(),
            generation,
            reserved_generation=generation,
            active_generation=generation,
            run_control=control,
            monotonic=lambda: 5.0,
        )
