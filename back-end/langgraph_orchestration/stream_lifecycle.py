"""Ownership-safe lifecycle management for one streamed graph execution."""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone

from api_contract.orchestration_protocols import TaskRunAcquisition
from api_contract.run_context import RunControl
from api_contract.runtime_ports import get_conversation_task_state_store

logger = logging.getLogger(__name__)

DEFAULT_LEASE_SECONDS = 180
DEFAULT_RENEW_INTERVAL_SECONDS = 60


class ConcurrentTaskRunError(RuntimeError):
    """Raised when another request owns the conversation execution lease."""


class TaskRunLease:
    """Acquire, renew, and owner-safely transition a conversation task run."""

    def __init__(
        self,
        conversation_id: str,
        task_mode: str,
        run_id: str,
        run_control: RunControl,
        *,
        lease_seconds: int = DEFAULT_LEASE_SECONDS,
        renew_interval_seconds: int = DEFAULT_RENEW_INTERVAL_SECONDS,
        monotonic: Callable[[], float] = time.monotonic,
        utcnow: Callable[[], datetime] | None = None,
        wait_until: Callable[[float, asyncio.Event], Awaitable[bool]] | None = None,
    ) -> None:
        self.conversation_id = conversation_id
        self.task_mode = task_mode
        self.run_id = run_id
        self.run_control = run_control
        self.lease_seconds = max(1, lease_seconds)
        self.renew_interval_seconds = min(
            max(1, renew_interval_seconds),
            max(1, self.lease_seconds // 2),
        )
        self._monotonic = monotonic
        self._utcnow = utcnow or (lambda: datetime.now(timezone.utc))
        self._wait_until_override = wait_until
        self.previous_status = ""
        self.previous_task_mode = "normal"
        self.fence: int | None = None
        self.confirmed_deadline_monotonic: float | None = None
        self._next_renewal_monotonic: float | None = None
        self.acquired = False
        self._renew_task: asyncio.Task | None = None
        self._stop_renewal = asyncio.Event()
        self._ownership_lost = asyncio.Event()
        self._stream_task: asyncio.Task | None = None
        self._close_lock = asyncio.Lock()
        self._close_task: asyncio.Task | None = None
        self._closed = False

    async def acquire(self) -> TaskRunAcquisition:
        """Acquire the task-run lease and start the background renew loop."""
        store = get_conversation_task_state_store()
        started_monotonic = self._monotonic()
        started_wall = self._utcnow()
        worker = asyncio.create_task(
            asyncio.to_thread(
                store.try_acquire_task_run,
                self.conversation_id,
                self.task_mode,
                self.run_id,
                self.lease_seconds,
            )
        )
        try:
            result = await asyncio.shield(worker)
        except asyncio.CancelledError:
            result = await worker
            if result.acquired:
                await _await_thread_call(
                    store.save_interrupted_task,
                    self.conversation_id,
                    self.task_mode,
                    "cancelled",
                    self.run_id,
                    result.fence,
                )
            raise
        if not result.acquired:
            raise ConcurrentTaskRunError("Another request is already running for this conversation.")
        if result.run_id != self.run_id or result.fence < 1:
            raise RuntimeError("Task lease acquisition returned an invalid owner fence.")
        self.previous_status = result.previous_status
        self.previous_task_mode = result.previous_task_mode
        self.fence = result.fence
        self.confirmed_deadline_monotonic = self._acquisition_deadline(
            result,
            started_monotonic=started_monotonic,
            started_wall=started_wall,
        )
        self._next_renewal_monotonic = started_monotonic + self.renew_interval_seconds
        self.acquired = True
        self._renew_task = asyncio.create_task(self._renew_loop())
        return result

    def register_stream_task(self, task: asyncio.Task | None) -> None:
        """Register the stream owner and cancel it immediately if ownership already closed."""
        self._stream_task = task
        if self._ownership_lost.is_set() and task is not None and not task.done():
            task.cancel()

    async def reset_checkpoint(self) -> bool:
        """Reset the active checkpoint under the current ownership."""
        return await self._owned_transition("reset_task_checkpoint", self.task_mode)

    async def pause(self) -> bool:
        """Mark the active task as paused and stop the renew loop."""
        updated = await self._owned_transition("save_paused_task", self.task_mode)
        if updated:
            self.acquired = False
            self._stop_renewal.set()
        return updated

    async def interrupt(self, reason: str) -> bool:
        """Persist an interrupted task state and stop the renew loop.

        Args:
            reason: Short machine-readable reason for the interruption.
        """
        updated = await self._owned_transition("save_interrupted_task", self.task_mode, reason)
        if updated:
            self.acquired = False
            self._stop_renewal.set()
        return updated

    async def complete(self) -> bool:
        """Clear the active task status, marking the run as completed."""
        updated = await self._owned_transition("clear_task_status", self.task_mode)
        if updated:
            self.acquired = False
            self._stop_renewal.set()
        return updated

    async def close(self) -> None:
        """Stop the renew loop and cancel its background task if running."""
        async with self._close_lock:
            cleanup_task = self._close_task
            if cleanup_task is None:
                if self._closed:
                    return
                self._closed = True
                cleanup_task = asyncio.create_task(self._close_once())
                self._close_task = cleanup_task
        await asyncio.shield(cleanup_task)

    async def _close_once(self) -> None:
        """Perform the single shared cleanup awaited by every close caller."""
        self._stop_renewal.set()
        self._stream_task = None
        renew_task = self._renew_task
        try:
            if renew_task is not None:
                renew_task.cancel()
                await renew_task
        except asyncio.CancelledError:
            pass
        finally:
            self._renew_task = None
            async with self._close_lock:
                if self._close_task is asyncio.current_task():
                    self._close_task = None

    def ensure_owned(self) -> None:
        """Raise ``RuntimeError`` if the lease was lost mid-stream."""
        deadline = self.confirmed_deadline_monotonic
        if deadline is not None and self._monotonic() >= deadline:
            self._lose_ownership()
        self.run_control.ensure_mutation_allowed(now=self._monotonic())

    async def _owned_transition(self, method_name: str, *args) -> bool:
        """Invoke a task-state mutation only while ownership is still held."""
        store = get_conversation_task_state_store()
        method = getattr(store, method_name)
        self.ensure_owned()
        if self.fence is None:
            raise RuntimeError("Task execution lease was not acquired.")
        updated = await _await_thread_call(
            method,
            self.conversation_id,
            *args,
            self.run_id,
            self.fence,
        )
        if not updated:
            self._lose_ownership()
            raise RuntimeError("Task execution lease ownership changed.")
        return True

    async def _renew_loop(self) -> None:
        """Periodically renew the lease until stopped or ownership is lost."""
        store = get_conversation_task_state_store()
        next_renewal = self._next_renewal_monotonic or (
            self._monotonic() + self.renew_interval_seconds
        )
        while not self._stop_renewal.is_set():
            confirmed_deadline = self.confirmed_deadline_monotonic
            if confirmed_deadline is None:
                self._lose_ownership()
                return
            wake_at = min(next_renewal, confirmed_deadline)
            if await self._wait_until(wake_at):
                return
            if self._monotonic() >= confirmed_deadline:
                self._lose_ownership()
                return

            renewal_started = self._monotonic()
            renewal_call = asyncio.create_task(
                _await_thread_call(
                    store.renew_task_run,
                    self.conversation_id,
                    self.run_id,
                    self.fence,
                    self.lease_seconds,
                )
            )
            deadline_wait = asyncio.create_task(self._wait_until(confirmed_deadline))
            try:
                completed, _pending = await asyncio.wait(
                    {renewal_call, deadline_wait},
                    return_when=asyncio.FIRST_COMPLETED,
                )
                if renewal_call not in completed:
                    stopped = deadline_wait.result()
                    if not stopped:
                        self._lose_ownership()
                    renewal_call.cancel()
                    await asyncio.gather(renewal_call, return_exceptions=True)
                    return

                deadline_wait.cancel()
                await asyncio.gather(deadline_wait, return_exceptions=True)
                renewed = renewal_call.result()
                if not renewed:
                    logger.error(
                        "Task lease ownership lost for conversation %s run %s",
                        self.conversation_id,
                        self.run_id,
                    )
                    self._lose_ownership()
                    return
            except Exception:
                deadline_wait.cancel()
                await asyncio.gather(deadline_wait, return_exceptions=True)
                logger.warning(
                    "Failed to renew task lease for conversation %s",
                    self.conversation_id,
                    exc_info=True,
                )
                if self._monotonic() >= confirmed_deadline:
                    self._lose_ownership()
                    return
                next_renewal = min(
                    self._monotonic() + self.renew_interval_seconds,
                    confirmed_deadline,
                )
                continue
            except asyncio.CancelledError:
                renewal_call.cancel()
                deadline_wait.cancel()
                await asyncio.gather(renewal_call, deadline_wait, return_exceptions=True)
                raise

            renewed_deadline = renewal_started + self.lease_seconds
            if self._monotonic() >= confirmed_deadline or self._monotonic() >= renewed_deadline:
                self._lose_ownership()
                return
            self.confirmed_deadline_monotonic = renewed_deadline
            next_renewal = renewal_started + self.renew_interval_seconds

    async def _wait_until(self, deadline: float) -> bool:
        if self._wait_until_override is not None:
            return await self._wait_until_override(deadline, self._stop_renewal)
        timeout = max(0.0, deadline - self._monotonic())
        try:
            await asyncio.wait_for(self._stop_renewal.wait(), timeout=timeout)
            return True
        except asyncio.TimeoutError:
            return False

    def _lose_ownership(self) -> None:
        if self._ownership_lost.is_set():
            return
        self._ownership_lost.set()
        self.run_control.mark_ownership_lost()
        self.acquired = False
        task = self._stream_task
        if task is not None and not task.done():
            task.cancel()

    def _acquisition_deadline(
        self,
        result: TaskRunAcquisition,
        *,
        started_monotonic: float,
        started_wall: datetime,
    ) -> float:
        expires_at = result.lease_expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        remaining = max(0.0, (expires_at - started_wall).total_seconds())
        return started_monotonic + min(float(self.lease_seconds), remaining)


async def _await_thread_call(func, /, *args):
    """Wait for a mutating thread call to finish even if the caller is cancelled."""
    worker = asyncio.create_task(asyncio.to_thread(func, *args))
    try:
        return await asyncio.shield(worker)
    except asyncio.CancelledError:
        await worker
        raise
