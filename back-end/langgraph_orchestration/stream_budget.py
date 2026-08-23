"""Token-budget preparation for streamed agent requests.

Budget calculation
------------------
Before each model invocation, :func:`prepare_stream_budget` measures the
token cost of four independent payload sections (system prompt, tool
schemas, VAMP historical context, task checkpoint summary) by calling
the model's token counter concurrently. The system then subtracts
these fixed costs from the model's context window to derive
``hot_history_budget`` — the token budget reserved for the recent
Firestore conversation history that will be reseeded into the prompt.

Relationship to compaction & VAMP truncation
--------------------------------------------
- ``hot_history_budget`` is consumed by :func:`_load_firestore_history`
  in ``stream_conversation`` to decide how many recent turns to load.
- ``vamp_memory_tokens`` (the measured cost of the VAMP blob) is used
  in ``stream_conversation`` to truncate ``historical_context`` BEFORE
  it is injected into the prompt (see FIX [M5]). Without that
  truncation, a 30k-token VAMP blob from a bad similarity search could
  overflow the model's context window even though
  ``hot_history_budget`` was correctly driven to 0.
- ``active_context_budget`` (= ``hot_history_budget`` here) is also
  passed to :func:`check_and_perform_compaction` to decide which
  messages to drop and summarize on each compaction.

Token-counting modes
--------------------
The Bedrock ``CountTokens`` API is the source of truth, but it can
fail or be unsupported for some models. When that happens, the helper
falls back to a local estimate (mode=``"estimated"``) and the budget
is computed conservatively. The selected ``token_counting_mode`` and
``token_counting_reason`` are surfaced in the ``usage_metrics`` SSE
event so the UI can display "exact" vs "estimated" status.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi.concurrency import run_in_threadpool

from api_contract.run_context import ResolvedRunPolicy
from langgraph_orchestration.conversation_access import (
    get_default_conversation_summarizer,
)
from langgraph_orchestration.react_graph import (
    format_ongoing_task_checkpoint,
    format_retrieved_long_term_memory,
)
from llm_provider.token_budget import (
    calculate_dynamic_token_budget,
    count_converse_tokens_cached,
    count_converse_tokens_with_fallback,
    output_reserve_for_task_mode,
)

logger = logging.getLogger(__name__)


async def prepare_stream_budget(
    *,
    run_policy: ResolvedRunPolicy,
    response_style: str,
    system_prompt: str,
    request_tools: list,
    historical_context: str | None,
    task_checkpoint_summary: str,
    conversation: dict | None,
) -> dict:
    """Count independent payload sections concurrently and compute one budget.

    Returns a dict containing:
      - ``hot_history_budget``: tokens available for recent Firestore
        history (already minus system/tool/VAMP/checkpoint overhead).
      - ``active_context_budget``: alias of ``hot_history_budget`` used
        by compaction to decide which messages to drop.
      - ``vamp_memory_tokens``: measured cost of the VAMP blob — used by
        ``stream_conversation`` to truncate ``historical_context`` to
        budget (FIX [M5]).
      - ``task_checkpoint_tokens``, ``system_prompt_tokens``,
        ``tool_schema_tokens``: per-section cost breakdown for the
        ``usage_metrics`` SSE event.
      - ``tail_tokens``: current hot-history tail size, used by the
        summarization pressure detector.
      - ``token_counting_mode`` / ``token_counting_reason``: whether
        exact or estimated token counts were used.
    """
    selected_model = run_policy.model
    count_tasks = [
        _count_tokens(
            selected_model,
            cache_key=("system", response_style, system_prompt),
            system=system_prompt,
            messages=[{"role": "user", "content": [{"text": ""}]}],
        ),
        _count_tokens(
            selected_model,
            cache_key=(
                "tools",
                tuple(getattr(tool, "name", str(tool)) for tool in request_tools),
            ),
            messages=[{"role": "user", "content": [{"text": ""}]}],
            tools=request_tools,
        ),
    ]
    if historical_context:
        count_tasks.append(
            _count_tokens(
                selected_model,
                messages=[
                    {
                        "role": "user",
                        "content": [{"text": format_retrieved_long_term_memory(historical_context)}],
                    }
                ],
            )
        )
    if task_checkpoint_summary:
        count_tasks.append(
            _count_tokens(
                selected_model,
                messages=[
                    {
                        "role": "user",
                        "content": [{"text": format_ongoing_task_checkpoint(task_checkpoint_summary)}],
                    }
                ],
            )
        )

    results = await asyncio.gather(*count_tasks)
    system_count, tool_count = results[:2]
    index = 2
    memory_count: dict | int = {"tokens": 0, "mode": "exact"}
    if historical_context:
        memory_count = results[index]
        index += 1
    checkpoint_count: dict | int = {"tokens": 0, "mode": "exact"}
    if task_checkpoint_summary:
        checkpoint_count = results[index]

    counting_mode, counting_reason = _merge_count_results(system_count, tool_count, memory_count, checkpoint_count)
    # ENH [TOK-MODE]: Don't downgrade "model_native" to "hybrid" — the
    # model-native tokenizer gives exact counts. History is also counted
    # with the same tokenizer, so there's no "local estimate" involved.
    if counting_mode == "exact":
        counting_mode = "hybrid"
        counting_reason = "history_local_estimate"
    elif counting_mode == "model_native":
        # Model-native tokenizer = exact. History uses the same tokenizer.
        # No downgrade needed.
        if counting_reason:
            counting_reason = f"{counting_reason};model_native_history"
    elif counting_reason:
        counting_reason = f"{counting_reason};history_local_estimate"
    if counting_mode not in ("exact", "model_native"):
        logger.warning(
            "Using conservative token estimates: model=%s reason=%s",
            selected_model,
            counting_reason,
        )

    system_tokens = _token_value(system_count)
    tool_tokens = _token_value(tool_count)
    memory_tokens = _token_value(memory_count)
    checkpoint_tokens = _token_value(checkpoint_count)
    budget = calculate_dynamic_token_budget(
        selected_model,
        system_prompt_tokens=system_tokens,
        tool_schema_tokens=tool_tokens,
        output_reserve_tokens=output_reserve_for_task_mode(run_policy.task_mode),
        token_counting_mode=counting_mode,
    )
    # CENH [6]: Reserve space for the <context_map> SystemMessage
    # (~200 tokens). Previously this was a free-rider on the safety margin,
    # which could cause subtle context-window overflows on smaller models.
    # The actual context_map is built in `prepare_model_messages` and is
    # ~150-300 tokens depending on connection/skill state; 200 is a
    # conservative estimate that's also visible in `usage_metrics`.
    context_map_tokens = 200
    hot_history_budget = max(
        0,
        budget["hot_history_budget"] - memory_tokens - checkpoint_tokens - context_map_tokens,
    )
    budget.update(
        {
            "active_context_budget": hot_history_budget,
            "system_prompt_tokens": system_tokens,
            "tool_schema_tokens": tool_tokens,
            "vamp_memory_tokens": memory_tokens,
            "task_checkpoint_tokens": checkpoint_tokens,
            # CENH [6]: surface the reserved context_map budget in the
            # usage_metrics SSE event so the UI can display it.
            "context_map_tokens": context_map_tokens,
            "hot_history_budget": hot_history_budget,
            "token_counting_mode": counting_mode,
            "token_counting_reason": counting_reason,
        }
    )
    try:
        pressure = get_default_conversation_summarizer().get_background_summary_pressure(
            conversation,
            # The streaming service persists the current prompt before this
            # orchestration phase, so it is already part of ``conversation``.
            new_messages=[],
            pressure_budget_tokens=hot_history_budget,
            model_id=selected_model,
        )
        budget["tail_tokens"] = pressure["tail_tokens"]
        budget["active_context_tokens"] = pressure["tail_tokens"]
        # FIX [CTX-INDICATOR]: Log the baseline tail_tokens so we can
        # diagnose when the indicator stays at 0. If this logs 0 for a
        # multi-turn conversation, the summarizer's cheap token estimate
        # is failing (likely because conv_data has no messages or the
        # messages have empty content fields).
        msg_count = len((conversation or {}).get("messages", []) or [])
        logger.info(
            "prepare_stream_budget: tail_tokens=%s, messages=%s, hot_history_budget=%s, pressure_trigger=%s",
            budget["tail_tokens"],
            msg_count,
            hot_history_budget,
            budget.get("pressure_trigger_tokens"),
        )
    except Exception as exc:
        logger.warning("Failed to calculate tail_tokens for usage metrics: %s", exc)
        budget["tail_tokens"] = 0
        budget["active_context_tokens"] = 0
    return budget


async def _count_tokens(
    model_id: str,
    *,
    cache_key: tuple | None = None,
    **kwargs,
) -> dict:
    """Count Converse tokens for one payload section, with optional caching."""
    counter = count_converse_tokens_with_fallback
    if cache_key is not None:

        def counter(current_model, **current_kwargs):
            return count_converse_tokens_cached(
                current_model,
                cache_key=cache_key,
                **current_kwargs,
            )

    if str(model_id).startswith("mock"):
        return counter(model_id, **kwargs)
    return await run_in_threadpool(counter, model_id, **kwargs)


def _merge_count_results(*results: dict | int | None) -> tuple[str, str | None]:
    """Collapse per-section count results into one ``(mode, reason)`` tuple."""
    for result in results:
        if isinstance(result, dict) and result.get("mode") == "estimated":
            return "estimated", result.get("reason") or "provider_unsupported"
    return "exact", None


def _token_value(result: dict | int | None) -> int:
    """Return the integer token count from a count result of any shape."""
    if isinstance(result, dict):
        return int(result.get("tokens") or 0)
    return int(result or 0)
