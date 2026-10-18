"""Focused regressions for the conversation response stream terminal contract."""

from __future__ import annotations

import asyncio
import json
import logging

import pytest


def _resolve(**overrides):
    from service.conversations.run_context import resolve_run_policy

    inputs = {
        "prompt": "hello",
        "requested_mode": "normal",
        "persisted_resume_mode": None,
        "provider": "bedrock",
        "model": "mock-model",
        "db_connected": False,
    }
    inputs.update(overrides)
    return resolve_run_policy(**inputs)


def _sse_event_type(sse_line: str) -> str | None:
    line = sse_line.strip()
    if not line.startswith("data: "):
        return None
    payload = line[6:]
    if payload == "[DONE]":
        return "done"
    return json.loads(payload).get("type")


def _install_terminal_contract_dependencies(
    monkeypatch,
    streamer,
    lifecycle: list[str],
    *,
    fail_assistant_store: bool = False,
) -> None:
    from service.conversations import agent_streaming, conversation_streaming_service
    from service.conversations.conversation_repository import ConversationRepository
    from service.dashboard.usage_analytics import UsageAnalyticsService
    from service.firestore.firestore_service import FirestoreService

    async def immediate_thread_call(function, *args, **kwargs):
        return function(*args, **kwargs)

    def store_message(_conversation_id, sender, message, _user_id, **_kwargs):
        lifecycle.append(f"stored:{sender}:{message}")
        if sender == "ai" and fail_assistant_store:
            raise RuntimeError("simulated persistence failure")

    class Document:
        def update(self, _fields):
            return None

    class Collection:
        def document(self, _conversation_id):
            return Document()

    class Database:
        def collection(self, _collection_name):
            return Collection()

    monkeypatch.setattr(conversation_streaming_service, "run_in_threadpool", immediate_thread_call)
    monkeypatch.setattr(ConversationRepository, "get", staticmethod(lambda _conversation_id: None))
    monkeypatch.setattr(ConversationRepository, "store_message", staticmethod(store_message))
    monkeypatch.setattr(FirestoreService, "get_db", staticmethod(lambda: Database()))
    monkeypatch.setattr(agent_streaming, "get_default_agent_streamer", lambda: streamer)
    monkeypatch.setattr(UsageAnalyticsService, "record_ai_request", staticmethod(lambda *_args, **_kwargs: None))


@pytest.mark.asyncio
async def test_outer_stream_reports_failure_after_inner_done_before_its_terminal_frame(monkeypatch) -> None:
    """A late inner cleanup failure must not follow a terminal success frame."""
    from service.conversations.conversation_streaming_service import ConversationStreamingService

    lifecycle: list[str] = []

    class Streamer:
        async def stream(self, *_args, **_kwargs):
            yield 'data: {"type":"token","content":"partial answer"}\n\n'
            yield 'data: {"type":"done"}\n\n'
            raise RuntimeError("late cleanup failure")

    _install_terminal_contract_dependencies(monkeypatch, Streamer(), lifecycle)
    events = [
        event
        async for event in ConversationStreamingService.create_streaming_generator(
            "conversation-1",
            "hello",
            "user-1",
            _resolve(),
        )
    ]

    assert [_sse_event_type(event) for event in events] == ["token", "error", "done"]
    assert "stored:ai:partial answer" in lifecycle


@pytest.mark.asyncio
async def test_outer_stream_close_finishes_inner_cleanup_before_partial_persistence(monkeypatch) -> None:
    """Closing the client stream must release inner orchestration resources promptly."""
    from service.conversations.conversation_streaming_service import ConversationStreamingService

    lifecycle: list[str] = []

    class Streamer:
        async def stream(self, *_args, **_kwargs):
            try:
                yield 'data: {"type":"token","content":"partial answer"}\n\n'
            finally:
                lifecycle.append("inner:closed")

    _install_terminal_contract_dependencies(monkeypatch, Streamer(), lifecycle)
    stream = ConversationStreamingService.create_streaming_generator(
        "conversation-1",
        "hello",
        "user-1",
        _resolve(),
    )
    assert _sse_event_type(await anext(stream)) == "token"
    await stream.aclose()

    stored_response = "stored:ai:partial answer\n\n_(Response stopped by user)_"
    assert "inner:closed" in lifecycle
    assert lifecycle.index("inner:closed") < lifecycle.index(stored_response)


