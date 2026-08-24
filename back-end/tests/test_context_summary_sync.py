"""Regression tests for context-summary state and SSE synchronization."""

from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

from langchain_core.messages import AIMessageChunk

from langgraph_orchestration import stream_conversation as stream_module
from langgraph_orchestration.context_usage import (
    build_summary_completed_events,
    build_usage_metrics,
    get_pre_call_summary_pressure,
)
from service.conversations import conversation_compaction_service
from service.conversations.conversation_compaction_service import (
    _complete_empty_tail_result,
    _get_background_summary_pressure,
)
from vamp_memory import vamp_memory_service


class _TailPressureSummarizer:
    """Calculate pressure from the active tail supplied by the stream."""

    def __init__(self) -> None:
        self.last_new_messages = None

    def get_background_summary_pressure(
        self,
        conversation,
        *,
        new_messages=None,
        pressure_budget_tokens=None,
        model_id=None,
    ):
        del model_id
        self.last_new_messages = new_messages
        messages = list((conversation or {}).get("messages", []) or [])
        messages.extend(new_messages or [])
        start_idx = int((conversation or {}).get("last_summarized_idx", 0) or 0)
        tail = messages[start_idx:]
        tail_tokens = sum(len(message.get("content", "")) for message in tail)
        threshold = int((pressure_budget_tokens or 0) * 0.9)
        complete_turn_count = int(
            any(message.get("sender") == "user" for message in tail)
            and any(message.get("sender") == "ai" for message in tail)
        )
        return {
            "should_schedule": complete_turn_count > 0 and tail_tokens >= threshold,
            "tail_tokens": tail_tokens,
            "pressure_budget": pressure_budget_tokens,
            "threshold_tokens": threshold,
            "complete_turn_count": complete_turn_count,
        }


def test_active_percent_uses_unsummarized_tail_not_full_model_payload() -> None:
    """Keep a compacted active tail low even when fixed prompt sections remain large."""
    event = build_usage_metrics(
        {
            "active_context_tokens": 100,
            "input_payload_tokens": 14_000,
            "active_context_budget": 8_000,
            "pressure_trigger_tokens": 12_000,
            "model_context_window": 32_000,
        }
    )

    assert event["activeContextTokens"] == 100
    assert event["inputPayloadTokens"] == 14_000
    assert event["activePercent"] == 1
    assert event["modelPercent"] == 44


def test_pre_call_pressure_uses_current_unsummarized_tail_not_previous_full_payload() -> None:
    """A high prior model payload must not retrigger summary for a tiny new tail."""
    summarizer = _TailPressureSummarizer()
    pressure = get_pre_call_summary_pressure(
        summarizer,
        conversation={
            "last_summarized_idx": 2,
            "messages": [{}, {}, {"sender": "user", "content": "next"}],
        },
        budget_info={
            "hot_history_budget": 8_000,
            "input_payload_tokens": 14_000,
        },
        model_id="mock-model",
    )

    assert pressure["tail_tokens"] == 4
    assert pressure["should_schedule"] is False
    assert summarizer.last_new_messages == []


def test_summary_trigger_and_indicator_share_the_same_active_tail_threshold(monkeypatch) -> None:
    """Report 90% at the exact tail pressure where summary scheduling begins."""
    monkeypatch.setattr(
        conversation_compaction_service,
        "_get_message_tokens_cheap",
        lambda message, *, model_id: message["test_tokens"],
    )
    pressure = _get_background_summary_pressure(
        {
            "last_summarized_idx": 0,
            "messages": [
                {"sender": "user", "content": "question", "test_tokens": 3_600},
                {"sender": "ai", "content": "answer", "test_tokens": 3_600},
            ],
        },
        pressure_budget_tokens=8_000,
        model_id="mock-model",
    )
    event = build_usage_metrics(
        {
            "active_context_tokens": pressure["tail_tokens"],
            "active_context_budget": pressure["pressure_budget"],
            "model_context_window": 32_000,
        }
    )

    assert pressure["should_schedule"] is True
    assert event["activePercent"] == 90


def test_skipped_compaction_emits_no_summary_workflow_event() -> None:
    """Do not show summarization UI when the compaction service created nothing."""
    events = build_summary_completed_events(
        {
            "active_context_tokens": 120,
            "input_payload_tokens": 14_000,
            "active_context_budget": 8_000,
            "model_context_window": 32_000,
        },
        summary_result={"created": False, "reason": "below_threshold"},
        summary_pressure={"tail_tokens": 120},
    )

    assert events == []


