"""Regression tests for configured provider/model authorization.

These tests exercise the production selection and streaming-controller paths
while replacing only resource boundaries with recorders. They prove invalid
selections fail before Firestore ownership checks, quota/rate-limit work, or
model/client construction.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException


@pytest.fixture
def configured_models(monkeypatch):
    """Configure the Bedrock allowlist without reading an environment file."""
    from llm_provider import model_factory

    config = SimpleNamespace(
        BEDROCK_MODELS=["allowed.model-v1", "allowed.model-v2"],
        BEDROCK_MODEL="",
        RESERVED_OUTPUT_TOKENS=4000,
    )
    monkeypatch.setattr(model_factory, "get_config", lambda: config)
    return model_factory


def test_resolver_normalizes_provider_and_uses_configured_default(configured_models) -> None:
    """Catch bypasses that skip configured defaults or provider normalization."""
    assert configured_models.resolve_model_selection(" Bedrock ", None) == (
        "bedrock",
        "allowed.model-v1",
    )
    assert configured_models.resolve_model_selection("bedrock", "allowed.model-v2") == (
        "bedrock",
        "allowed.model-v2",
    )


@pytest.mark.parametrize(
    ("provider", "model"),
    [
        ("unsupported", "allowed.model-v1"),
        ("bedrock", "not-enabled.model"),
    ],
)
def test_resolver_rejects_unconfigured_provider_or_model(configured_models, provider, model) -> None:
    """Catch authorization changes that permit a provider/model outside config."""
    with pytest.raises(ValueError):
        configured_models.resolve_model_selection(provider, model)


def test_resolver_rejects_empty_allowlist_even_with_configured_default(
    monkeypatch, configured_models
) -> None:
    """Catch a default-model fallback that re-enables a disabled provider."""
    empty_config = SimpleNamespace(BEDROCK_MODELS=[], BEDROCK_MODEL="allowed.model-v1")
    monkeypatch.setattr(configured_models, "get_config", lambda: empty_config)

    with pytest.raises(ValueError):
        configured_models.resolve_model_selection("bedrock", None)


def test_factory_rejects_unknown_model_before_cached_client_construction(
    monkeypatch, configured_models
) -> None:
    """Catch a factory path that constructs a client for a disabled model ID."""
    cache_calls: list[tuple[object, ...]] = []

    def record_cached_model(*args):
        cache_calls.append(args)
        return object()

    monkeypatch.setattr(configured_models, "_get_cached_chat_model", record_cached_model)

    with pytest.raises(ValueError):
        configured_models.get_chat_model("bedrock", "not-enabled.model")

    assert cache_calls == []


class _Recorder:
    """Record a resource-boundary invocation without performing it."""

    def __init__(self, result=None):
        self.calls: list[tuple[object, ...]] = []
        self.result = result

    def __call__(self, *args, **kwargs):
        self.calls.append((*args, kwargs))
        return self.result


class _AsyncRecorder(_Recorder):
    """Async counterpart used for quota and limiter operations."""

    async def __call__(self, *args, **kwargs):
        self.calls.append((*args, kwargs))
        return self.result


@pytest.mark.asyncio
async def test_controller_rejects_unknown_model_before_any_resource_activity(
    monkeypatch, configured_models
) -> None:
    """Catch ordering changes that debit or construct work before authorization."""
    from controller import conversations_controller as controller

    ownership = _Recorder(True)
    quota_check = _AsyncRecorder((True, SimpleNamespace(to_dict=lambda: {})))
    rate_limiter_acquire = _AsyncRecorder((True, "test-api-key"))
    model_construction = _Recorder()
    request = SimpleNamespace(
        app=SimpleNamespace(
            state=SimpleNamespace(
                user_quota=SimpleNamespace(check_and_increment=quota_check),
                llm_rate_limiter=SimpleNamespace(acquire=rate_limiter_acquire),
            )
        )
    )

    async def run_owner_check(check, *args):
        """Keep the ownership recorder local; sandboxed tests cannot start worker threads."""
        return check(*args)

    monkeypatch.setattr(controller, "run_in_threadpool", run_owner_check)
    monkeypatch.setattr(
        controller.ConversationService,
        "verify_conversation_owner",
        ownership,
    )
    monkeypatch.setattr(
        controller.ConversationService,
        "create_streaming_generator",
        model_construction,
    )

    with pytest.raises(HTTPException) as exc_info:
        await controller._handle_agent_stream(
            request=request,
            user_id="user-1",
            conversation_id="conversation-1",
            provider="bedrock",
            model="not-enabled.model",
            stream_generator_kwargs={"prompt": "hello"},
        )

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail["error"] == "invalid_model"
    assert ownership.calls == []
    assert quota_check.calls == []
    assert rate_limiter_acquire.calls == []
    assert model_construction.calls == []
