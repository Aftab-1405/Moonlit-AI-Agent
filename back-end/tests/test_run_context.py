"""Behavioral tests for resolving one immutable agent run policy."""

from __future__ import annotations

import asyncio
import json
from dataclasses import FrozenInstanceError
from types import SimpleNamespace

import pytest


def _resolve(**overrides):
    from service.conversations.run_context import resolve_run_policy

    inputs = {
        "prompt": "Explain the customer table",
        "requested_mode": "normal",
        "persisted_resume_mode": None,
        "provider": "bedrock",
        "model": "anthropic.claude-test",
        "db_connected": True,
    }
    inputs.update(overrides)
    return resolve_run_policy(**inputs)


@pytest.mark.parametrize(
    ("requested_mode", "persisted_resume_mode", "expected_mode", "expected_source", "expected_budget"),
    [
        ("tool_task", None, "tool_task", "explicit", (100, 50, 20, 600)),
        ("long_task", "tool_task", "long_task", "explicit", (200, 50, 20, 1200)),
        ("normal", None, "normal", "default", (50, 50, 20, 180)),
    ],
)
def test_explicit_and_default_policy_selection(
    requested_mode: str,
    persisted_resume_mode: str | None,
    expected_mode: str,
    expected_source: str,
    expected_budget: tuple[int, int, int, int],
) -> None:
    """Catch explicit-mode downgrades and incorrect configured budget selection."""
    policy = _resolve(
        requested_mode=requested_mode,
        persisted_resume_mode=persisted_resume_mode,
    )

    assert policy.task_mode == expected_mode
    assert policy.task_mode_source == expected_source
    assert (
        policy.budgets.graph_steps,
        policy.budgets.segment_steps,
        policy.budgets.tool_calls,
        policy.budgets.wall_clock_seconds,
    ) == expected_budget
    assert policy.provider == "bedrock"
    assert policy.model == "anthropic.claude-test"
    assert policy.db_connected is True


@pytest.mark.parametrize(
    ("prompt", "expected_mode"),
    [
        ("Analyze the database and produce a detailed report.", "long_task"),
        ("Inspect the database schema and explain its tables.", "tool_task"),
        ("Explain the customer table", "normal"),
    ],
)
def test_automatic_policy_selection(prompt: str, expected_mode: str) -> None:
    """Catch removal, weakening, or wrong ordering of automatic classification."""
    policy = _resolve(prompt=prompt)

    assert policy.task_mode == expected_mode
    assert policy.task_mode_source == ("automatic" if expected_mode != "normal" else "default")


@pytest.mark.parametrize(
    ("persisted_mode", "expected_budget"),
    [
        ("normal", (50, 50, 20, 180)),
        ("tool_task", (100, 50, 20, 600)),
        ("long_task", (200, 50, 20, 1200)),
    ],
)
def test_resume_policy_restores_persisted_mode(
    persisted_mode: str,
    expected_budget: tuple[int, int, int, int],
) -> None:
    """Catch a resume that silently falls back to the request default or reclassifies."""
    policy = _resolve(
        prompt="Analyze the database and produce a detailed report.",
        persisted_resume_mode=persisted_mode,
    )

    assert policy.task_mode == persisted_mode
    assert policy.task_mode_source == "resume"
    assert (
        policy.budgets.graph_steps,
        policy.budgets.segment_steps,
        policy.budgets.tool_calls,
        policy.budgets.wall_clock_seconds,
    ) == expected_budget


def test_resolved_policy_and_nested_budgets_are_frozen() -> None:
    """Catch mutable policy fields that can drift after resolution."""
    policy = _resolve(requested_mode="tool_task")

    with pytest.raises(FrozenInstanceError):
        policy.task_mode = "long_task"
    with pytest.raises(FrozenInstanceError):
        policy.budgets.graph_steps = 999