def test_completed_compaction_emits_one_status_and_resets_active_usage() -> None:
    """Publish a reset metric only alongside a summary that was actually committed."""
    events = build_summary_completed_events(
        {
            "active_context_tokens": 7_600,
            "input_payload_tokens": 14_000,
            "active_context_budget": 8_000,
            "model_context_window": 32_000,
        },
        summary_result={"created": True, "reason": "complete"},
        summary_pressure={
            "tail_tokens": 0,
            "threshold_tokens": 7_200,
            "complete_turn_count": 0,
        },
    )

    assert [event["type"] for event in events] == ["workflow_status", "usage_metrics"]
    assert events[0] == {
        "type": "workflow_status",
        "stage": "summarizing_context",
        "status": "done",
        "content": "Conversation context summarized.",
    }
    assert events[1]["activeContextTokens"] == 0
    assert events[1]["activePercent"] == 0
    assert events[1]["inputPayloadTokens"] is None
    assert events[1]["modelPercent"] is None
    assert events[1]["contextPhase"] == "post_summary"


def test_later_model_usage_does_not_restore_the_pre_summary_active_peak() -> None:
    """Keep active usage reset when the provider later reports the full model payload."""
    budget_info = {
        "active_context_tokens": 7_600,
        "input_payload_tokens": 14_000,
        "active_context_budget": 8_000,
        "model_context_window": 32_000,
    }
    build_summary_completed_events(
        budget_info,
        summary_result={"created": True},
        summary_pressure={"tail_tokens": 0},
    )

    budget_info["input_payload_tokens"] = 14_000
    later_event = build_usage_metrics(budget_info)

    assert later_event["activePercent"] == 0
    assert later_event["modelPercent"] == 44
    assert later_event["contextPhase"] == "post_summary"


def test_completed_compaction_result_reports_the_remaining_empty_tail() -> None:
    """Do not return the pre-compaction token count after consuming the whole tail."""
    result = {
        "created": True,
        "reason": "created",
        "tail_tokens": 7_600,
    }

    completed = _complete_empty_tail_result(result, summarization_committed=True)

    assert completed["created"] is True
    assert completed["reason"] == "complete"
    assert completed["tail_tokens"] == 0


