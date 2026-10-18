"""Behavioral tests for sanitized development startup diagnostics."""

from __future__ import annotations

import logging
from types import SimpleNamespace

import pytest

from core import startup_diagnostics as diagnostics


@pytest.mark.asyncio
async def test_startup_probe_reports_success_with_operator_detail() -> None:
    """Catch successful dependency probes being reported as merely configured."""

    async def ping() -> bool:
        return True

    result = await diagnostics.run_startup_probe(
        "Redis",
        ping,
        timeout_seconds=1,
        success_detail="PING succeeded",
    )

    assert result.name == "Redis"
    assert result.status == "ok"
    assert result.detail == "PING succeeded"
    assert result.duration_ms >= 0


@pytest.mark.asyncio
async def test_startup_probe_sanitizes_dependency_failures() -> None:
    """Catch Redis URLs, credentials, or provider details leaking through failed probes."""
    raw_secret = "redis://default:super-secret@internal.example:6379"

    async def fail() -> None:
        raise RuntimeError(raw_secret)

    result = await diagnostics.run_startup_probe(
        "Redis",
        fail,
        timeout_seconds=1,
        success_detail="PING succeeded",
    )

    assert result.status == "warning"
    assert result.detail == "probe failed (RuntimeError)"
    assert raw_secret not in result.detail


