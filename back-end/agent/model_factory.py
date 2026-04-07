"""
Model factory — provider-agnostic ChatModel instantiation.

Maps provider names to LangChain ChatModel classes. Cerebras uses
the OpenAI-compatible endpoint so no dedicated SDK is needed.
"""

import os
import logging
from functools import lru_cache
from typing import Optional

from langchain_core.language_models.chat_models import BaseChatModel

logger = logging.getLogger(__name__)

# Default models per provider (overridden by env vars)
_DEFAULT_MODELS = {
    "gemini": "gemini-2.5-flash-lite",
    "cerebras": "llama3.1-8b",
    "anthropic": "claude-sonnet-4-20250514",
    "openai": "gpt-4o-mini",
}

CEREBRAS_BASE_URL = "https://api.cerebras.ai/v1"


def get_default_model(provider: str) -> str:
    """Return the configured default model for *provider*."""
    provider = provider.strip().lower()
    env_key = f"{provider.upper()}_MODEL"
    return os.getenv(env_key) or _DEFAULT_MODELS.get(provider, "")


# Reasoning budget tokens per effort level
_REASONING_BUDGET = {"low": 1024, "medium": 8000, "high": 16000}


def get_chat_model(
    provider: str,
    model: Optional[str] = None,
    api_key: Optional[str] = None,
    *,
    enable_reasoning: bool = True,
    reasoning_effort: str = "medium",
    temperature: float = 0.2,
) -> BaseChatModel:
    """
    Instantiate the correct ChatModel for *provider*.

    Args:
        provider: One of 'gemini', 'cerebras', 'anthropic', 'openai'.
        model: Model name. Falls back to env / default when ``None``.
        api_key: Explicit API key (from rate-limiter key rotation).
        enable_reasoning: Whether to enable extended thinking/reasoning.
        reasoning_effort: 'low' | 'medium' | 'high' — maps to token budget.
        temperature: Sampling temperature.

    Returns:
        A LangChain ``BaseChatModel`` ready for ``.bind_tools()`` / ``.ainvoke()``.
    """
    provider = provider.strip().lower()
    model = model or get_default_model(provider)
    budget = _REASONING_BUDGET.get(reasoning_effort, 8000)

    if provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI

        key = api_key or _resolve_key(
            "GEMINI_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEYS"
        )
        kwargs = dict(model=model, google_api_key=key, temperature=temperature)
        if enable_reasoning:
            # thinking_budget: positive int enables thinking on Gemini 2.5+ models.
            # Non-thinking models ignore this. include_thoughts=True makes the
            # thinking content visible in the streamed content blocks.
            kwargs["thinking_budget"] = budget
            kwargs["include_thoughts"] = True
        return ChatGoogleGenerativeAI(**kwargs)

    if provider == "cerebras":
        from langchain_openai import ChatOpenAI

        key = api_key or _resolve_key("CEREBRAS_API_KEY", keys_env="CEREBRAS_API_KEYS")
        # Cerebras does not support reasoning/thinking — parameter ignored.
        return ChatOpenAI(
            model=model,
            api_key=key,
            base_url=CEREBRAS_BASE_URL,
            temperature=temperature,
        )

    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic

        key = api_key or _resolve_key(
            "ANTHROPIC_API_KEY", keys_env="ANTHROPIC_API_KEYS"
        )
        kwargs = dict(model=model, anthropic_api_key=key)
        if enable_reasoning:
            # Anthropic requires temperature=1 when thinking is enabled.
            kwargs["thinking"] = {"type": "enabled", "budget_tokens": budget}
            kwargs["temperature"] = 1
        else:
            kwargs["temperature"] = temperature
        return ChatAnthropic(**kwargs)

    if provider == "openai":
        from langchain_openai import ChatOpenAI

        key = api_key or _resolve_key("OPENAI_API_KEY", keys_env="OPENAI_API_KEYS")
        # o1/o3/o4-mini have built-in reasoning — no extra config needed.
        # For standard GPT models, reasoning toggle has no effect.
        return ChatOpenAI(
            model=model,
            api_key=key,
            temperature=temperature,
        )

    raise ValueError(
        f"Unknown provider: {provider!r}. Supported: gemini, cerebras, anthropic, openai"
    )


@lru_cache(maxsize=1)
def get_supported_providers() -> tuple[str, ...]:
    """Return provider names that have at least one API key configured."""
    available: list[str] = []
    checks = {
        "gemini": ("GEMINI_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEYS"),
        "cerebras": ("CEREBRAS_API_KEY", "CEREBRAS_API_KEYS"),
        "anthropic": ("ANTHROPIC_API_KEY", "ANTHROPIC_API_KEYS"),
        "openai": ("OPENAI_API_KEY", "OPENAI_API_KEYS"),
    }
    for name, env_vars in checks.items():
        for var in env_vars:
            if os.getenv(var, "").strip():
                available.append(name)
                break
    return tuple(available)


def get_provider_models(provider: str) -> list[str]:
    """Return the comma-separated model list from env, or the single default."""
    provider = provider.strip().lower()
    env_key = f"{provider.upper()}_MODELS"
    raw = os.getenv(env_key, "")
    if raw.strip():
        return [m.strip() for m in raw.split(",") if m.strip()]
    default = get_default_model(provider)
    return [default] if default else []


# ── helpers ──────────────────────────────────────────────────────────


def _resolve_key(*single_envs: str, keys_env: str | None = None) -> str:
    """Try single-key env vars first, then the first entry from a comma list."""
    for var in single_envs:
        val = os.getenv(var, "").strip()
        if val:
            return val
    if keys_env:
        raw = os.getenv(keys_env, "")
        keys = [k.strip() for k in raw.split(",") if k.strip()]
        if keys:
            return keys[0]
    # Last resort: generic fallback
    for generic in ("LLM_API_KEY", "LLM_API_KEYS"):
        val = os.getenv(generic, "").strip()
        if val:
            return val.split(",")[0].strip()
    raise ValueError(
        f"No API key found. Set one of: {', '.join(single_envs)}"
        + (f", or {keys_env}" if keys_env else "")
    )
