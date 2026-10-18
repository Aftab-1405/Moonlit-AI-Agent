"""Account erasure must cover checkpoint history independently of conversations."""

from __future__ import annotations

import re
from copy import deepcopy

import pytest
from langgraph.checkpoint.base import BaseCheckpointSaver, empty_checkpoint
from langgraph.checkpoint.redis.key_registry import CheckpointKeyRegistry
from redis.commands.core import AsyncScanCommands

from api_contract.run_context import create_checkpoint_generation
from langgraph_orchestration.checkpoint_savers import (
    FullCopyAsyncRedisSaver,
    FullCopyInMemorySaver,
)


@pytest.mark.asyncio
async def test_memory_account_erasure_removes_history_and_orphan_data_only_for_owner():
    saver = FullCopyInMemorySaver()
    for thread_id in (
        "user-1:legacy-conversation",
        "user-1:deleted-conversation",
        *(create_checkpoint_generation("user-1:conversation", f"run-{i}", i).physical_thread_id for i in range(1, 4)),
        "user-10:conversation",
        "another-user:conversation",
    ):
        checkpoint = empty_checkpoint()
        checkpoint["channel_values"] = {"messages": ["private text"]}
        checkpoint["channel_versions"] = {"messages": "1"}
        config = await saver.aput(
            {"configurable": {"thread_id": thread_id, "checkpoint_ns": "nested"}},
            checkpoint,
            {},
            {"messages": "1"},
        )
        await saver.aput_writes(config, [("messages", "pending text")], "task")
    await saver.aput_writes(
        {"configurable": {"thread_id": "user-1:orphan-writes", "checkpoint_id": "missing"}},
        [("messages", "orphan text")],
        "task",
    )
    saver.blobs[("user-1:orphan-blobs", "", "messages", "1")] = ("bytes", b"secret")
    expected_storage = deepcopy({k: v for k, v in saver.storage.items() if not k.startswith("user-1:")})
    expected_writes = deepcopy({k: v for k, v in saver.writes.items() if not k[0].startswith("user-1:")})
    expected_blobs = deepcopy({k: v for k, v in saver.blobs.items() if not k[0].startswith("user-1:")})

    await saver.adelete_user_threads("user-1")
    await saver.adelete_user_threads("user-1")

    assert saver.storage == expected_storage
    assert saver.writes == expected_writes
    assert saver.blobs == expected_blobs
    assert len(saver.storage) == 2


class KeyOnlyRedis(AsyncScanCommands):
    """External Redis boundary with paginated keys and no payload-read methods."""

    def __init__(self, keys, *, cluster_mode=False):
        self.keys = set(keys)
        self.cluster_mode = cluster_mode
        self.delete_error = None
        self.scan_error = None
        self._scan_keys = []

    async def scan(self, cursor=0, match=None, count=None, _type=None):
        if self.scan_error is not None:
            raise self.scan_error
        offset = int(cursor)
        if offset == 0:
            self._scan_keys = sorted(self.keys)
        # Redis glob escapes apply to literal user IDs and configurable prefixes.
        regex = ""
        pos = 0
        while pos < len(match):
            char = match[pos]
            if char == "\\":
                pos += 1
                regex += re.escape(match[pos])
            elif char == "*":
                regex += ".*"
            elif char == "?":
                regex += "."
            elif char == "[":
                end = match.index("]", pos)
                regex += match[pos : end + 1]
                pos = end
            else:
                regex += re.escape(char)
            pos += 1
        # Include empty pages, and retain a stable scan snapshot during deletion.
        keys = [key for key in self._scan_keys[offset : offset + 2] if re.fullmatch(regex, key.decode())]
        next_cursor = offset + 2 if offset + 2 < len(self._scan_keys) else 0
        return next_cursor, keys

    async def delete(self, *keys):
        if self.delete_error is not None:
            raise self.delete_error
        if self.cluster_mode and len(keys) > 1:
            raise RuntimeError("CROSSSLOT")
        before = len(self.keys)
        self.keys.difference_update(keys)
        return before - len(self.keys)


def redis_saver(keys, *, cluster_mode=False, prefix="checkpoint"):
    saver = object.__new__(FullCopyAsyncRedisSaver)
    BaseCheckpointSaver.__init__(saver)
    saver._checkpoint_prefix = prefix
    saver._checkpoint_write_prefix = f"{prefix}_write"
    saver.cluster_mode = cluster_mode
    saver._redis = KeyOnlyRedis(keys, cluster_mode=cluster_mode)
    return saver


@pytest.mark.asyncio
@pytest.mark.parametrize("cluster_mode", [False, True])
@pytest.mark.parametrize("user_id", ["user-1", r"user*?[1]\\"])
async def test_redis_account_erasure_covers_generations_and_orphan_keys(cluster_mode, user_id):
    saver = redis_saver([], cluster_mode=cluster_mode, prefix="custom[1]*?-checkpoint")
    keys = set()
    other_keys = set()
    for owner in (user_id, user_id + "0", "another-user"):
        for thread in (
            f"{owner}:legacy",
            f"{owner}:deleted-conversation",
            *(
                create_checkpoint_generation(f"{owner}:conversation", f"run-{i}", i).physical_thread_id
                for i in range(1, 4)
            ),
        ):
            thread_keys = {
                saver._make_redis_checkpoint_key(thread, "nested", "checkpoint-id"),
                saver._make_redis_checkpoint_latest_key(thread, "nested"),
                saver._make_redis_checkpoint_writes_key(thread, "nested", "checkpoint-id", "task", 0),
                CheckpointKeyRegistry.make_write_keys_zset_key(thread, "nested", "checkpoint-id"),
            }
            keys.update(k.encode() for k in thread_keys)
            if owner != user_id:
                other_keys.update(k.encode() for k in thread_keys)
    keys.update(
        {
            saver._make_redis_checkpoint_writes_key(f"{user_id}:orphan", "", "missing", "task", 0).encode(),
            saver._make_redis_checkpoint_latest_key(f"{user_id}:orphan-pointer", "").encode(),
            CheckpointKeyRegistry.make_write_keys_zset_key(f"{user_id}:orphan-registry", "", "missing").encode(),
        }
    )
    other_keys.add(f"unrelated:{user_id}:value".encode())
    keys.update(other_keys)
    saver._redis.keys = keys
    saver._DELETE_BATCH_SIZE = 3

    await saver.adelete_user_threads(user_id)
    await saver.adelete_user_threads(user_id)

    assert saver._redis.keys == other_keys


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["delete", "scan"])
async def test_redis_account_erasure_propagates_storage_failures(operation):
    saver = redis_saver([b"checkpoint:user-1:conversation:__empty__:checkpoint-id"])
    setattr(saver._redis, f"{operation}_error", RuntimeError("Redis unavailable"))

    with pytest.raises(RuntimeError, match="Redis unavailable"):
        await saver.adelete_user_threads("user-1")