@pytest.mark.asyncio
async def test_automatic_long_mode_is_resolved_before_any_repository_call(monkeypatch) -> None:
    """Catch automatic classification that occurs after ownership/persistence work."""
    from controller import conversations_controller as controller
    from service.conversations.run_context import resolve_run_policy as real_resolver

    events: list[tuple] = []

    def resolve_before_resources(*args, **kwargs):
        policy = real_resolver(*args, **kwargs)
        events.append(("resolved", policy.task_mode))
        return policy

    class Quota:
        async def check_and_increment(self, user_id):
            events.append(("quota", user_id))
            return True, SimpleNamespace(to_dict=lambda: {})

        async def refund(self, user_id):
            events.append(("refund", user_id))

    class Limiter:
        async def acquire(self, provider, user_id):
            events.append(("acquire", provider, user_id))
            return True, "test-key"

        async def release(self, provider, user_id):
            events.append(("release", provider, user_id))

    def stream_boundary(**kwargs):
        policy = kwargs["run_policy"]
        events.append(("stream", policy.task_mode, policy.budgets.graph_steps))

        async def source():
            yield 'data: {"type":"done"}\n\n'

        return source()

    monkeypatch.setattr(controller, "resolve_run_policy", resolve_before_resources)
    monkeypatch.setattr(
        controller.LLMOptionsService,
        "resolve_selection",
        lambda provider, model: (provider, model or "resolved-model"),
    )
    monkeypatch.setattr(
        controller.ConversationService,
        "verify_conversation_owner",
        lambda *_args: (_ for _ in ()).throw(AssertionError("repository called for new chat")),
    )
    monkeypatch.setattr(
        controller.ConversationService,
        "create_streaming_generator",
        stream_boundary,
    )
    request = SimpleNamespace(
        app=SimpleNamespace(state=SimpleNamespace(user_quota=Quota(), llm_rate_limiter=Limiter()))
    )

    response = await controller._handle_agent_stream(
        request=request,
        user_id="user-1",
        conversation_id="00000000-0000-4000-8000-000000000001",
        provider="bedrock",
        model=None,
        stream_generator_kwargs={
            "prompt": "Analyze the database and produce a detailed report.",
            "db_config": {"db_type": "postgresql"},
            "task_mode": "normal",
        },
        require_existing_conversation=False,
    )
    assert [chunk async for chunk in response.body_iterator] == ['data: {"type":"done"}\n\n']
    assert events == [
        ("resolved", "long_task"),
        ("quota", "user-1"),
        ("acquire", "bedrock", "user-1"),
        ("stream", "long_task", 200),
        ("release", "bedrock", "user-1"),
    ]


def test_resolved_mode_and_budgets_match_stream_prompt_checkpoint_and_history(monkeypatch) -> None:
    """Catch any downstream consumer that recomputes mode or graph budget."""
    from langchain_core.messages import AIMessageChunk

    from langgraph_orchestration import stream_conversation as stream_module
    from langgraph_orchestration.react_graph import _build_session_state

    policy = _resolve(
        prompt="Analyze the database and produce a detailed report.",
        model="mock-model",
    )
    conversation = {"task_mode": "long_task", "messages": []}
    captured: dict[str, object] = {}

    from langgraph.checkpoint.memory import InMemorySaver

    class Checkpointer(InMemorySaver):
        pass

    async def no_op(*args, **kwargs):
        del args, kwargs

    async def no_checkpoint(*args, **kwargs):
        del args, kwargs
        return False

    async def load_history(*args, **kwargs):
        del args, kwargs
        return []

    async def load_context(*args, **kwargs):
        del args, kwargs
        return SimpleNamespace(conversation=conversation, historical_context=None)

    async def prepare_budget(**kwargs):
        captured["budget_policy"] = kwargs["run_policy"]
        return {
            "hot_history_budget": 8_000,
            "active_context_budget": 8_000,
            "tail_tokens": 0,
            "active_context_tokens": 0,
        }

    def build_agent(*args, **kwargs):
        del args
        captured["system_prompt"] = kwargs["system_prompt"]
        return object()

    async def stream_parts(*args, **kwargs):
        captured["checkpoint_config"] = args[2]
        del kwargs
        yield {"type": "messages", "data": (AIMessageChunk(content="ok"),)}

    monkeypatch.setattr(stream_module, "ALL_TOOLS", [])
    monkeypatch.setattr(stream_module, "get_checkpointer", lambda: Checkpointer())
    monkeypatch.setattr(stream_module, "load_initial_stream_context", load_context)
    monkeypatch.setattr(stream_module, "prepare_stream_budget", prepare_budget)
    monkeypatch.setattr(stream_module, "get_chat_model", lambda *args, **kwargs: object())
    monkeypatch.setattr(stream_module, "build_react_agent", build_agent)
    monkeypatch.setattr(stream_module, "_has_checkpoint", no_checkpoint)
    monkeypatch.setattr(stream_module, "_load_firestore_history", load_history)
    monkeypatch.setattr(stream_module, "_stream_graph_with_continuations", stream_parts)
    monkeypatch.setattr(stream_module, "check_and_perform_compaction", no_op)
    monkeypatch.setattr(
        stream_module,
        "get_default_conversation_summarizer",
        lambda: SimpleNamespace(
            get_background_summary_pressure=lambda *args, **kwargs: {
                "tail_tokens": 0,
                "pressure_budget": 8_000,
                "threshold_tokens": 7_200,
                "complete_turn_count": 0,
                "should_schedule": False,
            }
        ),
    )
    monkeypatch.setattr(
        stream_module,
        "_cached_conversation_reader",
        lambda: SimpleNamespace(get_conversation=lambda conversation_id: conversation),
    )

    async def collect() -> list[dict]:
        return [
            json.loads(line.removeprefix("data: "))
            async for line in stream_module.stream_conversation(
                "conversation-id",
                "Analyze the database and produce a detailed report.",
                "user-id",
                run_policy=policy,
            )
        ]

    stream_events = asyncio.run(collect())
    mode_event = next(event for event in stream_events if event.get("type") == "task_mode")
    checkpoint_config = captured["checkpoint_config"]
    configurable = checkpoint_config["configurable"]
    session_state = _build_session_state(configurable)

    assert mode_event == {
        "type": "task_mode",
        "task_mode": "long_task",
        "label": "Long Task",
        "recursion_limit": 200,
        "source": "automatic",
    }
    assert "active task mode: long_task" in captured["system_prompt"]
    assert "graph step budget: 200" in captured["system_prompt"]
    assert "task_mode: long_task (Long Task)" in session_state
    assert "task_mode_step_budget: 200 steps per turn" in session_state
    assert configurable["task_mode"] == conversation["task_mode"] == "long_task"
    assert configurable["task_mode_source"] == "automatic"
    assert configurable["graph_step_budget"] == 200
    assert captured["budget_policy"] is policy


