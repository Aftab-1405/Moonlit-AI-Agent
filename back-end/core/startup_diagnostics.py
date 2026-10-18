"""Sanitized, time-bounded startup dependency diagnostics."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from time import perf_counter
from typing import Awaitable, Callable, Literal, TypeVar

_T = TypeVar("_T")


@dataclass(frozen=True)
class StartupProbeResult:
    """Operator-safe result from one startup dependency probe."""

    name: str
    status: Literal["ok", "warning", "not_checked"]
    detail: str
    duration_ms: float


def log_development_runtime_modes(
    logger: logging.Logger,
    *,
    host: str,
    http_rate_limit_enabled: bool,
    llm_rate_limit_enabled: bool,
    user_quota_enabled: bool,
) -> None:
    """Make development-only persistence, safeguard, and bind choices explicit."""

    def state(enabled: bool) -> str:
        return "enabled" if enabled else "disabled"

    logger.info(
        "Development safeguards: HTTP rate limit=%s, LLM rate limiter=%s, user quota=%s",
        state(http_rate_limit_enabled),
        state(llm_rate_limit_enabled),
        state(user_quota_enabled),
    )
    logger.warning("Development persistence: LangGraph InMemorySaver is ephemeral; state is lost on restart")
    if host in {"0.0.0.0", "::"}:
        logger.warning(
            "Development network exposure: host=%s accepts connections on all interfaces; CORS is not access control",
            host,
        )


def log_startup_probe(logger: logging.Logger, result: StartupProbeResult) -> None:
    """Log actual probe failures at WARNING and other states at INFO."""
    log = logger.warning if result.status == "warning" else logger.info
    log(
        "Startup check %s: %s (%s, %.1f ms)",
        result.name,
        result.status.upper(),
        result.detail,
        result.duration_ms,
    )


def log_startup_summary(
    logger: logging.Logger,
    results: list[StartupProbeResult],
    *,
    total_duration_ms: float,
) -> None:
    """Log a concise summary without overstating unvalidated dependencies."""
    statuses = ", ".join(f"{result.name}={result.status}" for result in results)
    logger.info(
        "Startup diagnostics completed in %.1f ms (%s)",
        total_duration_ms,
        statuses,
    )


async def run_startup_probe(
    name: str,
    operation: Callable[[], Awaitable[_T]],
    *,
    timeout_seconds: float,
    success_detail: str,
) -> StartupProbeResult:
    """Run an async dependency probe and return a timed, sanitized result."""
    started_at = perf_counter()
    try:
        await asyncio.wait_for(operation(), timeout=timeout_seconds)
    except Exception as exc:
        return StartupProbeResult(
            name=name,
            status="warning",
            detail=f"probe failed ({type(exc).__name__})",
            duration_ms=(perf_counter() - started_at) * 1000,
        )
    return StartupProbeResult(
        name=name,
        status="ok",
        detail=success_detail,
        duration_ms=(perf_counter() - started_at) * 1000,
    )