def test_stream_emits_one_summary_event_and_keeps_following_turn_in_sync(monkeypatch) -> None:
    """Exercise two real stream lifecycles around one durable compaction."""
    conversation = {
        "last_summarized_idx": 0,
        "messages": [
            {"sender": "user", "content": "old question", "test_tokens": 3_600},
            {
                "sender": "ai",
                "content": "old answer",
                "test_tokens": 3_600,
                "is_final_assistant_response": True,
            },
            {"sender": "user", "content": "current", "test_tokens": 100},
        ],
    }

    class _Summarizer:
        def __init__(self) -> None:
            self.compaction_calls = 0

        def get_background_summary_pressure(
            self,
            conv_data,
            *,
            new_messages=None,
            assistant_message=None,
            pressure_budget_tokens=None,
            model_id=None,
        ):
            del assistant_message, model_id
            messages = list((conv_data or {}).get("messages", []) or [])
            messages.extend(new_messages or [])
            start_idx = int((conv_data or {}).get("last_summarized_idx", 0) or 0)
            tail = messages[start_idx:]
            tail_tokens = sum(message.get("test_tokens", 0) for message in tail)
            complete_turns = int(
                any(message.get("sender") == "ai" for message in tail)
                and any(message.get("sender") == "user" for message in tail)
            )
            pressure_budget = int(pressure_budget_tokens or 8_000)
            threshold = int(pressure_budget * 0.9)
            return {
                "should_schedule": complete_turns > 0 and tail_tokens >= threshold,
                "tail_tokens": tail_tokens,
                "pressure_budget": pressure_budget,
                "threshold_tokens": threshold,
                "complete_turn_count": complete_turns,
            }

        async def check_and_summarize(self, *args, **kwargs):
            del args, kwargs
            self.compaction_calls += 1
            conversation["last_summarized_idx"] = 2
            return {"created": True, "reason": "complete", "end_idx": 2, "tail_tokens": 100}

    from langgraph.checkpoint.memory import InMemorySaver

    class _Checkpointer(InMemorySaver):
        pass

    class _VampService:
        async def retrieve_context(self, *args, **kwargs):
            del args, kwargs
            return None

    summarizer = _Summarizer()

    async def _load_context(*args, **kwargs):
        del args, kwargs
        return SimpleNamespace(conversation=conversation, historical_context=None)

    async def _prepare_budget(**kwargs):
        pressure = summarizer.get_background_summary_pressure(
            kwargs["conversation"],
            pressure_budget_tokens=8_000,
            model_id="mock-model",
        )
        return {
            "hot_history_budget": 8_000,
            "active_context_budget": 8_000,
            "pressure_trigger_tokens": 8_000,
            "model_context_window": 32_000,
            "tail_tokens": pressure["tail_tokens"],
            "active_context_tokens": pressure["tail_tokens"],
            "input_payload_tokens": None,
        }

    async def _no_checkpoint(*args, **kwargs):
        del args, kwargs
        return False

    async def _no_op(*args, **kwargs):
        del args, kwargs

    async def _load_history(*args, **kwargs):
        del args, kwargs
        return []

    async def _stream_parts(*args, **kwargs):
        del args, kwargs
        yield {
            "type": "messages",
            "data": (
                AIMessageChunk(
                    content="ok",
                    usage_metadata={
                        "input_tokens": 1_200,
                        "output_tokens": 2,
                        "total_tokens": 1_202,
                    },
                ),
            ),
        }

    monkeypatch.setattr(stream_module, "ALL_TOOLS", [])
    monkeypatch.setattr(stream_module, "get_checkpointer", lambda: _Checkpointer())
    monkeypatch.setattr(stream_module, "load_initial_stream_context", _load_context)
    monkeypatch.setattr(stream_module, "prepare_stream_budget", _prepare_budget)
    monkeypatch.setattr(stream_module, "get_default_conversation_summarizer", lambda: summarizer)
    monkeypatch.setattr(
        stream_module,
        "_cached_conversation_reader",
        lambda: SimpleNamespace(get_conversation=lambda conversation_id: conversation),
    )
    monkeypatch.setattr(stream_module.PromptBuilder, "build_system_prompt", lambda *args, **kwargs: "system")
    monkeypatch.setattr(stream_module, "output_reserve_for_task_mode", lambda task_mode: 256)
    monkeypatch.setattr(stream_module, "get_chat_model", lambda *args, **kwargs: object())
    monkeypatch.setattr(stream_module, "build_react_agent", lambda *args, **kwargs: object())
    monkeypatch.setattr(stream_module, "_has_checkpoint", _no_checkpoint)
    monkeypatch.setattr(stream_module, "_load_firestore_history", _load_history)
    monkeypatch.setattr(stream_module, "_stream_graph_with_continuations", _stream_parts)
    monkeypatch.setattr(stream_module, "check_and_perform_compaction", _no_op)
    monkeypatch.setattr(vamp_memory_service, "get_vamp_memory_service", lambda: _VampService())

    async def _collect(prompt: str) -> list[dict]:
        from service.conversations.run_context import resolve_run_policy

        run_policy = resolve_run_policy(
            prompt,
            "tool_task",
            None,
            "bedrock",
            "mock-model",
            False,
        )
        lines = [
            line
            async for line in stream_module.stream_conversation(
                "conversation-id",
                prompt,
                "user-id",
                run_policy=run_policy,
            )
        ]
        return [json.loads(line.removeprefix("data: ")) for line in lines]

    first_events = asyncio.run(_collect("current"))
    conversation["messages"].extend(
        [
            {
                "sender": "ai",
                "content": "current answer",
                "test_tokens": 100,
                "is_final_assistant_response": True,
            },
            {"sender": "user", "content": "next", "test_tokens": 100},
        ]
    )
    second_events = asyncio.run(_collect("next"))

    first_summary_indices = [
        index
        for index, event in enumerate(first_events)
        if event.get("type") == "workflow_status" and event.get("stage") == "summarizing_context"
    ]
    assert len(first_summary_indices) == 1
    summary_index = first_summary_indices[0]
    assert first_events[summary_index]["content"] == "Conversation context summarized."
    assert first_events[summary_index + 1]["type"] == "usage_metrics"
    assert first_events[summary_index + 1]["activeContextTokens"] == 100
    assert first_events[summary_index + 1]["activePercent"] == 1

    assert not any(
        event.get("type") == "workflow_status" and event.get("stage") == "summarizing_context"
        for event in second_events
    )
    final_first_usage = [event for event in first_events if event.get("type") == "usage_metrics"][-1]
    assert final_first_usage["contextPhase"] == "post_summary"
    assert final_first_usage["activeContextTokens"] == 100
    assert final_first_usage["modelPercent"] == 4
    final_second_usage = [event for event in second_events if event.get("type") == "usage_metrics"][-1]
    assert final_second_usage["contextPhase"] is None
    assert final_second_usage["activeContextTokens"] == 300
    assert final_second_usage["activePercent"] == 4
    assert summarizer.compaction_calls == 1
