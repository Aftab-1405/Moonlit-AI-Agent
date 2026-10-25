"""Context-loading phase for conversation streaming."""

from __future__ import annotations

import asyncio
import inspect
import logging
from dataclasses import dataclass

from config import get_config
from langgraph_orchestration.conversation_access import (
    get_default_conversation_state_reader,
)

logger = logging.getLogger(__name__)


def vamp_token_budget(model_id: str) -> int:
    """Return the VAMP context-window token budget for the given model."""
    from llm_provider.token_budget import get_model_context_window

    config = get_config()
    proportional = int(get_model_context_window(model_id) * config.VAMP_CONTEXT_WINDOW_RATIO)
    return min(
        config.VAMP_CONTEXT_MAX_TOKENS,
        max(config.VAMP_CONTEXT_MIN_TOKENS, proportional),
    )


async def retrieve_historical_context(
    provider, conversation_id: str, user_id: str, message: str, model_id: str
) -> str | None:
    """Call the current port while tolerating legacy three-argument adapters."""
    method = provider.retrieve_context
    parameters = inspect.signature(method).parameters
    kwargs: dict[str, str | int] = {}
    if "model_id" in parameters:
        kwargs["model_id"] = model_id
    if "token_budget" in parameters:
        kwargs["token_budget"] = vamp_token_budget(model_id)
    return await method(conversation_id, user_id, message, **kwargs)


@dataclass(frozen=True)
class InitialStreamContext:
    conversation: dict | None
    historical_context: str | None


async def load_initial_stream_context(
    conversation_id: str,
    user_id: str,
    message: str | None,
    selected_model: str,
) -> InitialStreamContext:
    """Load independent durable state and semantic memory concurrently."""

    async def load_conversation() -> dict | None:
        """Fetch the durable conversation record for the active conversation."""
        try:
            reader = get_default_conversation_state_reader()
            return await asyncio.to_thread(
                reader.get_conversation,
                conversation_id,
            )
        except Exception as exc:
            logger.warning("Failed to fetch conversation data: %s", exc)
            return None

    async def load_historical_context() -> str | None:
        """Retrieve VAMP historical context with a graceful 8s timeout."""
        if not message or str(selected_model).startswith("mock"):
            return None
        try:
            if not get_config().VAMP_MEMORY_ENABLED:
                return None
            from langgraph_orchestration.historical_context import (
                get_default_historical_context_provider,
            )

            # CENH [3]: Increased from 3s to 8s. The 3s cap silently dropped
            # VAMP context on cold Bedrock embeddings (Titan embed + Qdrant
            # search + Firestore hydrate can exceed 3s). 8s gives enough
            # headroom while still failing fast enough to not block the
            # stream excessively.
            return await asyncio.wait_for(
                retrieve_historical_context(
                    get_default_historical_context_provider(),
                    conversation_id,
                    user_id,
                    message,
                    selected_model,
                ),
                timeout=8.0,
            )
        except asyncio.TimeoutError:
            # CENH [3]: Graceful degradation — log and proceed without
            # historical context. The next turn will retry.
            logger.warning(
                "VAMP memory retrieval timed out after 8s for conversation %s; "
                "proceeding without historical context. The next turn will retry.",
                conversation_id,
            )
            return None
        except Exception as exc:
            logger.warning(
                "VAMP historical context retrieval failed for %s: %s",
                conversation_id,
                exc,
            )
            return None

    conversation, historical_context = await asyncio.gather(load_conversation(), load_historical_context())
    return InitialStreamContext(conversation, historical_context)
