"""Repository-owned full-fidelity checkpoint saver implementations."""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from copy import deepcopy
from dataclasses import dataclass
from typing import Any

from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.base import WRITES_IDX_MAP, BaseCheckpointSaver, CheckpointTuple
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.checkpoint.redis.aio import AsyncRedisSaver
from langgraph.checkpoint.redis.key_registry import WRITE_KEYS_ZSET_PREFIX
from langgraph.checkpoint.redis.util import (
    from_storage_safe_id,
    from_storage_safe_str,
    to_storage_safe_id,
)
from redisvl.query import FilterQuery
from redisvl.query.filter import Tag


@dataclass(frozen=True)
class _ThreadManifest:
    checkpoints: tuple[tuple[Any, ...], ...]
    blobs: tuple[tuple[Any, ...], ...]
    writes: tuple[tuple[Any, ...], ...]

    @property
    def empty(self) -> bool:
        return not (self.checkpoints or self.blobs or self.writes)


@dataclass(frozen=True)
class _RedisWriteRecord:
    checkpoint_ns: str
    checkpoint_id: str
    task_id: str
    task_path: str
    idx: int
    channel: str
    type_: str
    blob: bytes


@dataclass(frozen=True)
class _RedisThreadManifest:
    checkpoints: tuple[tuple[Any, ...], ...]
    writes: tuple[_RedisWriteRecord, ...]

    @property
    def empty(self) -> bool:
        return not (self.checkpoints or self.writes)


class FullCopyInMemorySaver(InMemorySaver):
    """In-memory saver with an exact, isolated full-thread copy implementation."""

    async def adelete_user_threads(self, user_id: str) -> None:
        """Erase all account-owned generations, including orphan blobs and writes."""
        prefix = f"{user_id}:"
        for thread_id in list(self.storage):
            if thread_id.startswith(prefix):
                del self.storage[thread_id]
        for key in list(self.blobs):
            if key[0].startswith(prefix):
                del self.blobs[key]
        for key in list(self.writes):
            if key[0].startswith(prefix):
                del self.writes[key]

    async def acopy_thread(self, source_thread_id: str, target_thread_id: str) -> None:
        if source_thread_id == target_thread_id:
            raise RuntimeError("Checkpoint source and target threads must differ.")
        source_manifest = self._full_thread_manifest(source_thread_id)
        if not source_manifest.checkpoints:
            raise RuntimeError("Resumable checkpoint source generation is empty.")
        if not self._full_thread_manifest(target_thread_id).empty:
            raise RuntimeError("Reserved checkpoint generation is not empty before copy.")

        source_storage = self.storage.get(source_thread_id)
        if source_storage is not None:
            self.storage[target_thread_id] = deepcopy(source_storage)
        for (thread_id, checkpoint_ns, channel, version), value in list(self.blobs.items()):
            if thread_id == source_thread_id:
                self.blobs[(target_thread_id, checkpoint_ns, channel, version)] = deepcopy(value)
        for (thread_id, checkpoint_ns, checkpoint_id), value in list(self.writes.items()):
            if thread_id == source_thread_id:
                self.writes[(target_thread_id, checkpoint_ns, checkpoint_id)] = deepcopy(value)

        if self._full_thread_manifest(target_thread_id) != source_manifest:
            raise RuntimeError("Checkpoint full-thread copy verification failed.")

    def _full_thread_manifest(self, thread_id: str) -> _ThreadManifest:
        checkpoints = []
        thread_storage = self.storage.get(thread_id)
        if thread_storage is not None:
            for checkpoint_ns, namespace_storage in thread_storage.items():
                for checkpoint_id, (checkpoint, metadata, parent_id) in namespace_storage.items():
                    checkpoints.append(
                        (
                            checkpoint_ns,
                            checkpoint_id,
                            deepcopy(checkpoint),
                            deepcopy(metadata),
                            parent_id,
                        )
                    )

        blobs = [
            (
                checkpoint_ns,
                channel,
                version,
                deepcopy(value),
            )
            for (stored_thread_id, checkpoint_ns, channel, version), value in self.blobs.items()
            if stored_thread_id == thread_id
        ]
        writes = [
            (
                checkpoint_ns,
                checkpoint_id,
                task_id,
                idx,
                deepcopy(stored_value),
            )
            for (stored_thread_id, checkpoint_ns, checkpoint_id), checkpoint_writes in self.writes.items()
            if stored_thread_id == thread_id
            for (task_id, idx), stored_value in checkpoint_writes.items()
        ]
        return _ThreadManifest(
            checkpoints=tuple(sorted(checkpoints, key=lambda item: (item[0], item[1]))),
            blobs=tuple(sorted(blobs, key=lambda item: repr(item[:3]))),
            writes=tuple(sorted(writes, key=lambda item: repr(item[:4]))),
        )


