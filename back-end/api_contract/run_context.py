"""Immutable contracts describing one resolved agent run policy."""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Literal

TaskMode = Literal["normal", "tool_task", "long_task"]
TaskModeSource = Literal["default", "explicit", "automatic", "resume"]


@dataclass(frozen=True)
class CheckpointGeneration:
    """Immutable physical checkpoint namespace reserved for one fenced run."""

    logical_thread_id: str
    physical_thread_id: str
    run_id: str
    fence: int
    source_generation: CheckpointGeneration | None = None


def create_checkpoint_generation(
    logical_thread_id: str,
    run_id: str,
    fence: int,
    *,
    source_generation: CheckpointGeneration | None = None,
) -> CheckpointGeneration:
    """Build the canonical physical namespace for one fenced graph attempt."""
    normalized_logical_id = str(logical_thread_id).strip()
    normalized_run_id = str(run_id).strip()
    if not normalized_logical_id:
        raise ValueError("logical_thread_id is required")
    if not normalized_run_id:
        raise ValueError("run_id is required")
    if fence < 1:
        raise ValueError("fence must be positive")
    if (
        source_generation is not None
        and source_generation.logical_thread_id != normalized_logical_id
    ):
        raise ValueError("source generation must belong to the same logical thread")
    return CheckpointGeneration(
        logical_thread_id=normalized_logical_id,
        physical_thread_id=(
            f"{normalized_logical_id}:checkpoint-generation:{fence}:{normalized_run_id}"
        ),
        run_id=normalized_run_id,
        fence=fence,
        source_generation=source_generation,
    )


@dataclass(frozen=True)
class RunBudgets:
    """Hard graph, segment, tool, and wall-clock ceilings for one run."""

    graph_steps: int
    segment_steps: int
    tool_calls: int
    wall_clock_seconds: int


@dataclass(frozen=True)
class ResolvedRunPolicy:
    """The sole effective mode and budgets consumed by one agent run."""

    task_mode: TaskMode
    task_mode_source: TaskModeSource
    budgets: RunBudgets
    provider: str
    model: str
    db_connected: bool


@dataclass(eq=False)
class RunControl:
    """Identity-stable mutable cancellation, deadline, and tool-budget state."""

    deadline_monotonic: float
    tool_limit: int
    _lock: threading.Lock = field(default_factory=threading.Lock, init=False, repr=False)
    _cancel_reason: str | None = field(default=None, init=False, repr=False)
    _ownership_lost: bool = field(default=False, init=False, repr=False)
    _reserved_action_ids: set[str] = field(default_factory=set, init=False, repr=False)

    def __post_init__(self) -> None:
        if self.deadline_monotonic < 0:
            raise ValueError("deadline_monotonic must be non-negative")
        if self.tool_limit < 0:
            raise ValueError("tool_limit must be non-negative")

    @property
    def ownership_lost(self) -> bool:
        with self._lock:
            return self._ownership_lost

    @property
    def cancel_reason(self) -> str | None:
        with self._lock:
            return self._cancel_reason

    def cancel(self, reason: str) -> None:
        """Cancel the run once, preserving the first machine-readable reason."""
        safe_reason = str(reason).strip() or "cancelled"
        with self._lock:
            if self._cancel_reason is None:
                self._cancel_reason = safe_reason

    def mark_ownership_lost(self) -> None:
        """Close the mutation fence because the durable owner changed or expired."""
        with self._lock:
            self._ownership_lost = True

    def remaining_seconds(self, now: float | None = None) -> float:
        """Return non-negative wall-budget time remaining on the monotonic clock."""
        checked_at = time.monotonic() if now is None else now
        return max(0.0, self.deadline_monotonic - checked_at)

    def ensure_mutation_allowed(self, now: float | None = None) -> None:
        """Raise before a mutation when cancellation, expiry, or fencing closed the run."""
        checked_at = time.monotonic() if now is None else now
        with self._lock:
            self._ensure_mutation_allowed_locked(checked_at)

    def reserve_tool_call(self, action_id: str) -> bool:
        """Atomically reserve one unique action ID under the total tool-call budget."""
        normalized_action_id = str(action_id).strip()
        if not normalized_action_id:
            raise ValueError("action_id is required")
        checked_at = time.monotonic()
        with self._lock:
            self._ensure_mutation_allowed_locked(checked_at)
            if normalized_action_id in self._reserved_action_ids:
                return False
            if len(self._reserved_action_ids) >= self.tool_limit:
                raise RuntimeError("Run tool call budget is exhausted.")
            self._reserved_action_ids.add(normalized_action_id)
            return True

    def _ensure_mutation_allowed_locked(self, now: float) -> None:
        if self._ownership_lost:
            raise RuntimeError("Task execution lease ownership was lost.")
        if self._cancel_reason is not None:
            raise RuntimeError(f"Task execution was cancelled: {self._cancel_reason}.")
        if now >= self.deadline_monotonic:
            raise RuntimeError("Task execution wall-clock deadline was reached.")
