"""Canonical context-pressure state and public usage events.

The active conversation tail and the complete model request are different
budgets. Summarization is driven by the former; model-capacity reporting is
driven by the latter. Keeping both values here prevents the stream and browser
from accidentally treating fixed prompt/tool/memory tokens as summarizable
conversation history.
"""

from __future__ import annotations

from typing import Any


def _percent(
    numerator: int | float | str | None,
    denominator: int | float | str | None,
) -> int | None:
    """Return a clamped whole-number percentage for non-negative token counts."""
    if numerator is None:
        return None
    numerator = max(0, int(numerator or 0))
    denominator = int(denominator or 0)
    if denominator <= 0:
        return 0
    return min(100, max(0, round((numerator / denominator) * 100)))


def build_usage_metrics(budget_info: dict, **overrides: Any) -> dict:
    """Build the usage event consumed and persisted by the chat frontend.

    ``activePercent`` is the unsummarized conversation tail relative to the
    hot-history budget. ``modelPercent`` is the provider's complete input
    payload relative to the model context window. These values must not share
    a numerator because fixed system/tool/memory sections survive compaction.
    """
    active_tokens = budget_info.get("active_context_tokens")
    if active_tokens is None:
        active_tokens = budget_info.get("tail_tokens")
    active_tokens = int(active_tokens or 0)

    input_payload = budget_info.get("input_payload_tokens")
    if input_payload is not None:
        input_payload = int(input_payload)

    event = {
        "type": "usage_metrics",
        "activeContextTokens": active_tokens,
        "inputPayloadTokens": input_payload,
        "pressureTriggerTokens": budget_info.get("pressure_trigger_tokens"),
        "modelContextWindow": budget_info.get("model_context_window"),
        "activeContextBudget": budget_info.get("active_context_budget"),
        "hotHistoryBudget": budget_info.get("hot_history_budget"),
        "contextPhase": budget_info.get("context_phase"),
        "systemPromptTokens": budget_info.get("system_prompt_tokens"),
        "toolSchemaTokens": budget_info.get("tool_schema_tokens"),
        "vampMemoryTokens": budget_info.get("vamp_memory_tokens"),
        "taskCheckpointTokens": budget_info.get("task_checkpoint_tokens"),
        "contextMapTokens": budget_info.get("context_map_tokens"),
        "tokenCountingMode": budget_info.get("token_counting_mode"),
        "tokenCountingReason": budget_info.get("token_counting_reason"),
    }
    event.update(overrides)

    active_budget = (
        event.get("activeContextBudget") or event.get("hotHistoryBudget") or event.get("pressureTriggerTokens")
    )
    event["activePercent"] = _percent(event.get("activeContextTokens"), active_budget)
    event["modelPercent"] = _percent(
        event.get("inputPayloadTokens"),
        event.get("modelContextWindow"),
    )
    return event


def get_pre_call_summary_pressure(
    summarizer,
    *,
    conversation: dict | None,
    budget_info: dict,
    model_id: str,
) -> dict:
    """Return scheduling pressure from the persisted unsummarized tail.

    The conversation streaming service stores the current user prompt before
    orchestration starts, so it is already present in ``conversation``. Passing
    it again through ``new_messages`` would double-count that prompt and make
    the indicator cross the summarization threshold before the backend does.
    """
    return summarizer.get_background_summary_pressure(
        conversation,
        new_messages=[],
        pressure_budget_tokens=budget_info["hot_history_budget"],
        model_id=model_id,
    )


def build_summary_completed_events(
    budget_info: dict,
    *,
    summary_result: dict | None,
    summary_pressure: dict,
) -> list[dict]:
    """Commit the post-summary usage state and emit events only for a real write."""
    if not summary_result or not summary_result.get("created"):
        return []

    pressure_tail = summary_pressure.get("tail_tokens")
    remaining_tail = int(pressure_tail if pressure_tail is not None else summary_result.get("tail_tokens") or 0)
    budget_info.update(
        {
            "tail_tokens": remaining_tail,
            "active_context_tokens": remaining_tail,
            # Compaction invalidates the previous provider payload count. The
            # next model response supplies the new measured value; until then,
            # model capacity is unknown rather than an invented zero.
            "input_payload_tokens": None,
            "context_phase": "post_summary",
        }
    )

    return [
        {
            "type": "workflow_status",
            "stage": "summarizing_context",
            "status": "done",
            "content": "Conversation context summarized.",
        },
        build_usage_metrics(
            budget_info,
            summaryThresholdTokens=summary_pressure.get("threshold_tokens"),
            summaryCompleteTurns=summary_pressure.get("complete_turn_count"),
        ),
    ]