def test_startup_probe_logging_uses_status_appropriate_levels(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Catch failed probes being hidden at INFO or successful probes appearing unhealthy."""
    test_logger = logging.getLogger("tests.startup_diagnostics")
    success = diagnostics.StartupProbeResult("Redis", "ok", "PING succeeded", 4.2)
    not_checked = diagnostics.StartupProbeResult(
        "Bedrock",
        "not_checked",
        "clients constructed; API access not tested",
        12.0,
    )
    failure = diagnostics.StartupProbeResult("Firestore", "warning", "probe failed (TimeoutError)", 1000.0)

    with caplog.at_level(logging.INFO, logger=test_logger.name):
        diagnostics.log_startup_probe(test_logger, success)
        diagnostics.log_startup_probe(test_logger, not_checked)
        diagnostics.log_startup_probe(test_logger, failure)

    records = [record for record in caplog.records if record.name == test_logger.name]
    assert [(record.levelno, record.getMessage()) for record in records] == [
        (logging.INFO, "Startup check Redis: OK (PING succeeded, 4.2 ms)"),
        (
            logging.INFO,
            "Startup check Bedrock: NOT_CHECKED (clients constructed; API access not tested, 12.0 ms)",
        ),
        (logging.WARNING, "Startup check Firestore: WARNING (probe failed (TimeoutError), 1000.0 ms)"),
    ]


def test_development_runtime_modes_make_risky_tradeoffs_explicit(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Catch ephemeral storage, disabled safeguards, or network exposure becoming invisible."""
    test_logger = logging.getLogger("tests.startup_runtime_modes")

    with caplog.at_level(logging.INFO, logger=test_logger.name):
        diagnostics.log_development_runtime_modes(
            test_logger,
            host="0.0.0.0",
            http_rate_limit_enabled=True,
            llm_rate_limit_enabled=False,
            user_quota_enabled=False,
        )

    rendered = [record.getMessage() for record in caplog.records if record.name == test_logger.name]
    assert rendered == [
        "Development safeguards: HTTP rate limit=enabled, LLM rate limiter=disabled, user quota=disabled",
        "Development persistence: LangGraph InMemorySaver is ephemeral; state is lost on restart",
        "Development network exposure: host=0.0.0.0 accepts connections on all interfaces; CORS is not access control",
    ]


def test_startup_summary_reports_each_validation_level(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Catch configured-only dependencies being summarized as fully healthy."""
    test_logger = logging.getLogger("tests.startup_summary")
    results = [
        diagnostics.StartupProbeResult("Redis", "ok", "PING succeeded", 2.0),
        diagnostics.StartupProbeResult("Firestore", "warning", "probe failed (TimeoutError)", 1000.0),
        diagnostics.StartupProbeResult("Bedrock", "not_checked", "clients constructed; API access not tested", 50.0),
    ]

    with caplog.at_level(logging.INFO, logger=test_logger.name):
        diagnostics.log_startup_summary(test_logger, results, total_duration_ms=1234.5)

    assert caplog.records[-1].getMessage() == (
        "Startup diagnostics completed in 1234.5 ms (Redis=ok, Firestore=warning, Bedrock=not_checked)"
    )


def test_model_prewarm_reports_constructed_and_attempted_counts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Catch best-effort Bedrock prewarming being logged without an accurate outcome count."""
    from llm_provider import model_factory

    monkeypatch.setattr(model_factory, "get_supported_providers", lambda: ("bedrock",))
    monkeypatch.setattr(
        model_factory,
        "get_provider_models",
        lambda _provider: ["provider.model-ok", "provider.model-failed"],
    )

    def construct(_provider: str, *, model: str):
        if model == "provider.model-failed":
            raise RuntimeError("provider unavailable")
        return object()

    monkeypatch.setattr(model_factory, "get_chat_model", construct)

    assert model_factory.prewarm_chat_models() == {
        "attempted": 2,
        "initialized": 1,
    }


def test_kimi_tokenizer_load_is_pinned_to_configured_revision(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Catch startup executing moving, unpinned Hugging Face remote code."""
    import transformers

    from llm_provider import token_budget

    calls: list[tuple[str, dict]] = []

    class FakeTokenizer:
        def encode(self, _text: str) -> list[int]:
            return [1, 2]

    def load(repository: str, **kwargs):
        calls.append((repository, kwargs))
        return FakeTokenizer()

    monkeypatch.setattr(transformers.AutoTokenizer, "from_pretrained", load)
    monkeypatch.setattr(token_budget.Config, "KIMI_TOKENIZER_REPOSITORY", "moonshotai/Kimi-K2-Instruct", raising=False)
    monkeypatch.setattr(token_budget.Config, "KIMI_TOKENIZER_REVISION", "pinned-revision", raising=False)
    token_budget._TOKENIZER_CACHE.clear()
    try:
        assert token_budget.estimate_tokens("hello", "moonshotai.kimi-k2.5") == 2
    finally:
        token_budget._TOKENIZER_CACHE.clear()

    assert calls == [
        (
            "moonshotai/Kimi-K2-Instruct",
            {"revision": "pinned-revision", "trust_remote_code": True},
        )
    ]


def test_kimi_tokenizer_logs_safe_provenance(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Catch tokenizer class, immutable revision, or authentication state being invisible at startup."""
    import transformers

    from llm_provider import token_budget

    class FakeTokenizer:
        def encode(self, _text: str) -> list[int]:
            return [1]

    monkeypatch.setattr(
        transformers.AutoTokenizer,
        "from_pretrained",
        lambda *_args, **_kwargs: FakeTokenizer(),
    )
    monkeypatch.setattr(token_budget.Config, "KIMI_TOKENIZER_REPOSITORY", "moonshotai/Kimi-K2-Instruct", raising=False)
    monkeypatch.setattr(token_budget.Config, "KIMI_TOKENIZER_REVISION", "pinned-revision", raising=False)
    monkeypatch.delenv("HF_TOKEN", raising=False)
    token_budget._TOKENIZER_CACHE.clear()
    try:
        with caplog.at_level(logging.INFO, logger=token_budget.logger.name):
            token_budget.estimate_tokens("hello", "moonshotai.kimi-k2.5")
    finally:
        token_budget._TOKENIZER_CACHE.clear()

    rendered = [record.getMessage() for record in caplog.records if record.name == token_budget.logger.name]
    assert len(rendered) == 1
    assert "model=moonshotai.kimi-k2.5" in rendered[0]
    assert "repository=moonshotai/Kimi-K2-Instruct" in rendered[0]
    assert "revision=pinned-revision" in rendered[0]
    assert "class=FakeTokenizer" in rendered[0]
    assert "authenticated=False" in rendered[0]
    assert "load_ms=" in rendered[0]


def test_live_startup_probes_default_to_development_only() -> None:
    """Catch network probes unexpectedly running in tests or production by default."""
    from config import DevelopmentConfig, ProductionConfig, TestingConfig

    assert DevelopmentConfig.STARTUP_DIAGNOSTICS_ENABLED is True
    assert ProductionConfig.STARTUP_DIAGNOSTICS_ENABLED is False
    assert TestingConfig.STARTUP_DIAGNOSTICS_ENABLED is False


@pytest.mark.asyncio
async def test_development_dependency_probes_verify_redis_and_firestore(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Catch startup claiming Redis or Firestore health without exercising either service."""
    import main

    calls: list[object] = []

    class FakeRedis:
        async def ping(self) -> bool:
            calls.append("redis-ping")
            return True

    class FakeFirestore:
        def collections(self, *, retry, timeout):
            calls.append(("firestore-list", retry, timeout))
            return iter(())

    monkeypatch.setattr(main.FirestoreService, "get_db", lambda: FakeFirestore())

    results = await main._run_startup_dependency_probes(
        FakeRedis(),
        timeout_seconds=0.25,
    )

    assert [(result.name, result.status, result.detail) for result in results] == [
        ("Redis", "ok", "PING succeeded"),
        ("Firestore", "ok", "read probe succeeded"),
    ]
    assert calls == ["redis-ping", ("firestore-list", None, 0.25)]


@pytest.mark.asyncio
async def test_lifespan_emits_truthful_development_startup_summary(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Catch validated dependency details being implemented but never wired into application startup."""
    import main
    from llm_provider import model_factory, token_budget
    from vamp_memory import maintenance, vamp_memory_service

    class FakeRedis:
        async def ping(self) -> bool:
            return True

        async def close(self) -> None:
            return None

    class FakeFirestore:
        def collections(self, *, retry, timeout):
            del retry, timeout
            return iter(())

    class FakeVectorStore:
        async def ensure_ready(self) -> None:
            return None

    async def maintain(stop, _interval) -> None:
        await stop.wait()

    redis_client = FakeRedis()
    monkeypatch.setattr(main.AppConfig, "APP_ENV", "development")
    monkeypatch.setattr(main.AppConfig, "STARTUP_DIAGNOSTICS_ENABLED", True)
    monkeypatch.setattr(main.AppConfig, "STARTUP_DIAGNOSTICS_TIMEOUT_SECONDS", 0.25)
    monkeypatch.setattr(main.AppConfig, "REDIS_URL", "redis://configured-but-never-logged")
    monkeypatch.setattr(main.AppConfig, "VAMP_MEMORY_ENABLED", True)
    monkeypatch.setattr(main.AppConfig, "VAMP_QDRANT_COLLECTION", "safe-collection")
    monkeypatch.setattr(main.AppConfig, "UVICORN_HOST", "0.0.0.0")
    monkeypatch.setattr(main.AppConfig, "RATELIMIT_ENABLED", True)
    monkeypatch.setattr(main.AppConfig, "LLM_RATELIMIT_ENABLED", False)
    monkeypatch.setattr(main.AppConfig, "USER_QUOTA_ENABLED", False)
    monkeypatch.setattr(main.AppConfig, "validate_firebase_project_consistency", staticmethod(lambda: True))
    monkeypatch.setattr(main.FirestoreService, "initialize", classmethod(lambda _cls: None))
    monkeypatch.setattr(main.FirestoreService, "get_db", classmethod(lambda _cls: FakeFirestore()))
    monkeypatch.setattr(main.redis, "from_url", lambda *_args, **_kwargs: redis_client)
    monkeypatch.setattr(main, "set_redis_client", lambda _client: None)
    monkeypatch.setattr(main, "get_redis_client", lambda: redis_client)
    monkeypatch.setattr(main, "create_user_quota_service", lambda *_args: object())
    monkeypatch.setattr(main, "init_checkpointer", _async_noop)
    monkeypatch.setattr(main, "shutdown_checkpointer", _async_noop)
    monkeypatch.setattr(token_budget, "eagerly_initialize_static_budgets", lambda: None)
    monkeypatch.setattr(
        model_factory,
        "prewarm_chat_models",
        lambda: {"attempted": 3, "initialized": 3},
    )
    monkeypatch.setattr(
        vamp_memory_service,
        "get_vamp_memory_service",
        lambda: SimpleNamespace(vector_store=FakeVectorStore()),
    )
    monkeypatch.setattr(maintenance, "run_vamp_maintenance", maintain)
    monkeypatch.setattr(main.app.state, "llm_rate_limiter", SimpleNamespace(redis=None))

    with caplog.at_level(logging.INFO, logger=main.logger.name):
        async with main.lifespan(main.app):
            pass

    rendered = [record.getMessage() for record in caplog.records if record.name == main.logger.name]
    assert "Startup diagnostics [development]" in rendered
    assert any(message.startswith("Startup check Redis: OK") for message in rendered)
    assert any(message.startswith("Startup check Firestore: OK") for message in rendered)
    assert any(
        message.startswith("Startup check Bedrock: NOT_CHECKED (3/3 clients constructed; API access not tested, ")
        for message in rendered
    )
    assert any(message.startswith("Startup check Qdrant: OK") for message in rendered)
    assert any(
        message.startswith("Startup diagnostics completed in ")
        and "Redis=ok, Firestore=ok, Bedrock=not_checked, Qdrant=ok" in message
        for message in rendered
    )
    assert all("redis://configured-but-never-logged" not in message for message in rendered)


async def _async_noop(*_args, **_kwargs) -> None:
    return None


def test_firebase_initialization_does_not_claim_unverified_connectivity(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Catch local SDK construction being mislabeled as a successful Firestore connection."""
    from service.firestore import firestore_service

    credentials = {"project_id": "project-safe-for-log"}
    monkeypatch.setattr(firestore_service.firebase_admin, "_apps", {})
    monkeypatch.setattr(firestore_service.Config, "validate_firebase_credentials", staticmethod(lambda: True))
    monkeypatch.setattr(
        firestore_service.Config,
        "get_firebase_credentials",
        staticmethod(lambda: credentials),
    )
    monkeypatch.setattr(firestore_service.credentials, "Certificate", lambda _value: object())
    monkeypatch.setattr(firestore_service.firebase_admin, "initialize_app", lambda _credential: object())

    with caplog.at_level(logging.INFO, logger=firestore_service.logger.name):
        firestore_service._initialize_firebase()

    rendered = [record.getMessage() for record in caplog.records if record.name == firestore_service.logger.name]
    assert rendered == [
        "Firebase Admin SDK initialized successfully",
        "Firebase SDK configured for project project-safe-for-log (network not yet verified)",
    ]