@pytest.mark.asyncio
async def test_outer_stream_exhausts_inner_stream_and_emits_exactly_one_done(monkeypatch) -> None:
    """Catch forwarding inner terminal frames or stopping consumption at the first one."""
    from service.conversations.conversation_streaming_service import ConversationStreamingService

    lifecycle: list[str] = []

    class Streamer:
        async def stream(self, *_args, **_kwargs):
            yield 'data: {"type":"token","content":"answer"}\n\n'
            yield 'data: {"type":"done"}\n\n'
            lifecycle.append("inner:continued-after-done")
            yield 'data: {"type":"usage_metrics","input_tokens":3}\n\n'
            yield "data: [DONE]\n\n"
            yield 'data:{"type":"done"}\n\n'
            yield "data:[DONE]\n\n"
            lifecycle.append("inner:exhausted")

    _install_terminal_contract_dependencies(monkeypatch, Streamer(), lifecycle)

    events = [
        event
        async for event in ConversationStreamingService.create_streaming_generator(
            "conversation-1",
            "hello",
            "user-1",
            _resolve(prompt="hello", model="mock-model", db_connected=False),
        )
    ]

    assert [_sse_event_type(event) for event in events] == ["token", "usage_metrics", "done"]
    assert lifecycle.index("inner:continued-after-done") < lifecycle.index("inner:exhausted")


@pytest.mark.asyncio
async def test_outer_stream_persists_assistant_before_terminal_done(monkeypatch) -> None:
    """Catch moving the terminal frame ahead of assistant persistence."""
    from service.conversations.conversation_streaming_service import ConversationStreamingService

    lifecycle: list[str] = []

    class Streamer:
        async def stream(self, *_args, **_kwargs):
            yield 'data: {"type":"token","content":"persisted answer"}\n\n'
            yield 'data: {"type":"done"}\n\n'
            lifecycle.append("inner:exhausted")

    _install_terminal_contract_dependencies(monkeypatch, Streamer(), lifecycle)

    async for event in ConversationStreamingService.create_streaming_generator(
        "conversation-1",
        "hello",
        "user-1",
        _resolve(prompt="hello", model="mock-model", db_connected=False),
    ):
        lifecycle.append(f"client:{_sse_event_type(event)}")

    assert lifecycle.index("inner:exhausted") < lifecycle.index("stored:ai:persisted answer")
    assert lifecycle.index("stored:ai:persisted answer") < lifecycle.index("client:done")


@pytest.mark.asyncio
async def test_outer_stream_records_privacy_safe_aggregate_usage_once(monkeypatch) -> None:
    from service.conversations.conversation_streaming_service import ConversationStreamingService
    from service.dashboard.usage_analytics import UsageAnalyticsService

    lifecycle: list[str] = []
    recorded: list[tuple[str, dict]] = []

    class Streamer:
        async def stream(self, *_args, **_kwargs):
            yield 'data: {"type":"usage_metrics","inputTokens":3,"outputTokens":2,"totalTokens":5}\n\n'
            yield 'data: {"type":"usage_metrics","activeContextTokens":100}\n\n'
            yield 'data: {"type":"usage_metrics","input_tokens":7,"output_tokens":1,"total_tokens":8}\n\n'
            yield 'data: {"type":"token","content":"answer"}\n\n'

    _install_terminal_contract_dependencies(monkeypatch, Streamer(), lifecycle)
    monkeypatch.setattr(
        UsageAnalyticsService,
        "record_ai_request",
        staticmethod(lambda user_id, **fields: recorded.append((user_id, fields))),
    )

    events = [
        event
        async for event in ConversationStreamingService.create_streaming_generator(
            "conversation-1",
            "hello",
            "user-1",
            _resolve(prompt="hello", model="mock-model", db_connected=False),
        )
    ]

    assert any(_sse_event_type(event) == "token" for event in events)
    assert len(recorded) == 1
    user_id, fields = recorded[0]
    assert user_id == "user-1"
    assert fields["provider"] == "bedrock"
    assert fields["model"] == "mock-model"
    assert fields["task_mode"] == "normal"
    assert fields["input_tokens"] == 10
    assert fields["output_tokens"] == 3
    assert fields["total_tokens"] == 13
    assert "prompt" not in fields


