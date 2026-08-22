"""Provider-agnostic chat-model construction and configuration.

Model caching
-------------
``_get_cached_chat_model`` is ``@lru_cache``-d on
``(provider, model, reasoning flag, reasoning effort, temperature, max_tokens)``
so repeated chat requests for the same configuration reuse a single
``ChatBedrockConverse`` instance instead of rebuilding boto3 clients per
request. FIX [M23] ensures the cached instance does NOT bake in static
AWS credentials — when ``AWS_ACCESS_KEY_ID`` is not set in the
environment, the underlying ``ChatBedrockConverse`` is constructed
without explicit credential kwargs so boto3's default credential chain
resolves (and rotates) credentials on each call.

Prewarming
----------
``prewarm_chat_models`` is called from the application lifespan to
construct the configured model clients before accepting traffic, so the
first user request doesn't pay the boto3 init cost.
"""

import logging
from functools import lru_cache
from typing import Optional

from langchain_core.language_models.chat_models import BaseChatModel

from config import get_config

logger = logging.getLogger(__name__)


def get_default_model(provider: str) -> str:
    """Return an explicit default or the first configured provider model."""
    config = get_config()
    provider = provider.strip().lower()
    singular = str(getattr(config, f"{provider.upper()}_MODEL", "") or "").strip()
    if singular:
        return singular
    configured = getattr(config, f"{provider.upper()}_MODELS", []) or []
    return str(configured[0]).strip() if configured else ""


def _reasoning_request_fields(
    model: str,
    *,
    enable_reasoning: bool,
    reasoning_effort: str,
) -> dict:
    """Build provider-specific reasoning request fields for the model.

    GPT-OSS models expose reasoning via an ``openai_effort`` style knob and
    have no fully-disabled mode (``low`` is the documented minimum); other
    models return an empty dict so the caller skips reasoning configuration.

    Args:
        model: Bedrock model ID used to look up ``reasoning_type``.
        enable_reasoning: When ``False``, clamp GPT-OSS effort to ``low``.
        reasoning_effort: One of ``"low"``, ``"medium"``, ``"high"``.

    Returns:
        A dict of additional model request fields (possibly empty).

    Raises:
        ValueError: If ``reasoning_effort`` is not a supported level.
    """
    from llm_provider.model_capabilities import model_capability

    effort = str(reasoning_effort or "medium").lower()
    if effort not in {"low", "medium", "high"}:
        raise ValueError(f"Unsupported reasoning effort: {reasoning_effort}")
    reasoning_type = model_capability(model, "reasoning_type", "none")
    if reasoning_type == "openai_effort":
        # GPT OSS has no fully-disabled reasoning mode. Low is its documented
        # minimum and avoids pretending that reasoning can be turned off.
        return {"reasoning_effort": effort if enable_reasoning else "low"}
    return {}


@lru_cache(maxsize=32)
def _get_cached_chat_model(
    provider: str,
    model: str,
    enable_reasoning: bool,
    reasoning_effort: str,
    temperature: float,
    max_tokens: int,
) -> BaseChatModel:
    """Construct (and cache) a chat model for the given config tuple.

    Caching is keyed on the user-visible knobs (provider, model, reasoning
    flag, reasoning effort, temperature, max_tokens) so two requests with
    the same config reuse one ``ChatBedrockConverse`` instance and its
    underlying boto3 clients.

    FIX [M23]: The cached instance does NOT bake in static AWS credentials
    when ``AWS_ACCESS_KEY_ID`` is unset. The underlying
    :func:`llm_provider.bedrock_client.init_chat_bedrock` defers to
    boto3's default credential chain in that case, so temporary
    credentials (e.g. from ``aws sso login``) rotate automatically
    without invalidating this cache entry.
    """
    from llm_provider.bedrock_client import init_chat_bedrock

    request_fields = _reasoning_request_fields(
        model,
        enable_reasoning=enable_reasoning,
        reasoning_effort=reasoning_effort,
    )
    return init_chat_bedrock(
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        additional_model_request_fields=request_fields or None,
    )


