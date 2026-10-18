"""Privacy-safe per-user usage aggregation."""

from __future__ import annotations

import hashlib
from copy import deepcopy
from datetime import datetime, timedelta, timezone

COUNTER_FIELDS = (
    "ai_requests",
    "input_tokens",
    "output_tokens",
    "total_tokens",
    "sql_executions",
    "sql_successes",
    "sql_failures",
    "rows_returned",
)

TOKEN_FIELDS = ("input_tokens", "output_tokens", "total_tokens")


def _count(value) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def _model_key(provider: str, model: str) -> str:
    return hashlib.sha256(f"{provider}:{model}".encode()).hexdigest()[:24]


def accumulate_token_usage(existing, event):
    """Add one provider-call usage event without retaining request content."""
    totals = {field: _count((existing or {}).get(field)) for field in TOKEN_FIELDS}
    input_tokens = event.get("input_tokens")
    if input_tokens is None:
        input_tokens = event.get("inputTokens")
    output_tokens = event.get("output_tokens")
    if output_tokens is None:
        output_tokens = event.get("outputTokens")
    total_tokens = event.get("total_tokens")
    if total_tokens is None:
        total_tokens = event.get("totalTokens")

    # Context-pressure events share the usage_metrics channel but do not
    # represent a provider call and therefore must not alter billed usage.
    if input_tokens is None and output_tokens is None and total_tokens is None:
        return totals

    counted_input = _count(input_tokens)
    counted_output = _count(output_tokens)
    counted_total = (
        _count(total_tokens)
        if total_tokens is not None
        else counted_input + counted_output
    )
    totals["input_tokens"] += counted_input
    totals["output_tokens"] += counted_output
    totals["total_tokens"] += counted_total
    return totals


def merge_usage_event(existing, event):
    aggregate = deepcopy(existing or {})
    for field in COUNTER_FIELDS:
        aggregate[field] = _count(aggregate.get(field))
    aggregate["models"] = deepcopy(aggregate.get("models") or {})
    aggregate["task_modes"] = deepcopy(aggregate.get("task_modes") or {})

    if event.get("kind") == "ai":
        aggregate["ai_requests"] += 1
        for field in ("input_tokens", "output_tokens", "total_tokens"):
            aggregate[field] += _count(event.get(field))

        provider = str(event.get("provider") or "unknown")[:80]
        model = str(event.get("model") or "unknown")[:160]
        key = _model_key(provider, model)
        model_usage = aggregate["models"].get(key) or {
            "provider": provider,
            "model": model,
            "requests": 0,
            "total_tokens": 0,
        }
        model_usage["requests"] = _count(model_usage.get("requests")) + 1
        model_usage["total_tokens"] = _count(model_usage.get("total_tokens")) + _count(
            event.get("total_tokens")
        )
        aggregate["models"][key] = model_usage

        task_mode = str(event.get("task_mode") or "normal")[:40]
        aggregate["task_modes"][task_mode] = _count(aggregate["task_modes"].get(task_mode)) + 1

    elif event.get("kind") == "sql":
        aggregate["sql_executions"] += 1
        if event.get("status") == "success":
            aggregate["sql_successes"] += 1
            aggregate["rows_returned"] += _count(event.get("rows_returned"))
        else:
            aggregate["sql_failures"] += 1

    return aggregate


class UsageAnalyticsService:
    ALLOWED_DAYS = frozenset({7, 30, 90})

    @staticmethod
    def record_ai_request(
        user_id,
        *,
        event_id,
        provider,
        model,
        task_mode,
        input_tokens=0,
        output_tokens=0,
        total_tokens=0,
        occurred_at=None,
        repository=None,
    ):
        if repository is None:
            from service.dashboard.usage_repository import UsageRepository

            repository = UsageRepository
        return repository.record_event(
            user_id,
            event_id,
            {
                "kind": "ai",
                "provider": provider,
                "model": model,
                "task_mode": task_mode,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "total_tokens": total_tokens,
            },
            occurred_at=occurred_at,
        )

    @staticmethod
    def record_sql_execution(
        user_id,
        *,
        event_id,
        status,
        rows_returned=0,
        occurred_at=None,
        repository=None,
    ):
        if repository is None:
            from service.dashboard.usage_repository import UsageRepository

            repository = UsageRepository
        return repository.record_event(
            user_id,
            event_id,
            {"kind": "sql", "status": status, "rows_returned": rows_returned},
            occurred_at=occurred_at,
        )

    @staticmethod
    def get_usage(user_id, *, days, now=None, repository=None):
        if days not in UsageAnalyticsService.ALLOWED_DAYS:
            raise ValueError("Usage range must be 7, 30, or 90 days")
        if repository is None:
            from service.dashboard.usage_repository import UsageRepository

            repository = UsageRepository

        now = now or datetime.now(timezone.utc)
        end_date = now.astimezone(timezone.utc).date()
        start_date = end_date - timedelta(days=days - 1)
        documents = repository.list_daily(user_id, start_date, end_date)
        by_date = {str(document.get("date")): document for document in documents}
        totals = {field: 0 for field in COUNTER_FIELDS}
        models: dict[tuple[str, str], dict] = {}
        task_modes: dict[str, int] = {}
        daily = []

        for offset in range(days):
            current_date = start_date + timedelta(days=offset)
            document = by_date.get(current_date.isoformat(), {})
            item = {"date": current_date.isoformat()}
            for field in COUNTER_FIELDS:
                item[field] = _count(document.get(field))
                totals[field] += item[field]
            daily.append(item)

            for model_usage in (document.get("models") or {}).values():
                provider = str(model_usage.get("provider") or "unknown")
                model = str(model_usage.get("model") or "unknown")
                key = (provider, model)
                combined = models.setdefault(
                    key,
                    {"provider": provider, "model": model, "requests": 0, "total_tokens": 0},
                )
                combined["requests"] += _count(model_usage.get("requests"))
                combined["total_tokens"] += _count(model_usage.get("total_tokens"))
            for task_mode, requests in (document.get("task_modes") or {}).items():
                task_modes[str(task_mode)] = task_modes.get(str(task_mode), 0) + _count(requests)

        metadata = repository.get_metadata(user_id) or {}
        return {
            "days": days,
            "timezone": "UTC",
            "range_start": start_date.isoformat(),
            "range_end": end_date.isoformat(),
            "tracking_started_at": metadata.get("tracking_started_at"),
            "totals": totals,
            "daily": daily,
            "models": sorted(models.values(), key=lambda item: (-item["requests"], item["model"])),
            "task_modes": [
                {"task_mode": task_mode, "requests": requests}
                for task_mode, requests in sorted(task_modes.items(), key=lambda item: (-item[1], item[0]))
            ],
        }
