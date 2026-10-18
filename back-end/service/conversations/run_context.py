"""Pure resolution of the immutable policy for one conversation run."""

from __future__ import annotations

import re

from api_contract.run_context import ResolvedRunPolicy, RunBudgets, TaskMode, TaskModeSource
from config import get_config

Config = get_config()

_LONG_TASK_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"\b(?:produce|generate|write|create|draft|prepare|build)\s+(?:a\s+|an\s+|the\s+)?(?:comprehensive|detailed|full|complete|in[-\s]?depth|executive|technical)?\s*(?:report|document|whitepaper|spec|specification|design\s+doc|proposal|plan|roadmap|runbook|playbook|guide|tutorial|manual)\b",
        r"\b(?:analyze|analyse)\b.{0,80}\b(?:and|then|&)\b.{0,80}\b(?:produce|generate|write|create|draft|prepare|build|deliver|present|summar(?:y|ize)|report)\b",
        r"\b(?:analyze|analyse)\b.{0,80}\b(?:produce|generate|write|create|draft|prepare|build|deliver|present|summar(?:y|ize)|report)\b",
        r"\b(?:end[-\s]?to[-\s]?end|step[-\s]by[-\s]step|from\s+scratch|full\s+pipeline|complete\s+workflow)\b",
        r"\b(?:build|scaffold|implement|develop|create)\s+(?:a\s+|an\s+|the\s+)?(?:dashboard|application|app|service|api|pipeline|workflow|etl|data\s+model|schema\s+design|migration\s+script)\b",
        r"\b(?:migrate|refactor|rewrite|port)\s+.{0,80}\b(?:from|to|into|across)\b",
        r"\b(?:audit|review|assess|evaluate)\b.{0,80}\b(?:and|then)\b.{0,80}\b(?:report|document|summar(?:y|ize)|recommend|propose|fix)\b",
        r"\bcomprehensive\s+(?:analysis|review|assessment|study|investigation|breakdown|overview|guide)\b",
        r"\b(?:synthe?size|consolidate|aggregate|cross[-\s]?reference)\b.{0,80}\b(?:from|across|multiple|all|various)\b",
        r"\b(?:write|create|generate)\s+(?:a\s+|an\s+)?(?:long[-\s]?form|multi[-\s]?part|multi[-\s]?section|in[-\s]?depth|detailed)\b",
        r"\b(?:long\s+task|deep\s+dive|deep\s+analysis|thorough\s+analysis|full\s+analysis)\b",
        r"\b(?:and|then|finally)\s+(?:produce|deliver|generate|create|write|build|present)\s+(?:a\s+|an\s+|the\s+)?\w+\s+(?:report|document|summary|plan|spec|proposal|dashboard|artifact|deliverable)\b",
    )
)

_TOOL_TASK_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"\b(?:explore|inspect|investigate|look\s+into|check|examine)\b.{0,80}\b(?:schema|tables|columns|database|data\s+model)\b",
        r"\b(?:join|compare|contrast|correlate|cross[-\s]?reference)\s+.{0,40}\b(?:tables?|datasets?|sources?)\b",
        r"\b(?:find\s+all|list\s+every|list\s+all|show\s+all|enumerate\s+all)\b",
        r"\b(?:optimize|tune|diagnose|troubleshoot|debug|profile|benchmark)\b",
        r"\b(?:generate|write|create|build)\s+(?:a\s+|an\s+|the\s+)?(?:query|sql|sql\s+query|complex\s+query|optimized\s+query)\b",
        r"\b(?:data\s+quality|integrity\s+check|consistency\s+check|valid(?:ate|ation)\s+(?:data|schema|constraints))\b",
        r"\b(?:explain|describe|walk\s+me\s+through)\b.{0,80}\b(?:and|then|also)\b",
        r"\?.{0,200}\?.{0,200}\?",
    )
)

_MIN_PROMPT_LEN_FOR_ESCALATION = 24


def _automatic_mode(prompt: str | None) -> TaskMode:
    if (
        not Config.AGENT_AUTO_TASK_MODE
        or not prompt
        or len(prompt.strip()) < _MIN_PROMPT_LEN_FOR_ESCALATION
    ):
        return "normal"
    normalized = prompt.strip()
    if any(pattern.search(normalized) for pattern in _LONG_TASK_PATTERNS):
        return "long_task"
    if any(pattern.search(normalized) for pattern in _TOOL_TASK_PATTERNS):
        return "tool_task"
    return "normal"


def _budgets_for(mode: TaskMode) -> RunBudgets:
    graph_steps = {
        "normal": Config.AGENT_DEFAULT_STEPS,
        "tool_task": Config.AGENT_TOOL_TASK_STEPS,
        "long_task": Config.AGENT_LONG_TASK_STEPS,
    }[mode]
    wall_clock_seconds = {
        "normal": Config.AGENT_NORMAL_WALL_CLOCK_SECONDS,
        "tool_task": Config.AGENT_TOOL_TASK_WALL_CLOCK_SECONDS,
        "long_task": Config.AGENT_LONG_TASK_WALL_CLOCK_SECONDS,
    }[mode]
    return RunBudgets(
        graph_steps=graph_steps,
        segment_steps=min(graph_steps, Config.AGENT_STEP_SEGMENT_STEPS),
        tool_calls=Config.AGENT_TOOL_CALLS_PER_RUN,
        wall_clock_seconds=wall_clock_seconds,
    )


def resolve_run_policy(
    prompt: str | None,
    requested_mode: TaskMode,
    persisted_resume_mode: TaskMode | None,
    provider: str,
    model: str,
    db_connected: bool,
) -> ResolvedRunPolicy:
    """Resolve one effective mode and configured budget tuple without mutation."""
    if requested_mode not in ("normal", "tool_task", "long_task"):
        raise ValueError("Unsupported requested task mode")
    if persisted_resume_mode not in (None, "normal", "tool_task", "long_task"):
        raise ValueError("Unsupported persisted resume task mode")

    mode: TaskMode
    source: TaskModeSource
    if requested_mode != "normal":
        mode = requested_mode
        source = "explicit"
    elif persisted_resume_mode is not None:
        mode = persisted_resume_mode
        source = "resume"
    else:
        mode = _automatic_mode(prompt)
        source = "automatic" if mode != "normal" else "default"

    return ResolvedRunPolicy(
        task_mode=mode,
        task_mode_source=source,
        budgets=_budgets_for(mode),
        provider=provider,
        model=model,
        db_connected=bool(db_connected),
    )
