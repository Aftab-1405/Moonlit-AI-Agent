"""
Provider factory for selecting LLM provider adapters.
"""

import os
from functools import lru_cache

from .base import LLMProvider
from .cerebras_provider import CerebrasProvider
from .gemini_provider import GeminiProvider


_PROVIDERS = {
    "cerebras": CerebrasProvider,
    "gemini": GeminiProvider,
}


def get_supported_provider_names() -> tuple[str, ...]:
    """Return supported provider names."""
    return tuple(sorted(_PROVIDERS.keys()))


@lru_cache(maxsize=8)
def get_provider(provider_name: str | None = None) -> LLMProvider:
    """
    Return a provider adapter instance.

    Defaults to `LLM_PROVIDER` env var, or `cerebras` when not configured.
    """
    name = (provider_name or os.getenv("LLM_PROVIDER", "cerebras")).strip().lower()
    provider_cls = _PROVIDERS.get(name)
    if not provider_cls:
        supported = ", ".join(get_supported_provider_names())
        raise ValueError(f"Unsupported LLM_PROVIDER '{name}'. Supported values: {supported}")
    return provider_cls()