class FullCopyAsyncRedisSaver(AsyncRedisSaver):
    """Redis saver that copies through indexed reads and normal saver writes."""

    _COPY_PAGE_SIZE = 1_000
    _DELETE_BATCH_SIZE = 1_000

    async def adelete_user_threads(self, user_id: str) -> None:
        """Erase account-owned keys without relying on live conversation metadata.

        Channel blobs are inline in Redis checkpoints. Scan the other key families
        too so orphan writes, latest pointers, and write registries are erased.
        The caller must prevent account writes while deletion is in progress.
        """
        for key_family in (
            self._checkpoint_prefix,
            f"{self._checkpoint_prefix}_latest",
            self._checkpoint_write_prefix,
            WRITE_KEYS_ZSET_PREFIX,
        ):
            prefix = f"{key_family}:{user_id}:"
            pattern = re.sub(r"([\\*?\[\]])", r"\\\1", prefix) + "*"
            batch: list[str | bytes] = []
            async for key in self._redis.scan_iter(match=pattern, count=self._DELETE_BATCH_SIZE):
                batch.append(key)
                if len(batch) >= self._DELETE_BATCH_SIZE:
                    await self._adelete_account_keys(batch)
                    batch.clear()
            if batch:
                await self._adelete_account_keys(batch)

    async def _adelete_account_keys(self, keys: Sequence[str | bytes]) -> None:
        if self.cluster_mode:
            # Thread namespaces can map to different Redis cluster slots.
            for key in keys:
                await self._redis.delete(key)
        else:
            await self._redis.delete(*keys)

    async def acopy_thread(self, source_thread_id: str, target_thread_id: str) -> None:
        if source_thread_id == target_thread_id:
            raise RuntimeError("Checkpoint source and target threads must differ.")

        source_items = await generation_items(
            self,
            {"configurable": {"thread_id": source_thread_id}},
        )
        source_writes = await self._validated_write_records(source_thread_id, source_items)
        source_manifest = self._full_thread_manifest(source_items, source_writes)
        if not source_manifest.checkpoints:
            raise RuntimeError("Resumable checkpoint source generation is empty.")

        target_items = await generation_items(
            self,
            {"configurable": {"thread_id": target_thread_id}},
        )
        target_writes = await self._validated_write_records(target_thread_id, target_items)
        if not self._full_thread_manifest(target_items, target_writes).empty:
            raise RuntimeError("Reserved checkpoint generation is not empty before copy.")

        written_configs: dict[tuple[str, str], RunnableConfig] = {}
        for identity, item in _parent_first_generation_items(source_items):
            checkpoint_ns, _checkpoint_id = identity
            parent_identity = checkpoint_parent_identity(item)
            configurable: dict[str, Any] = {
                "thread_id": target_thread_id,
                "checkpoint_ns": checkpoint_ns,
            }
            if parent_identity is not None:
                configurable["checkpoint_id"] = parent_identity[1]
            written_configs[identity] = await self.aput(
                {"configurable": configurable},
                deepcopy(item.checkpoint),
                deepcopy(item.metadata),
                deepcopy(item.checkpoint.get("channel_versions", {})),
            )

        grouped_writes: dict[tuple[str, str, str, str], list[_RedisWriteRecord]] = {}
        for record in source_writes:
            group_key = (
                record.checkpoint_ns,
                record.checkpoint_id,
                record.task_id,
                record.task_path,
            )
            grouped_writes.setdefault(group_key, []).append(record)
        for (checkpoint_ns, checkpoint_id, task_id, task_path), records in sorted(
            grouped_writes.items()
        ):
            writes = self._reconstruct_writes(records)
            await self.aput_writes(
                written_configs[(checkpoint_ns, checkpoint_id)],
                writes,
                task_id,
                task_path,
            )

        copied_items = await generation_items(
            self,
            {"configurable": {"thread_id": target_thread_id}},
        )
        copied_writes = await self._validated_write_records(target_thread_id, copied_items)
        if self._full_thread_manifest(copied_items, copied_writes) != source_manifest:
            raise RuntimeError("Checkpoint full-thread copy verification failed.")

    async def _validated_write_records(
        self,
        thread_id: str,
        checkpoint_items: Mapping[tuple[str, str], CheckpointTuple],
    ) -> list[_RedisWriteRecord]:
        records = [
            self._normalize_write_record(raw)
            for raw in await self._aload_full_thread_write_records(thread_id)
        ]
        identities: set[tuple[str, str, str, int]] = set()
        task_paths: dict[tuple[str, str, str], str] = {}
        for record in records:
            checkpoint_identity = (record.checkpoint_ns, record.checkpoint_id)
            if checkpoint_identity not in checkpoint_items:
                raise RuntimeError("Checkpoint write references an unknown checkpoint.")
            identity = (*checkpoint_identity, record.task_id, record.idx)
            if identity in identities:
                raise RuntimeError("Checkpoint writes contain duplicate storage identity.")
            identities.add(identity)
            task_identity = (*checkpoint_identity, record.task_id)
            prior_path = task_paths.setdefault(task_identity, record.task_path)
            if prior_path != record.task_path:
                raise RuntimeError("Checkpoint task writes contain conflicting task paths.")

        grouped: dict[tuple[str, str, str, str], list[_RedisWriteRecord]] = {}
        for record in records:
            key = (
                record.checkpoint_ns,
                record.checkpoint_id,
                record.task_id,
                record.task_path,
            )
            grouped.setdefault(key, []).append(record)
        for group in grouped.values():
            self._reconstruct_writes(group)
        return sorted(records, key=self._write_record_sort_key)

    async def _aload_full_thread_write_records(self, thread_id: str) -> list[Mapping[str, Any]]:
        records: list[Mapping[str, Any]] = []
        offset = 0
        while True:
            query = FilterQuery(
                filter_expression=Tag("thread_id") == to_storage_safe_id(thread_id),
                return_fields=[
                    "checkpoint_ns",
                    "checkpoint_id",
                    "task_id",
                    "task_path",
                    "idx",
                    "channel",
                    "type",
                    "$.blob",
                ],
                num_results=self._COPY_PAGE_SIZE,
            ).paging(offset, self._COPY_PAGE_SIZE)
            result = await self.checkpoint_writes_index.search(query)
            docs = list(result.docs)
            records.extend(self._write_document(doc) for doc in docs)
            if len(docs) < self._COPY_PAGE_SIZE:
                return records
            offset += len(docs)

    @staticmethod
    def _write_document(doc: Any) -> Mapping[str, Any]:
        return {
            "checkpoint_ns": _document_field(doc, "checkpoint_ns"),
            "checkpoint_id": _document_field(doc, "checkpoint_id"),
            "task_id": _document_field(doc, "task_id"),
            "task_path": _document_field(doc, "task_path"),
            "idx": _document_field(doc, "idx"),
            "channel": _document_field(doc, "channel"),
            "type": _document_field(doc, "type"),
            "blob": _document_field(doc, "$.blob", fallback="blob"),
        }

    def _normalize_write_record(self, raw: Any) -> _RedisWriteRecord:
        if isinstance(raw, _RedisWriteRecord):
            return raw
        if not isinstance(raw, Mapping):
            raise RuntimeError("Checkpoint write index returned an invalid record.")
        checkpoint_ns = raw.get("checkpoint_ns")
        checkpoint_id = raw.get("checkpoint_id")
        task_id = raw.get("task_id")
        task_path = raw.get("task_path")
        channel = raw.get("channel")
        type_ = raw.get("type")
        idx = raw.get("idx")
        blob = raw.get("blob")
        if not all(isinstance(value, str) for value in (checkpoint_ns, checkpoint_id)):
            raise RuntimeError("Checkpoint write contains invalid checkpoint identity.")
        if not all(isinstance(value, str) for value in (task_id, task_path, channel, type_)):
            raise RuntimeError("Checkpoint write contains invalid task or value identity.")
        if isinstance(idx, bool):
            raise RuntimeError("Checkpoint write contains an invalid effective index.")
        if isinstance(idx, int):
            normalized_idx = idx
        elif isinstance(idx, float):
            if not idx.is_integer():
                raise RuntimeError("Checkpoint write contains an invalid effective index.")
            normalized_idx = int(idx)
        elif isinstance(idx, str):
            try:
                normalized_idx = int(idx)
            except ValueError as exc:
                raise RuntimeError(
                    "Checkpoint write contains an invalid effective index."
                ) from exc
        else:
            raise RuntimeError("Checkpoint write contains an invalid effective index.")
        if isinstance(blob, str):
            normalized_blob = self._decode_blob(blob)
        elif isinstance(blob, (bytes, bytearray, memoryview)):
            normalized_blob = bytes(blob)
        else:
            raise RuntimeError("Checkpoint write contains an invalid serialized value.")
        return _RedisWriteRecord(
            checkpoint_ns=from_storage_safe_str(checkpoint_ns),
            checkpoint_id=from_storage_safe_id(checkpoint_id),
            task_id=task_id,
            task_path=task_path,
            idx=normalized_idx,
            channel=channel,
            type_=type_,
            blob=normalized_blob,
        )

    def _reconstruct_writes(
        self,
        records: Sequence[_RedisWriteRecord],
    ) -> list[tuple[str, Any]]:
        positions: list[_RedisWriteRecord | None] = [None] * len(records)
        special: list[_RedisWriteRecord] = []
        for record in records:
            special_idx = WRITES_IDX_MAP.get(record.channel)
            if special_idx is not None:
                if record.idx != special_idx:
                    raise RuntimeError("Checkpoint special write has an invalid effective index.")
                special.append(record)
                continue
            if record.idx < 0 or record.idx >= len(records) or positions[record.idx] is not None:
                raise RuntimeError("Checkpoint regular write has an invalid effective index.")
            positions[record.idx] = record

        special_iter = iter(sorted(special, key=self._write_record_sort_key))
        for position, record in enumerate(positions):
            if record is None:
                positions[position] = next(special_iter, None)
        if any(record is None for record in positions) or next(special_iter, None) is not None:
            raise RuntimeError("Checkpoint writes cannot reconstruct their stored indexes.")

        writes = []
        for position, record in enumerate(positions):
            assert record is not None
            if WRITES_IDX_MAP.get(record.channel, position) != record.idx:
                raise RuntimeError("Checkpoint writes cannot reconstruct their stored indexes.")
            writes.append(
                (
                    record.channel,
                    self.serde.loads_typed((record.type_, record.blob)),
                )
            )
        return writes

    @staticmethod
    def _write_record_sort_key(record: _RedisWriteRecord) -> tuple[Any, ...]:
        return (
            record.checkpoint_ns,
            record.checkpoint_id,
            record.task_path,
            record.task_id,
            record.idx,
            record.channel,
            record.type_,
            record.blob,
        )

    @staticmethod
    def _full_thread_manifest(
        checkpoint_items: Mapping[tuple[str, str], CheckpointTuple],
        writes: Sequence[_RedisWriteRecord],
    ) -> _RedisThreadManifest:
        checkpoints = tuple(
            (
                identity,
                checkpoint_parent_identity(item),
                deepcopy(item.checkpoint),
                deepcopy(item.metadata),
            )
            for identity, item in sorted(checkpoint_items.items())
        )
        return _RedisThreadManifest(checkpoints=checkpoints, writes=tuple(writes))


