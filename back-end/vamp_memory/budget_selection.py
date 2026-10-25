"""Token-budget selection for VAMP retrieval result units.

The retrieval pipeline produces a flat list of *units* (memory bullets
collected from one or more summary blocks). This module deduplicates them by
``unit_id``, sorts by retrieval score, and selects as many as fit within the
configured token budget (``VAMP_CONTEXT_MAX_TOKENS``) before re-sorting the
selection by ``(idx, bullet_index)`` for stable chronological display.
"""

import math
from typing import Iterable

from llm_provider.token_budget import estimate_model_tokens


# CENH [5]: Scale adaptive_k with conversation length. The old cap of 10 was
# too tight for 100+ block conversations — the most relevant bullets could be
# outside the top-10 by Qdrant similarity. Now: min(25, max(10, total // 3)).
# The budget selector (dedupe_select_budget_then_sort) then filters these
# down to what fits in vamp_token_budget, so a larger k doesn't cost tokens —
# it just gives the selector more candidates to choose from.
def adaptive_k(total_summaries: int) -> int:
    """VAMP retrieval pool size.

    Scales with the total number of summary blocks so very long
    conversations pull in more vector-search candidates — the budget
    selector (:func:`dedupe_select_budget_then_sort`) then filters them
    down to what fits in the VAMP token budget, so a larger ``k`` does
    not cost prompt tokens, it just gives the selector a wider pool.
    Bounded to ``[10, 25]`` so very short conversations still pull enough
    context and very long ones don't make the Qdrant search + Firestore
    hydration prohibitively expensive.
    """
    if total_summaries <= 0:
        return 0
    return min(25, max(10, math.floor(total_summaries / 3)))


def dedupe_select_budget_then_sort(
    blocks: Iterable[dict],
    *,
    budget_tokens: int,
    model_id: str | None = None,
) -> list[dict]:
    """Dedupe units, pick the highest-scoring subset that fits the token budget.

    Pipeline:
    1. Dedupe by ``unit_id`` (or ``summary_id`` fallback), keeping the
       highest-scoring copy when the same unit appears multiple times (e.g.
       once as a pinned latest-block bullet and once as a vector hit).
    2. Sort candidates by retrieval score (desc), rank, then text length
       (asc) so smaller, higher-rank units are preferred when scores tie.
    3. Greedily add candidates while ``used + size <= budget``.
    4. FIX [L12]: Guarantee at least the single highest-priority block even
       when every candidate exceeds the budget — previously a single
       oversized bullet (e.g. a 2500-token ``overview`` against
       ``VAMP_CONTEXT_MIN_TOKENS=2048``) wiped out ALL historical context
       for the turn.
    5. Re-sort the selection by ``(idx, bullet_index)`` for stable
       chronological display in the system prompt.

    Returns the selected units as a list of dicts (the same dict objects the
    caller passed in, possibly mutated by reference — but never modified here).
    """
    budget = int(budget_tokens)

    by_id: dict[str, dict] = {}
    for block in blocks:
        unit_id = block.get("unit_id") or block.get("summary_id")
        if not unit_id:
            continue

        existing = by_id.get(unit_id)
        if existing is None:
            by_id[unit_id] = block
            continue

        old_score = float(existing.get("_retrieval_score", 0.0) or 0.0)
        new_score = float(block.get("_retrieval_score", 0.0) or 0.0)
        if new_score > old_score:
            by_id[unit_id] = block

    candidates = list(by_id.values())

    candidates.sort(
        key=lambda b: (
            -float(b.get("_retrieval_score", 0.0) or 0.0),
            int(b.get("_retrieval_rank", 999999) or 999999),
            len(str(b.get("text", ""))),
        )
    )

    selected = []
    used = 0

    for block in candidates:
        text = str(block.get("text", ""))
        size = estimate_model_tokens(text, model_id)
        if size <= 0:
            continue

        if used + size <= budget:
            selected.append(block)
            used += size

    # FIX [L12]: Guarantee at least the single highest-priority block.
    # Previously, when every candidate exceeded the budget (e.g. a 2500-token
    # overview bullet vs VAMP_CONTEXT_MIN_TOKENS=2048), the loop above added
    # nothing and historical context was silently empty for the turn. Now we
    # always include the top-priority candidate (``candidates[0]``) even if
    # it alone exceeds the budget — the LLM can decide how to use it.
    if not selected and candidates:
        selected.append(candidates[0])

    selected.sort(key=lambda b: (int(b.get("idx", 0) or 0), int(b.get("bullet_index", 0) or 0)))
    return selected