def test_session_state_rejects_missing_resolved_graph_budget() -> None:
    """Catch late config fallback that can contradict the already selected mode."""
    from langgraph_orchestration.react_graph import _build_session_state

    with pytest.raises(
        ValueError,
        match="Resolved run policy graph_step_budget is required",
    ):
        _build_session_state({"task_mode": "long_task"})


@pytest.mark.asyncio
async def test_pre_command_mode_write_persists_only_the_resolved_policy(monkeypatch) -> None:
    """Catch the outer persistence path restoring or writing a raw requested mode."""
    from service.conversations import agent_streaming, conversation_streaming_service
    from service.conversations.conversation_repository import ConversationRepository
    from service.firestore.firestore_service import FirestoreService

    policy = _resolve(
        prompt="Analyze the database and produce a detailed report.",
        model="mock-model",
    )
    conversation = {
        "user_id": "user-1",
        "task_mode": "normal",
        "messages": [],
    }
    forwarded_policies = []

    async def immediate_thread_call(function, *args, **kwargs):
        return function(*args, **kwargs)

    def store_message(*args, **kwargs):
        del args, kwargs

    class Document:
        def update(self, fields):
            conversation.update(fields)

    class Collection:
        def document(self, conversation_id):
            assert conversation_id == "conversation-1"
            return Document()

    class Database:
        def collection(self, collection_name):
            assert collection_name == "conversations"
            return Collection()

    class Streamer:
        async def stream(self, *args, **kwargs):
            del args
            forwarded_policies.append(kwargs["run_policy"])
            yield 'data: {"type":"done"}\n\n'

    monkeypatch.setattr(conversation_streaming_service, "run_in_threadpool", immediate_thread_call)
    monkeypatch.setattr(ConversationRepository, "get", lambda conversation_id: conversation)
    monkeypatch.setattr(ConversationRepository, "store_message", store_message)
    monkeypatch.setattr(FirestoreService, "get_db", lambda: Database())
    monkeypatch.setattr(agent_streaming, "get_default_agent_streamer", lambda: Streamer())

    events = [
        event
        async for event in conversation_streaming_service.ConversationStreamingService.create_streaming_generator(
            "conversation-1",
            "Analyze the database and produce a detailed report.",
            "user-1",
            policy,
        )
    ]

    assert events == ['data: {"type":"done"}\n\n']
    assert conversation["task_mode"] == "long_task"
    assert forwarded_policies == [policy]