async def generation_items(
    saver: BaseCheckpointSaver,
    config: RunnableConfig,
) -> dict[tuple[str, str], CheckpointTuple]:
    items: dict[tuple[str, str], CheckpointTuple] = {}
    async for item in saver.alist(config):
        configurable = item.config.get("configurable", {})
        checkpoint_ns = configurable.get("checkpoint_ns", "")
        checkpoint_id = configurable.get("checkpoint_id")
        if not isinstance(checkpoint_ns, str) or not isinstance(checkpoint_id, str):
            raise RuntimeError("Checkpoint generation contains invalid checkpoint identity.")
        identity = (checkpoint_ns, checkpoint_id)
        if identity in items:
            raise RuntimeError("Checkpoint generation contains duplicate checkpoint identity.")
        items[identity] = item
    return items


def checkpoint_parent_identity(item: CheckpointTuple) -> tuple[str, str] | None:
    if item.parent_config is None:
        return None
    configurable = item.parent_config.get("configurable", {})
    checkpoint_id = configurable.get("checkpoint_id")
    if checkpoint_id is None:
        return None
    checkpoint_ns = configurable.get("checkpoint_ns", "")
    if not isinstance(checkpoint_ns, str) or not isinstance(checkpoint_id, str):
        raise RuntimeError("Checkpoint generation contains invalid parent identity.")
    return checkpoint_ns, checkpoint_id


