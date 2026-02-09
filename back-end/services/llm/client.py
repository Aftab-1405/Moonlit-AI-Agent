"""
LLMClient - Connection and configuration management for LLM APIs.

Handles provider resolution, model selection, and token limits.
"""

import os

from .providers import get_provider, get_supported_provider_names

# Default values (overridden by .env)
DEFAULT_MAX_TOKENS = 4096
DEFAULT_MAX_COMPLETION_TOKENS = 8192


class LLMClient:
    """Connection and configuration management for LLM APIs."""

    @staticmethod
    def get_provider_name(provider_name: str | None = None) -> str:
        """Get configured provider name."""
        if provider_name:
            return provider_name.strip().lower()
        return os.getenv("LLM_PROVIDER", "cerebras").strip().lower()

    @staticmethod
    def get_provider(provider_name: str | None = None):
        """Get active provider adapter."""
        return get_provider(LLMClient.get_provider_name(provider_name))

    @staticmethod
    def get_supported_providers() -> tuple[str, ...]:
        """Get supported provider names."""
        return get_supported_provider_names()

    @staticmethod
    def get_client(api_key: str = None):
        """
        Creates and returns the configured provider client.

        Args:
            api_key: Optional API key. If not provided, falls back to env var.
        """
        provider = LLMClient.get_provider()
        return provider.get_client(api_key)
    
    @staticmethod
    def get_model_name(provider_name: str | None = None, requested_model: str | None = None) -> str:
        """Gets the model name from provider-specific config or defaults."""
        if requested_model and requested_model.strip():
            return requested_model.strip()

        provider_name = LLMClient.get_provider_name(provider_name)

        # Prefer provider-specific model variables when available.
        if provider_name == "gemini":
            gemini_model = os.getenv("GEMINI_MODEL")
            if gemini_model:
                return gemini_model
        elif provider_name == "cerebras":
            cerebras_model = os.getenv("CEREBRAS_MODEL")
            if cerebras_model:
                return cerebras_model

        configured_model = os.getenv("LLM_MODEL")
        if configured_model:
            return configured_model

        provider = LLMClient.get_provider(provider_name)
        return provider.get_default_model()
    
    @staticmethod
    def is_reasoning_model(provider_name: str | None = None, model_name: str | None = None) -> bool:
        """Check if current model supports reasoning."""
        provider_name = LLMClient.get_provider_name(provider_name)
        model = LLMClient.get_model_name(provider_name=provider_name, requested_model=model_name)
        provider = LLMClient.get_provider(provider_name)
        return provider.supports_reasoning(model)
    
    @staticmethod
    def get_max_tokens() -> int:
        """Gets max response tokens from environment or defaults."""
        return int(os.getenv('LLM_MAX_TOKENS', DEFAULT_MAX_TOKENS))
    
    @staticmethod
    def get_max_completion_tokens() -> int:
        """Gets max completion tokens (for reasoning) from environment or defaults."""
        return int(os.getenv('LLM_MAX_COMPLETION_TOKENS', DEFAULT_MAX_COMPLETION_TOKENS))