@pytest.mark.asyncio
async def test_outer_stream_reports_persistence_failure_before_terminal_done(monkeypatch) -> None:
    """Catch silently reporting successful completion after the assistant save fails."""
    from service.conversations.conversation_streaming_service import ConversationStreamingService

    lifecycle: list[str] = []

    class Streamer:
        async def stream(self, *_args, **_kwargs):
            yield 'data: {"type":"token","content":"unsaved answer"}\n\n'
            yield 'data: {"type":"done"}\n\n'

    _install_terminal_contract_dependencies(
        monkeypatch,
        Streamer(),
        lifecycle,
        fail_assistant_store=True,
    )

    events = [
        event
        async for event in ConversationStreamingService.create_streaming_generator(
            "conversation-1",
            "hello",
            "user-1",
            _resolve(prompt="hello", model="mock-model", db_connected=False),
        )
    ]

    decoded = [json.loads(event.strip()[6:]) for event in events]
    assert [event["type"] for event in decoded] == ["token", "error", "done"]
    assert decoded[-2]["message"] == "Conversation response could not be saved."


@pytest.mark.asyncio
async def test_pre_output_agent_failure_keeps_prompt_without_storing_empty_assistant(
    monkeypatch,
) -> None:
    """Catch treating a persisted prompt as renderable assistant output after agent startup fails."""
    from service.conversations.conversation_streaming_service import ConversationStreamingService

    lifecycle: list[str] = []

    class Streamer:
        async def stream(self, *_args, **_kwargs):
            if False:  # pragma: no cover - keeps this an async generator
                yield ""
            raise RuntimeError("simulated agent startup failure")

    _install_terminal_contract_dependencies(monkeypatch, Streamer(), lifecycle)

    events = [
        event
        async for event in ConversationStreamingService.create_streaming_generator(
            "conversation-1",
            "hello",
            "user-1",
            _resolve(prompt="hello", model="mock-model", db_connected=False),
        )
    ]

    assert [_sse_event_type(event) for event in events] == ["error", "done"]
    assert "stored:user:hello" in lifecycle
    assert not any(item.startswith("stored:ai:") for item in lifecycle)


@pytest.mark.asyncio
async def test_done_only_inner_stream_reports_error_without_storing_empty_assistant(
    monkeypatch,
) -> None:
    """Catch treating normal exhaustion without renderable output as a successful response."""
    from service.conversations.conversation_streaming_service import ConversationStreamingService

    lifecycle: list[str] = []

    class Streamer:
        async def stream(self, *_args, **_kwargs):
            yield 'data: {"type":"done"}\n\n'

    _install_terminal_contract_dependencies(monkeypatch, Streamer(), lifecycle)

    events = [
        event
        async for event in ConversationStreamingService.create_streaming_generator(
            "conversation-1",
            "hello",
            "user-1",
            _resolve(prompt="hello", model="mock-model", db_connected=False),
        )
    ]

    decoded = [json.loads(event.strip()[6:]) for event in events]
    assert [event["type"] for event in decoded] == ["error", "done"]
    assert decoded[0]["message"] == "AI service returned no response. Please try again."
    assert "stored:user:hello" in lifecycle
    assert not any(item.startswith("stored:ai:") for item in lifecycle)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "event",
    [
        {"type": "workflow_status", "stage": "context", "content": "Preparing context..."},
        {"type": "skills_activated", "skills": ["database"]},
        {"type": "thinking_token", "content": "Considering the question"},
        {"type": "token", "content": " \n\t"},
    ],
    ids=["status", "skills", "thinking", "whitespace"],
)
@pytest.mark.parametrize("fail_after_event", [False, True], ids=["completion", "failure"])
async def test_non_answer_events_do_not_create_empty_assistant(monkeypatch, event, fail_after_event) -> None:
    """Status, reasoning and whitespace must not disguise a missing response."""
    from service.conversations.conversation_streaming_service import ConversationStreamingService

    lifecycle: list[str] = []

    class Streamer:
        async def stream(self, *_args, **_kwargs):
            yield f"data: {json.dumps(event)}\n\n"
            if fail_after_event:
                raise RuntimeError("agent failed after preparation")
            yield 'data: {"type":"done"}\n\n'

    _install_terminal_contract_dependencies(monkeypatch, Streamer(), lifecycle)
    events = [
        json.loads(frame[6:])
        async for frame in ConversationStreamingService.create_streaming_generator(
            "conversation-1",
            "hello",
            "user-1",
            _resolve(),
        )
    ]

    assert [item["type"] for item in events] == [event["type"], "error", "done"]
    assert "stored:user:hello" in lifecycle
    assert not any(item.startswith("stored:ai:") for item in lifecycle)