def _parent_first_generation_items(
    source_items: Mapping[tuple[str, str], CheckpointTuple],
) -> list[tuple[tuple[str, str], CheckpointTuple]]:
    remaining = dict(source_items)
    ordered = []
    while remaining:
        ready: list[tuple[tuple[str, str], CheckpointTuple]] = []
        for identity, item in remaining.items():
            parent_identity = checkpoint_parent_identity(item)
            if parent_identity is None or parent_identity not in remaining:
                ready.append((identity, item))
        if not ready:
            raise RuntimeError("Checkpoint generation contains a cyclic parent chain.")

        for identity, item in sorted(ready, key=lambda entry: entry[0]):
            checkpoint_ns, _checkpoint_id = identity
            parent_identity = checkpoint_parent_identity(item)
            if parent_identity is not None and parent_identity[0] != checkpoint_ns:
                raise RuntimeError("Checkpoint generation parent crosses checkpoint namespaces.")
            ordered.append((identity, item))
            del remaining[identity]
    return ordered


def _document_field(doc: Any, field: str, *, fallback: str | None = None) -> Any:
    if isinstance(doc, Mapping):
        if field in doc:
            return doc[field]
        if fallback is not None and fallback in doc:
            return doc[fallback]
    try:
        return doc[field]
    except (KeyError, TypeError):
        value = getattr(doc, field, None)
        if value is None and fallback is not None:
            value = getattr(doc, fallback, None)
        return value