def get_chat_model(
    provider: str,
    model: Optional[str] = None,
    api_key: Optional[str] = None,
    *,
    enable_reasoning: bool = True,
    reasoning_effort: str = "medium",
    temperature: float = 0.2,
    max_tokens: int | None = None,
) -> BaseChatModel:
    """Return a reusable LangChain chat model for the requested configuration.

    The provider and model must be enabled in configuration. The selected model
    is resolved via :func:`resolve_model_selection` when ``model`` is omitted,
    and the requested ``max_tokens`` is clamped to the model's
    ``max_output_tokens`` capability.
    The underlying client is cached by :func:`_get_cached_chat_model` so
    repeated calls with the same configuration reuse one
    ``ChatBedrockConverse`` instance.

    Args:
        provider: Provider name (case-insensitive) enabled in configuration.
        model: Optional explicit model ID. Defaults to the provider's first
            configured model.
        api_key: Unused — Bedrock uses the AWS credential provider chain.
            Deliberately consumed and discarded (see inline comment).
        enable_reasoning: Whether to enable reasoning for models that support it.
        reasoning_effort: Reasoning effort level (``low``/``medium``/``high``).
        temperature: Sampling temperature passed to the chat model.
        max_tokens: Requested output-token cap. Clamped to the model's
            ``max_output_tokens`` capability and to ``RESERVED_OUTPUT_TOKENS``
            when ``None``.

    Returns:
        A cached :class:`BaseChatModel` (``ChatBedrockConverse`) instance.

    Raises:
        ValueError: If the provider or model is not enabled in configuration.
    """
    del api_key  # Bedrock uses the AWS credential provider chain.
    provider, selected_model = resolve_model_selection(provider, model)
    from llm_provider.model_capabilities import model_capability

    config = get_config()
    requested_output = int(max_tokens or config.RESERVED_OUTPUT_TOKENS)
    model_output_limit = int(model_capability(selected_model, "max_output_tokens", requested_output))
    bounded_output = max(1, min(requested_output, model_output_limit))
    return _get_cached_chat_model(
        provider,
        selected_model,
        bool(enable_reasoning),
        str(reasoning_effort or "medium").lower(),
        float(temperature),
        bounded_output,
    )


@lru_cache(maxsize=1)
def get_supported_providers() -> tuple[str, ...]:
    """Return the tuple of supported LLM provider names."""
    return ("bedrock",)


def get_provider_models(provider: str) -> list[str]:
    """Return the list of model IDs configured for ``provider``.

    Reads only the ``{PROVIDER}_MODELS`` config attribute and
    strips/normalizes each entry. A separately configured default is not an
    enabled-model fallback.

    Args:
        provider: Provider name (case-insensitive).

    Returns:
        A list of non-empty, stripped model IDs (possibly empty when no
        models are configured).
    """
    config = get_config()
    provider = provider.strip().lower()
    models = getattr(config, f"{provider.upper()}_MODELS", []) or []
    return [str(model).strip() for model in models if str(model).strip()]


def resolve_model_selection(provider: str, model: str | None = None) -> tuple[str, str]:
    """Normalize and authorize one configured provider/model selection.

    This is the sole configured allowlist boundary for chat-model construction
    and HTTP request admission. A resolved model is always a member of the
    selected provider's configured model tuple.
    """
    normalized_provider = str(provider or "").strip().lower()
    if normalized_provider not in get_supported_providers():
        raise ValueError("Unsupported model provider")
    allowed_models = tuple(get_provider_models(normalized_provider))
    selected_model = str(model or get_default_model(normalized_provider)).strip()
    if not allowed_models or selected_model not in allowed_models:
        raise ValueError("Model is not enabled for this provider")
    return normalized_provider, selected_model


def get_provider_api_key(provider: str) -> str | None:
    """Return a non-secret marker when Bedrock authentication can be attempted."""
    config = get_config()
    if provider.strip().lower() != "bedrock":
        return None
    if config.AWS_ACCESS_KEY_ID:
        return "aws_credentials_present"
    if config.AWS_REGION:
        return "aws_provider_chain"
    return None


def prewarm_chat_models() -> None:
    """Construct reusable provider clients/models before accepting traffic.

    Called from the FastAPI lifespan so the first user request doesn't pay
    the boto3 client init cost (~hundreds of ms for the first STS call).
    Each model is constructed via :func:`get_chat_model`, which consults
    :func:`_get_cached_chat_model`'s LRU cache. FIX [M23] ensures the
    prewarmed instances don't bake in static AWS credentials — when
    ``AWS_ACCESS_KEY_ID`` is unset the underlying boto3 clients resolve
    credentials from the default chain on each call.
    """
    for provider in get_supported_providers():
        for model in get_provider_models(provider):
            try:
                get_chat_model(provider, model=model)
            except Exception as exc:
                logger.warning("Could not prewarm model %s: %s", model, exc)