@pytest.mark.asyncio
async def test_aborted_reasoning_is_saved_as_partial_output(monkeypatch) -> None:
    """An aborted run retains its reasoning timeline and a visible interruption marker."""
    from service.conversations.conversation_repository import ConversationRepository
    from service.conversations.conversation_streaming_service import ConversationStreamingService

    lifecycle: list[str] = []
    saved_messages: list[dict] = []

    class Streamer:
        async def stream(self, *_args, **_kwargs):
            yield 'data: {"type":"thinking_token","content":"Considering the question"}\n\n'

    _install_terminal_contract_dependencies(monkeypatch, Streamer(), lifecycle)

    def store_message(_conversation_id, sender, content, _user_id, **fields):
        saved_messages.append({"sender": sender, "content": content, **fields})

    monkeypatch.setattr(ConversationRepository, "store_message", staticmethod(store_message))
    stream = ConversationStreamingService.create_streaming_generator(
        "conversation-1",
        "hello",
        "user-1",
        _resolve(),
    )
    assert _sse_event_type(await anext(stream)) == "thinking_token"
    await stream.aclose()

    assert saved_messages[-1]["sender"] == "ai"
    assert saved_messages[-1]["content"] == "_(Response stopped by user)_"
    assert saved_messages[-1]["is_final_assistant_response"] is False
    assert saved_messages[-1]["timeline"][0] == {
        "type": "thinking",
        "content": "Considering the question",
        "is_complete": True,
    }


@pytest.mark.asyncio
async def test_tool_only_response_remains_persistable(monkeypatch) -> None:
    """Tool execution is meaningful output even without a final prose answer."""
    from service.conversations.conversation_streaming_service import ConversationStreamingService

    lifecycle: list[str] = []

    class Streamer:
        async def stream(self, *_args, **_kwargs):
            yield 'data: {"type":"tool_start","name":"list_tables","args":{}}\n\n'
            yield 'data: {"type":"tool_end","name":"list_tables","result":{"tables":[]}}\n\n'

    _install_terminal_contract_dependencies(monkeypatch, Streamer(), lifecycle)
    events = [
        event
        async for event in ConversationStreamingService.create_streaming_generator(
            "conversation-1",
            "hello",
            "user-1",
            _resolve(),
        )
    ]

    assert [_sse_event_type(event) for event in events] == ["tool_start", "tool_end", "done"]
    assert "stored:ai:(Used tools to gather information)" in lifecycle


@pytest.mark.asyncio
@pytest.mark.parametrize("include_status", [False, True], ids=["pure", "after_status"])
@pytest.mark.parametrize("control_type", ["agent_interrupt", "agent_step_limit_reached"])
async def test_pure_control_outcome_is_not_misclassified_as_empty_response(
    monkeypatch,
    control_type,
    include_status,
) -> None:
    """Catch valid waiting/paused outcomes gaining a false empty-response error."""
    from service.conversations.conversation_streaming_service import ConversationStreamingService
    from service.dashboard.usage_analytics import UsageAnalyticsService

    lifecycle: list[str] = []
    recorded: list[str] = []

    class Streamer:
        async def stream(self, *_args, **_kwargs):
            if include_status:
                yield 'data: {"type":"workflow_status","content":"Preparing context..."}\n\n'
            yield f'data: {{"type":"{control_type}"}}\n\n'
            yield 'data: {"type":"done"}\n\n'

    _install_terminal_contract_dependencies(monkeypatch, Streamer(), lifecycle)
    monkeypatch.setattr(
        UsageAnalyticsService,
        "record_ai_request",
        staticmethod(lambda user_id, **_fields: recorded.append(user_id)),
    )

    events = [
        event
        async for event in ConversationStreamingService.create_streaming_generator(
            "conversation-1",
            "hello",
            "user-1",
            _resolve(prompt="hello", model="mock-model", db_connected=False),
        )
    ]

    expected_types = ["workflow_status", control_type, "done"] if include_status else [control_type, "done"]
    assert [_sse_event_type(event) for event in events] == expected_types
    assert not any(item.startswith("stored:ai:") for item in lifecycle)
    assert recorded == ["user-1"]


