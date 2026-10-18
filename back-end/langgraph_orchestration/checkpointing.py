"""
Global checkpointer adapter.

Production uses AsyncRedisSaver from langgraph-checkpoint-redis.
Development defaults to InMemorySaver.
"""

import asyncio
import logging
import time
from collections.abc import AsyncIterator, Awaitable, Callable, Iterator, Sequence
from contextlib import AbstractAsyncContextManager
from copy import deepcopy
from typing import Any, Optional, TypeVar

from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.base import (
    BaseCheckpointSaver,
    ChannelVersions,
    Checkpoint,
    CheckpointMetadata,
    CheckpointTuple,
)

from api_contract.orchestration_protocols import (
    ConversationTaskStateStore,
    TaskRunAcquisition,
)
from api_contract.run_context import CheckpointGeneration, RunControl
from config import get_config
from core.account_activity import current_account_user_id, run_account_work
from langgraph_orchestration.checkpoint_savers import (
    FullCopyAsyncRedisSaver,
    FullCopyInMemorySaver,
    checkpoint_parent_identity,
    generation_items,
)

logger = logging.getLogger(__name__)

_checkpointer: Optional[BaseCheckpointSaver] = None
_redis_saver: AbstractAsyncContextManager[FullCopyAsyncRedisSaver] | None = None
_MutationResult = TypeVar("_MutationResult")


async def _await_account_mutation(operation: Callable[[], Awaitable[_MutationResult]]) -> _MutationResult:
    user_id = current_account_user_id.get()
    if user_id is None:
        return await operation()
    return await run_account_work(user_id, operation)


