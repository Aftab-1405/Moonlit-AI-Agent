"""
LangGraph checkpointing — thread persistence for conversation state.

- Development: ``InMemorySaver`` (in-process; lost on restart unless Firestore seeds).
- Staging/production: ``AsyncRedisSaver`` with Redis URL from the environment.

``AsyncRedisSaver.from_conn_string`` is an async context manager only; for a
process-wide saver we construct ``AsyncRedisSaver(redis_url=...)`` and enter it
once at FastAPI lifespan (see ``main.py``), then close on shutdown.

Reference: https://docs.langchain.com/oss/python/langgraph/persistence
"""

from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING, Optional

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import InMemorySaver

if TYPE_CHECKING:
    from langgraph.checkpoint.redis.aio import AsyncRedisSaver

logger = logging.getLogger(__name__)

_checkpointer: Optional[BaseCheckpointSaver] = None
_redis_saver: Optional["AsyncRedisSaver"] = None


async def init_checkpointer(*, app_env: str, redis_url: str | None) -> None:
    """
    Initialize the global checkpointer. Call once from FastAPI lifespan startup.

    For staging/production, *redis_url* should be the same TLS-normalized URL
    used for sessions (e.g. Upstash ``rediss://``).
    """
    global _checkpointer, _redis_saver

    if _checkpointer is not None:
        logger.debug("Checkpointer already initialized; skipping")
        return

    env = (app_env or "development").lower()

    if env in ("production", "staging") and redis_url:
        try:
            from langgraph.checkpoint.redis.aio import AsyncRedisSaver

            saver = AsyncRedisSaver(redis_url=redis_url)
            await saver.__aenter__()
            _redis_saver = saver
            _checkpointer = saver
            logger.info("LangGraph checkpointer: AsyncRedisSaver (Redis-backed)")
            return
        except Exception as e:
            logger.exception(
                "Redis checkpointer failed; falling back to InMemorySaver: %s", e
            )

    _checkpointer = InMemorySaver()
    logger.info("LangGraph checkpointer: InMemorySaver")


async def shutdown_checkpointer() -> None:
    """Close Redis connections if we own an AsyncRedisSaver."""
    global _checkpointer, _redis_saver

    if _redis_saver is not None:
        try:
            await _redis_saver.__aexit__(None, None, None)
        except Exception as e:
            logger.warning("Error closing AsyncRedisSaver: %s", e)
        _redis_saver = None

    _checkpointer = None


def get_checkpointer() -> BaseCheckpointSaver:
    """
    Return the process-wide checkpointer.

    In development, if lifespan did not call ``init_checkpointer``, this lazily
    constructs ``InMemorySaver`` so ad-hoc scripts still work. Staging/production
    must initialize via lifespan so Redis is used.
    """
    global _checkpointer

    if _checkpointer is not None:
        return _checkpointer

    env = os.getenv("APP_ENV", "development").lower()
    if env in ("production", "staging"):
        raise RuntimeError(
            "Checkpointer not initialized: ensure FastAPI lifespan calls "
            "init_checkpointer() before handling requests."
        )

    logger.warning(
        "Dev fallback: instantiating InMemorySaver without lifespan init "
        "(OK for local scripts; use lifespan in production)"
    )
    _checkpointer = InMemorySaver()
    return _checkpointer