@pytest.mark.asyncio
async def test_conversation_stream_cancellation_is_warned_and_emits_no_done(
    monkeypatch,
    caplog,
) -> None:
    """Catch client cancellation becoming invisible at the outer persistence boundary."""
    from service.conversations import conversation_streaming_service
    from service.conversations.conversation_streaming_service import ConversationStreamingService

    lifecycle: list[str] = []
    events: list[str] = []

    class Streamer:
        async def stream(self, *_args, **_kwargs):
            if False:  # pragma: no cover - keeps this an async generator
                yield ""
            raise asyncio.CancelledError

    _install_terminal_contract_dependencies(monkeypatch, Streamer(), lifecycle)

    with caplog.at_level(logging.WARNING, logger=conversation_streaming_service.logger.name):
        with pytest.raises(asyncio.CancelledError):
            async for event in ConversationStreamingService.create_streaming_generator(
                "conversation-1",
                "hello",
                "user-1",
                _resolve(prompt="hello", model="mock-model", db_connected=False),
            ):
                events.append(event)

    assert not any(_sse_event_type(event) == "done" for event in events)
    assert any(
        record.levelno == logging.WARNING
        and "conversation-1" in record.getMessage()
        and "reason=cancelled" in record.getMessage()
        for record in caplog.records
    )


@pytest.mark.asyncio
async def test_conversation_stream_generator_close_is_warned_and_emits_no_done(
    monkeypatch,
    caplog,
) -> None:
    """Catch generator shutdown becoming invisible or leaking a terminal success frame."""
    from service.conversations import conversation_streaming_service
    from service.conversations.conversation_streaming_service import ConversationStreamingService

    lifecycle: list[str] = []

    class Streamer:
        async def stream(self, *_args, **_kwargs):
            yield 'data: {"type":"token","content":"partial"}\n\n'

    _install_terminal_contract_dependencies(monkeypatch, Streamer(), lifecycle)
    stream = ConversationStreamingService.create_streaming_generator(
        "conversation-1",
        "hello",
        "user-1",
        _resolve(prompt="hello", model="mock-model", db_connected=False),
    )

    with caplog.at_level(logging.WARNING, logger=conversation_streaming_service.logger.name):
        first_event = await anext(stream)
        await stream.aclose()

    assert _sse_event_type(first_event) == "token"
    assert any(
        record.levelno == logging.WARNING
        and "conversation-1" in record.getMessage()
        and "reason=generator_exit" in record.getMessage()
        for record in caplog.records
    )


@pytest.mark.asyncio
async def test_heartbeat_wrapper_warns_only_exception_type_for_source_failure(caplog) -> None:
    """Catch source-task failures closing SSE silently or leaking raw exception text."""
    from controller import conversations_controller

    raw_secret = "sensitive-source-detail"

    async def source():
        if False:  # pragma: no cover - keeps this an async generator
            yield ""
        raise RuntimeError(raw_secret)

    with caplog.at_level(logging.WARNING, logger=conversations_controller.logger.name):
        with pytest.raises(RuntimeError, match=raw_secret):
            async for _event in conversations_controller._stream_with_heartbeats(
                source(),
                interval_seconds=0.01,
            ):
                pass

    matching = [record for record in caplog.records if "exception_type=RuntimeError" in record.getMessage()]
    assert matching
    assert all(raw_secret not in record.getMessage() for record in matching)


@pytest.mark.asyncio
async def test_langgraph_stream_cancellation_logs_warning_with_machine_reason(
    monkeypatch,
    caplog,
) -> None:
    """Catch orchestration cancellation being hidden at warning-level operation."""
    from langgraph.checkpoint.memory import InMemorySaver

    from langgraph_orchestration import stream_conversation as stream_module

    monkeypatch.setattr(stream_module, "get_checkpointer", lambda: InMemorySaver())
    monkeypatch.setattr(
        stream_module.PromptBuilder,
        "build_system_prompt",
        staticmethod(lambda *_args, **_kwargs: (_ for _ in ()).throw(asyncio.CancelledError)),
    )

    with caplog.at_level(logging.WARNING, logger=stream_module.logger.name):
        with pytest.raises(asyncio.CancelledError):
            async for _event in stream_module.stream_conversation(
                "conversation-1",
                "hello",
                "user-1",
                run_policy=_resolve(prompt="hello", model="mock-model", db_connected=False),
            ):
                pass

    assert any(
        record.levelno == logging.WARNING
        and "conversation-1" in record.getMessage()
        and "reason=cancelled" in record.getMessage()
        for record in caplog.records
    )