class GenerationCheckpointer(BaseCheckpointSaver):
    """Route one graph attempt exclusively to its immutable physical namespace."""

    def __init__(
        self,
        saver: BaseCheckpointSaver,
        generation: CheckpointGeneration,
        *,
        reserved_generation: CheckpointGeneration,
        active_generation: CheckpointGeneration,
        run_control: RunControl,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        super().__init__(serde=saver.serde)
        self._saver = saver
        self.generation = generation
        self._reserved_generation = reserved_generation
        self._active_generation = active_generation
        self._run_control = run_control
        self._monotonic = monotonic
        self._ensure_access_allowed()

    def _ensure_access_allowed(self) -> None:
        if self._reserved_generation != self.generation:
            raise RuntimeError("Checkpoint generation is not the reserved run generation.")
        if self._active_generation != self.generation:
            raise RuntimeError("Checkpoint generation is not active for this run.")
        self._run_control.ensure_mutation_allowed(now=self._monotonic())

    def _physical_config(self, config: RunnableConfig | None) -> RunnableConfig:
        rewritten: RunnableConfig = dict(config or {})
        configurable = dict(rewritten.get("configurable", {}))
        configurable["thread_id"] = self.generation.physical_thread_id
        rewritten["configurable"] = configurable
        return rewritten

    def _logical_config(self, config: RunnableConfig | None) -> RunnableConfig | None:
        if config is None:
            return None
        rewritten: RunnableConfig = dict(config)
        configurable = dict(rewritten.get("configurable", {}))
        configurable["thread_id"] = self.generation.logical_thread_id
        rewritten["configurable"] = configurable
        return rewritten

    def _logical_tuple(self, item: CheckpointTuple | None) -> CheckpointTuple | None:
        if item is None:
            return None
        return CheckpointTuple(
            config=self._logical_config(item.config),
            checkpoint=item.checkpoint,
            metadata=item.metadata,
            parent_config=self._logical_config(item.parent_config),
            pending_writes=item.pending_writes,
        )

    async def aget_tuple(self, config: RunnableConfig) -> CheckpointTuple | None:
        self._ensure_access_allowed()
        item = await self._saver.aget_tuple(self._physical_config(config))
        self._ensure_access_allowed()
        return self._logical_tuple(item)

    async def alist(
        self,
        config: RunnableConfig | None,
        *,
        filter: dict[str, Any] | None = None,
        before: RunnableConfig | None = None,
        limit: int | None = None,
    ) -> AsyncIterator[CheckpointTuple]:
        self._ensure_access_allowed()
        physical_before = self._physical_config(before) if before is not None else None
        async for item in self._saver.alist(
            self._physical_config(config),
            filter=filter,
            before=physical_before,
            limit=limit,
        ):
            self._ensure_access_allowed()
            logical_item = self._logical_tuple(item)
            if logical_item is not None:
                yield logical_item

    async def aput(
        self,
        config: RunnableConfig,
        checkpoint: Checkpoint,
        metadata: CheckpointMetadata,
        new_versions: ChannelVersions,
    ) -> RunnableConfig:
        self._ensure_access_allowed()
        result = await _await_account_mutation(
            lambda: self._saver.aput(
                self._physical_config(config),
                checkpoint,
                metadata,
                new_versions,
            )
        )
        logical_result = self._logical_config(result)
        if logical_result is None:  # pragma: no cover - saver contract excludes None
            raise RuntimeError("Checkpoint saver returned no configuration.")
        return logical_result

    async def aput_writes(
        self,
        config: RunnableConfig,
        writes: Sequence[tuple[str, Any]],
        task_id: str,
        task_path: str = "",
    ) -> None:
        self._ensure_access_allowed()
        await _await_account_mutation(
            lambda: self._saver.aput_writes(
                self._physical_config(config),
                writes,
                task_id,
                task_path,
            )
        )

    async def adelete_thread(self, thread_id: str) -> None:
        del thread_id
        self._ensure_access_allowed()
        await self._saver.adelete_thread(self.generation.physical_thread_id)

    def get_tuple(self, config: RunnableConfig) -> CheckpointTuple | None:
        self._ensure_access_allowed()
        item = self._saver.get_tuple(self._physical_config(config))
        self._ensure_access_allowed()
        return self._logical_tuple(item)

    def list(
        self,
        config: RunnableConfig | None,
        *,
        filter: dict[str, Any] | None = None,
        before: RunnableConfig | None = None,
        limit: int | None = None,
    ) -> Iterator[CheckpointTuple]:
        self._ensure_access_allowed()
        physical_before = self._physical_config(before) if before is not None else None
        for item in self._saver.list(
            self._physical_config(config),
            filter=filter,
            before=physical_before,
            limit=limit,
        ):
            self._ensure_access_allowed()
            logical_item = self._logical_tuple(item)
            if logical_item is not None:
                yield logical_item

    def put(
        self,
        config: RunnableConfig,
        checkpoint: Checkpoint,
        metadata: CheckpointMetadata,
        new_versions: ChannelVersions,
    ) -> RunnableConfig:
        self._ensure_access_allowed()
        result = self._saver.put(
            self._physical_config(config),
            checkpoint,
            metadata,
            new_versions,
        )
        logical_result = self._logical_config(result)
        if logical_result is None:  # pragma: no cover - saver contract excludes None
            raise RuntimeError("Checkpoint saver returned no configuration.")
        return logical_result

    def put_writes(
        self,
        config: RunnableConfig,
        writes: Sequence[tuple[str, Any]],
        task_id: str,
        task_path: str = "",
    ) -> None:
        self._ensure_access_allowed()
        self._saver.put_writes(
            self._physical_config(config),
            writes,
            task_id,
            task_path,
        )

    def delete_thread(self, thread_id: str) -> None:
        del thread_id
        self._ensure_access_allowed()
        self._saver.delete_thread(self.generation.physical_thread_id)

    def get_next_version(self, current, channel):
        return self._saver.get_next_version(current, channel)


async def prepare_checkpoint_generation(
    saver: BaseCheckpointSaver,
    *,
    conversation_id: str,
    acquisition: TaskRunAcquisition,
    task_state_store: ConversationTaskStateStore,
    run_control: RunControl,
    monotonic: Callable[[], float] = time.monotonic,
) -> GenerationCheckpointer:
    """Verify one reserved generation, owner-CAS activate it, and return its adapter."""
    generation = acquisition.reserved_checkpoint_generation
    if generation.run_id != acquisition.run_id or generation.fence != acquisition.fence:
        raise RuntimeError("Reserved checkpoint generation does not match the lease owner.")
    run_control.ensure_mutation_allowed(now=monotonic())

    if acquisition.active_checkpoint_generation == generation:
        return GenerationCheckpointer(
            saver,
            generation,
            reserved_generation=generation,
            active_generation=generation,
            run_control=run_control,
            monotonic=monotonic,
        )

    target_config = {"configurable": {"thread_id": generation.physical_thread_id}}
    async for _item in saver.alist(target_config, limit=1):
        raise RuntimeError("Reserved checkpoint generation is not empty before preparation.")

    if generation.source_generation is not None:
        await _clone_generation(saver, generation.source_generation, generation)
        await _verify_generation_clone(saver, generation.source_generation, generation)

    run_control.ensure_mutation_allowed(now=monotonic())
    activated = await _await_sync_call(
        task_state_store.activate_checkpoint_generation,
        conversation_id,
        generation,
        acquisition.run_id,
        acquisition.fence,
    )
    if not activated:
        run_control.mark_ownership_lost()
        raise RuntimeError("Checkpoint generation activation lost its run ownership.")

    return GenerationCheckpointer(
        saver,
        generation,
        reserved_generation=generation,
        active_generation=generation,
        run_control=run_control,
        monotonic=monotonic,
    )


async def _clone_generation(
    saver: BaseCheckpointSaver,
    source: CheckpointGeneration,
    target: CheckpointGeneration,
) -> None:
    try:
        await _await_account_mutation(
            lambda: saver.acopy_thread(
                source.physical_thread_id,
                target.physical_thread_id,
            )
        )
    except NotImplementedError as exc:
        raise RuntimeError(
            "Checkpoint saver does not support full-thread copy."
        ) from exc


async def _verify_generation_clone(
    saver: BaseCheckpointSaver,
    source: CheckpointGeneration,
    target: CheckpointGeneration,
) -> None:
    source_snapshot = await _generation_snapshot(saver, source.physical_thread_id)
    target_snapshot = await _generation_snapshot(saver, target.physical_thread_id)
    if source_snapshot != target_snapshot:
        raise RuntimeError("Checkpoint generation clone verification failed.")


async def _generation_snapshot(
    saver: BaseCheckpointSaver,
    thread_id: str,
) -> dict[tuple[str, str], tuple]:
    config = {"configurable": {"thread_id": thread_id}}
    snapshot = {}
    for identity, item in (await generation_items(saver, config)).items():
        snapshot[identity] = (
            checkpoint_parent_identity(item),
            deepcopy(item.checkpoint),
            deepcopy(item.metadata),
            deepcopy(item.pending_writes or []),
        )
    return snapshot


async def _await_sync_call(func, /, *args):
    if current_account_user_id.get() is not None:
        return await _await_account_mutation(lambda: asyncio.to_thread(func, *args))
    worker = asyncio.create_task(asyncio.to_thread(func, *args))
    try:
        return await asyncio.shield(worker)
    except asyncio.CancelledError:
        await worker
        raise


async def init_checkpointer(*, app_env: str, redis_url: str | None) -> None:
    """
    Initialize the global checkpointer. Call once from FastAPI lifespan startup.
    """
    global _checkpointer, _redis_saver

    if _checkpointer is not None:
        logger.debug("Checkpointer already initialized; skipping")
        return

    env = (app_env or "development").lower()

    if env in ("production", "staging"):
        if not redis_url:
            raise RuntimeError("Redis-backed LangGraph checkpointing is required in production/staging")
        try:
            cm = FullCopyAsyncRedisSaver.from_conn_string(redis_url=redis_url)
            saver = await cm.__aenter__()
            _redis_saver = cm
            _checkpointer = saver
            logger.info("LangGraph checkpointer: AsyncRedisSaver (Redis-backed)")
            return
        except Exception as e:
            # A process-local fallback loses resumability on restart and splits
            # state across workers. Fail startup instead of silently weakening
            # production durability.
            logger.exception("Redis checkpointer initialization failed: %s", e)
            raise RuntimeError("Redis checkpointer initialization failed") from e

    _checkpointer = FullCopyInMemorySaver()
    logger.info("LangGraph checkpointer: InMemorySaver")


async def shutdown_checkpointer() -> None:
    """Close connections if we own an AsyncRedisSaver."""
    global _checkpointer, _redis_saver

    if _redis_saver is not None:
        try:
            await _redis_saver.__aexit__(None, None, None)
        except Exception as e:
            logger.warning("Error closing AsyncRedisSaver: %s", e)
        _redis_saver = None

    _checkpointer = None


def get_checkpointer() -> BaseCheckpointSaver:
    """
    Return the process-wide checkpointer.
    """
    global _checkpointer

    if _checkpointer is not None:
        return _checkpointer

    env = get_config().APP_ENV.lower()
    if env in ("production", "staging"):
        raise RuntimeError(
            "Checkpointer not initialized: ensure FastAPI lifespan calls init_checkpointer() before handling requests."
        )

    logger.warning(
        "Dev fallback: instantiating InMemorySaver without lifespan init "
        "(OK for local scripts; use lifespan in production)"
    )
    _checkpointer = FullCopyInMemorySaver()
    return _checkpointer
