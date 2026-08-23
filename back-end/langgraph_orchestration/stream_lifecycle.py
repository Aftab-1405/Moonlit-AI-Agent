"""Ownership-safe lifecycle management for one streamed graph execution."""

from __future__ import annotations

import asyncio
import logging
from uuid import uuid4

from api_contract.orchestration_protocols import TaskRunAcquisition
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
        *,
        lease_seconds: int = DEFAULT_LEASE_SECONDS,
        renew_interval_seconds: int = DEFAULT_RENEW_INTERVAL_SECONDS,
    ) -> None:
        self.conversation_id = conversation_id
        self.task_mode = task_mode
        self.run_id = uuid4().hex
        self.lease_seconds = lease_seconds
        self.renew_interval_seconds = min(renew_interval_seconds, max(1, lease_seconds // 2))
        self.previous_status = ""
        self.previous_task_mode = "normal"
        self.acquired = False
        self._renew_task: asyncio.Task | None = None
        self._stop_renewal = asyncio.Event()
        self._ownership_lost = asyncio.Event()
        # FIX [M2]: Track the active stream task so the renew loop can cancel it
        # when ownership is lost. Previously, ensure_owned() was only called on
        # part yield, so a long-running tool call could continue mutating state
        # after another stream stole the lease. Now the renew loop cancels the
        # stream task immediately on ownership loss.
        self._stream_task: asyncio.Task | None = None

    async def acquire(self) -> TaskRunAcquisition:
        """Acquire the task-run lease and start the background renew loop."""
        store = get_conversation_task_state_store()
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
                )
            raise
        except Exception:
            # A timed-out Firestore write can have an ambiguous commit result.
            # The deterministic run ID lets us safely retire it if it committed.
            try:
                await _await_thread_call(
                    store.save_interrupted_task,
                    self.conversation_id,
                    self.task_mode,
                    "error",
                    self.run_id,
                )
            except Exception:
                logger.warning(
                    "Could not clean up an ambiguous task lease acquisition",
                    exc_info=True,
                )
            raise
        if not result.acquired:
            raise ConcurrentTaskRunError("Another request is already running for this conversation.")
        self.previous_status = result.previous_status
        self.previous_task_mode = result.previous_task_mode
        self.acquired = True
        self._renew_task = asyncio.create_task(self._renew_loop())
        return result

    async def reset_checkpoint(self) -> bool:
        """Reset the active checkpoint under the current ownership."""
        return await self._owned_transition("reset_task_checkpoint", self.task_mode, self.run_id)

    async def pause(self) -> bool:
        """Mark the active task as paused and stop the renew loop."""
        updated = await self._owned_transition("save_paused_task", self.task_mode, self.run_id)
        if updated:
            self.acquired = False
            self._stop_renewal.set()
        return updated

    async def interrupt(self, reason: str) -> bool:
        """Persist an interrupted task state and stop the renew loop.

        Args:
            reason: Short machine-readable reason for the interruption.
        """
        updated = await self._owned_transition("save_interrupted_task", self.task_mode, reason, self.run_id)
        if updated:
            self.acquired = False
            self._stop_renewal.set()
        return updated

    async def complete(self) -> bool:
        """Clear the active task status, marking the run as completed."""
        updated = await self._owned_transition("clear_task_status", self.task_mode, self.run_id)
        if updated:
            self.acquired = False
            self._stop_renewal.set()
        return updated

    async def close(self) -> None:
        """Stop the renew loop and cancel its background task if running."""
        self._stop_renewal.set()
        if self._renew_task is not None:
            self._renew_task.cancel()
            try:
                await self._renew_task
            except asyncio.CancelledError:
                pass
            self._renew_task = None

    def ensure_owned(self) -> None:
        """Raise ``RuntimeError`` if the lease was lost mid-stream."""
        if self._ownership_lost.is_set():
            raise RuntimeError("Task execution lease was lost; stream aborted safely.")

    async def _owned_transition(self, method_name: str, *args) -> bool:
        """Invoke a task-state mutation only while ownership is still held."""
        store = get_conversation_task_state_store()
        method = getattr(store, method_name)
        updated = await _await_thread_call(method, self.conversation_id, *args)
        if not updated:
            self._ownership_lost.set()
            self.acquired = False
            raise RuntimeError("Task execution lease ownership changed.")
        return True

    async def _renew_loop(self) -> None:
        """Periodically renew the lease until stopped or ownership is lost."""
        store = get_conversation_task_state_store()
        while not self._stop_renewal.is_set():
            try:
                await asyncio.wait_for(
                    self._stop_renewal.wait(),
                    timeout=self.renew_interval_seconds,
                )
                return
            except asyncio.TimeoutError:
                pass

            try:
                renewed = await _await_thread_call(
                    store.renew_task_run,
                    self.conversation_id,
                    self.run_id,
                    self.lease_seconds,
                )
                if not renewed:
                    self._ownership_lost.set()
                    self.acquired = False
                    logger.error(
                        "Task lease ownership lost for conversation %s run %s",
                        self.conversation_id,
                        self.run_id,
                    )
                    # FIX [M2]: Cancel the active stream task so it stops mutating
                    # checkpoint and Firestore state immediately. Without this, the
                    # in-flight astream continues until the next part yield, by which
                    # point a concurrent stream may have already overwritten state.
                    if self._stream_task is not None and not self._stream_task.done():
                        self._stream_task.cancel()
                    return
            except Exception:
                # A transient renewal failure is safe while the current lease is
                # still live; retry on the next interval and retain expiry recovery.
                logger.warning(
                    "Failed to renew task lease for conversation %s",
                    self.conversation_id,
                    exc_info=True,
                )


async def _await_thread_call(func, /, *args):
    """Wait for a mutating thread call to finish even if the caller is cancelled."""
    worker = asyncio.create_task(asyncio.to_thread(func, *args))
    try:
        return await asyncio.shield(worker)
    except asyncio.CancelledError:
        await worker
        raise
