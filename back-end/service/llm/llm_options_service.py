"""Application service for exposing configured LLM provider options.

Controllers should not depend on provider factories directly. This service is
the boundary between HTTP handlers and the concrete LLM provider layer.
"""

from config import get_config
from llm_provider.model_factory import (
    get_default_model,
    get_provider_api_key,
    get_provider_models,
    get_supported_providers,
    resolve_model_selection,
)


class LLMOptionsService:
    """Read-only service for provider/model selection metadata."""

    @staticmethod
    def supported_providers() -> set[str]:
        """Return the set of LLM provider names enabled in configuration."""
        return set(get_supported_providers())

    @staticmethod
    def build_provider_options() -> tuple[list[dict], str]:
        """Build the list of provider option dicts and the default provider name."""
        config = get_config()
        options = []
        for provider_name in get_supported_providers():
            models = get_provider_models(provider_name)
            options.append(
                {
                    "name": provider_name,
                    "label": provider_name.capitalize(),
                    "models": models,
                    "default_model": models[0] if models else None,
                    "has_api_key": bool(get_provider_api_key(provider_name)),
                }
            )

        selected_options = [option for option in options if option["has_api_key"]]
        if not selected_options:
            return [], config.LLM_PROVIDER

        default_provider = (
            config.LLM_PROVIDER
            if any(option["name"] == config.LLM_PROVIDER for option in selected_options)
            else selected_options[0]["name"]
        )
        return selected_options, default_provider

    @staticmethod
    def default_model(provider: str) -> str:
        """Return the configured default model id for ``provider``."""
        return get_default_model(provider)

    @staticmethod
    def resolve_selection(provider: str, model: str | None = None) -> tuple[str, str]:
        """Normalize and authorize one configured provider/model selection."""
        return resolve_model_selection(provider, model)
