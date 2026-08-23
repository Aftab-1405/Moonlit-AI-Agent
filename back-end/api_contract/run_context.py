"""Immutable contracts describing one resolved agent run policy."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

TaskMode = Literal["normal", "tool_task", "long_task"]
TaskModeSource = Literal["default", "explicit", "automatic", "resume"]


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
