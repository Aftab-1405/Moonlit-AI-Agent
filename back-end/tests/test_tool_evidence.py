"""Bounded, source-scoped tool evidence survives ordinary follow-up turns."""

import json
from copy import deepcopy

import pytest
from langchain_core.messages import HumanMessage

from langgraph_orchestration.react_graph import prepare_model_messages
from langgraph_orchestration.tool_evidence import (
    MAX_EVIDENCE_BYTES,
    build_evidence,
    evidence_scope,
    history_evidence,
    hydrate_tool_cache,
)

TABLES = ["categories", "customers", "employees", "order_items", "orders", "products", "regions"]
CFG = {
    "user_id": "owner",
    "conversation_id": "chat",
    "db_config": {
        "db_type": "postgresql",
        "host": "db.example",
        "database": "sales",
        "schema": "public",
        "_context_generation": "connection-1",
    },
}


def schema():
    return {
        "success": True,
        "error": None,
        "database": "sales",
        "table_count": 7,
        "tables": TABLES,
        "columns": {},
        "foreign_keys": [],
    }


def entry(name="get_schema_overview", result=None, args=None, now=100):
    result = schema() if result is None else result
    return {
        "type": "tool",
        "name": name,
        "status": "done",
        "args": json.dumps(args or {"target_tables": []}),
        "result": json.dumps(result),
        "model_evidence": build_evidence(name, args or {"target_tables": []}, result, CFG, observed_at=now),
    }


def test_schema_facts_are_preserved_for_followup_and_legacy_timelines():
    tool = entry()
    text = history_evidence({"timeline": [tool]}, CFG, max_bytes=16000)
    assert all(name in text for name in TABLES)
    assert "source_matches_current" in text
    del tool["model_evidence"]
    assert all(name in history_evidence({"timeline": [tool]}, CFG, max_bytes=16000) for name in TABLES)


def test_small_aggregate_keeps_the_actual_value_without_full_rows():
    result = {
        "success": True,
        "execution_id": "saved-1",
        "columns": ["total"],
        "data": [{"total": "9007199254740993"}],
        "preview": [{"total": "9007199254740993"}],
        "row_count": 1,
        "truncated": False,
    }
    evidence = build_evidence(
        "execute_query", {"query": "select count(*) as total from customers"}, result, CFG, observed_at=100
    )
    assert evidence["result"]["preview"] == [{"total": "9007199254740993"}]
    assert "data" not in evidence["result"]
    assert evidence["evidence_complete"] is True
    assert evidence["result"]["execution_id"] == "saved-1"


def test_large_wide_query_bounds_bytes_and_marks_loss_without_mutating_ui_result():
    result = {
        "success": True,
        "execution_id": "saved-big",
        "columns": [f"c{i}" for i in range(100)],
        "preview": [{f"c{i}": "🤖" * 10000 for i in range(100)} for _ in range(20)],
        "row_count": 5000,
        "truncated": True,
    }
    original = deepcopy(result)
    evidence = build_evidence("execute_query", {"query": "select * from huge"}, result, CFG, observed_at=100)
    assert len(json.dumps(evidence, ensure_ascii=False).encode()) <= MAX_EVIDENCE_BYTES
    assert evidence["evidence_complete"] is False
    assert evidence["result"]["execution_id"] == "saved-big"
    assert evidence["result"]["truncated"] is True
    assert result == original


def test_other_large_tools_and_whole_history_have_explicit_budgets():
    evidence = build_evidence(
        "web_search",
        {"query": "docs"},
        {"success": True, "results": [{"content": "x" * 100000, "url": "https://example.com"}] * 200},
        CFG,
        observed_at=100,
    )
    assert len(json.dumps(evidence, ensure_ascii=False).encode()) <= MAX_EVIDENCE_BYTES
    assert evidence["evidence_complete"] is False
    text = history_evidence({"timeline": [entry() for _ in range(100)]}, CFG, max_bytes=2000)
    assert len(text.encode()) <= 2000


def test_metadata_cache_is_scoped_expiring_and_never_caches_live_query_or_counts():
    conversation = {"messages": [{"timeline": [entry()]}]}
    cache, timestamps = hydrate_tool_cache(conversation, CFG, now=110)
    assert (
        json.loads(
            next(iter(cache.values()))
            if isinstance(next(iter(cache.values())), str)
            else json.dumps(next(iter(cache.values())))
        )["tables"]
        == TABLES
    )
    assert list(timestamps.values()) == [100]
    assert hydrate_tool_cache(conversation, CFG, now=1000)[0] == {}
    for field, value in [("user_id", "other"), ("conversation_id", "other")]:
        assert hydrate_tool_cache(conversation, {**CFG, field: value}, now=110)[0] == {}
    for field, value in [("database", "other"), ("schema", "other"), ("_context_generation", "new")]:
        other = {**CFG, "db_config": {**CFG["db_config"], field: value}}
        assert evidence_scope(other) != evidence_scope(CFG)
        assert hydrate_tool_cache(conversation, other, now=110)[0] == {}
    for name in ["execute_query", "get_table_row_counts", "get_connection_status"]:
        assert hydrate_tool_cache({"messages": [{"timeline": [entry(name=name)]}]}, CFG, now=110)[0] == {}


def test_activated_database_skill_is_really_present_in_the_model_context():
    messages = prepare_model_messages(
        system_prompt="rules",
        messages=[HumanMessage(content="Name of them?")],
        active_context_budget=10000,
        configurable={**CFG, "activated_skills": ["database-querying"], "graph_step_budget": 20},
    )
    prompt = "\n".join(str(m.content) for m in messages)
    assert '<loaded_skill name="database-querying">' in prompt
    assert "Reuse exact active-context evidence" in prompt


@pytest.mark.asyncio
async def test_followup_receives_prior_table_names_and_current_prompt_exactly_once(monkeypatch):
    import importlib
    from types import SimpleNamespace

    from langchain_core.messages import merge_message_runs

    from langgraph_orchestration.react_graph import format_current_user_request

    stream = importlib.import_module("langgraph_orchestration.stream_conversation")
    conversation = {
        "messages": [
            {"sender": "user", "content": "How many tables it has?"},
            {"sender": "ai", "content": "The database contains 7 tables.", "timeline": [entry()]},
            {"sender": "user", "content": "Name of them?"},
        ]
    }

    async def inline(fn, *args, **kwargs):
        return fn(*args, **kwargs)

    monkeypatch.setattr(stream, "run_in_threadpool", inline)
    monkeypatch.setattr(
        stream, "_cached_conversation_reader", lambda: SimpleNamespace(get_conversation=lambda cid: conversation)
    )
    history = await stream._load_firestore_history("chat", "Name of them?", 10000, "mock-model", configurable=CFG)
    outgoing = merge_message_runs(history + [HumanMessage(content=format_current_user_request("Name of them?"))])
    text = "\n".join(m.content for m in outgoing)
    assert text.count("Name of them?") == 1
    assert all(name in text for name in TABLES)
    # Repeating identical text intentionally remains two distinct user turns.
    conversation["messages"] = [
        {"sender": "user", "content": "Again"},
        {"sender": "ai", "content": "Earlier answer"},
        {"sender": "user", "content": "Again"},
    ]
    history = await stream._load_firestore_history("chat", "Again", 10000, "mock-model")
    assert "\n".join(m.content for m in history).count("Again") == 1
    assert conversation["messages"][-1]["content"] == "Again"


@pytest.mark.asyncio
async def test_restored_schema_cache_avoids_database_call_but_refresh_forces_it(monkeypatch):
    import langgraph_orchestration.tools as tools

    events, executions = [], []
    cfg = {
        **CFG,
        "activated_skills": ["database-querying"],
        "tool_cache": hydrate_tool_cache({"messages": [{"timeline": [entry(now=100)]}]}, CFG, now=110)[0],
    }
    cfg["tool_cache_observed_at"] = {key: 100 for key in cfg["tool_cache"]}
    monkeypatch.setattr(tools, "_try_writer", lambda: events.append)
    monkeypatch.setattr(tools.DBTools, "_get_schema_overview", lambda *args, **kwargs: executions.append(1) or schema())
    result = await tools.get_schema_overview.coroutine(target_tables=[], config={"configurable": cfg})
    assert all(name in result for name in TABLES)
    assert executions == []
    assert events[-1]["model_evidence"]["observed_at"] == 100
    await tools.get_schema_overview.coroutine(target_tables=[], refresh=True, config={"configurable": cfg})
    assert executions == [1]
    assert events[-1]["model_evidence"]["arguments"]["refresh"] is True


def test_refresh_invalidates_older_other_metadata_and_partial_evidence_is_not_cached():
    old = entry(name="get_table_details", args={"table_name": "orders"}, now=100)
    refreshed = entry(args={"target_tables": [], "refresh": True}, now=110)
    cache, _ = hydrate_tool_cache({"messages": [{"timeline": [old, refreshed]}]}, CFG, now=120)
    assert len(cache) == 1
    assert next(iter(cache)).startswith("get_schema_overview:")
    refreshed["model_evidence"]["evidence_complete"] = False
    assert hydrate_tool_cache({"messages": [{"timeline": [old, refreshed]}]}, CFG, now=120)[0] == {}


def test_escaped_history_evidence_stays_within_the_prompt_budget():
    from html import escape

    query = entry(
        name="execute_query",
        result={
            "success": True,
            "execution_id": "saved",
            "preview": [{"value": "&" * 256} for _ in range(20)],
            "row_count": 20,
        },
    )
    text = history_evidence({"timeline": [query]}, CFG, max_bytes=6144)
    assert "saved" in text
    assert len(escape(text).encode()) <= 6144


def test_distinct_long_column_aliases_keep_their_values_and_completeness():
    first, second = "x" * 128 + "a", "x" * 128 + "b"
    evidence = build_evidence(
        "execute_query", {}, {"success": True, "row_count": 1, "preview": [{first: 1, second: 2}]}, CFG
    )
    assert evidence["result"]["preview"][0] == {first: 1, second: 2}
    assert evidence["evidence_complete"] is True


def test_summary_and_history_token_counts_preserve_evidence_without_counting_full_rows():
    from llm_provider.token_budget import get_message_tokens
    from service.conversations.conversation_compaction_service import _build_summary_input, _message_countable_text

    result = {
        "success": True,
        "execution_id": "saved",
        "columns": ["total"],
        "preview": [{"total": 48217}],
        "row_count": 1,
    }
    tool = entry(name="execute_query", result=result, args={"query": "select count(*) as total from customers"})
    message = {"sender": "ai", "content": "Found the count.", "usage": {"outputTokens": 1}, "timeline": [tool]}
    summary = _build_summary_input([message])
    assert "48217" in summary and "saved" in summary
    assert "48217" in _message_countable_text(message)
    assert get_message_tokens(message, model_id="mock-model") > 1


def test_evidence_generation_does_not_change_database_pool_identity():
    from service.database.connection_manager import ConnectionManager

    manager = ConnectionManager.__new__(ConnectionManager)
    config = CFG["db_config"]
    assert manager._get_pool_key(config) == manager._get_pool_key({**config, "_context_generation": "new"})


@pytest.mark.asyncio
async def test_explicit_connection_state_changes_rotate_evidence_generation(monkeypatch):
    from types import SimpleNamespace

    import dependencies

    changes = []

    async def merge(_key, values, _expire):
        changes.append(values)

    monkeypatch.setattr(dependencies, "_state_key_from_cookie", lambda request: "session")
    monkeypatch.setattr(dependencies, "_merge_state", merge)
    request = SimpleNamespace(state=SimpleNamespace(user={"uid": "owner"}))
    await dependencies.update_session_data(request, {"db_config": CFG["db_config"]})
    await dependencies.update_session_data(request, {"db_config": CFG["db_config"]})
    await dependencies.update_session_data(request, {"session_active_at": 1})
    assert changes[0]["db_context_generation"] != changes[1]["db_context_generation"]
    assert "db_context_generation" not in changes[2]


@pytest.mark.asyncio
async def test_web_search_model_output_also_uses_the_evidence_budget(monkeypatch):
    from types import SimpleNamespace

    import langgraph_orchestration.tools as tools

    events = []
    url = "https://example.com/" + "a" * 30000
    monkeypatch.setattr(tools, "_try_writer", lambda: events.append)
    monkeypatch.setattr(
        tools,
        "_tavily_searcher",
        SimpleNamespace(
            invoke=lambda args: {
                "results": [{"url": url, "title": "T" * 30000, "content": "C" * 30000}],
            }
        ),
        raising=False,
    )
    result = await tools.web_search.coroutine(
        query="documentation", config={"configurable": {"activated_skills": ["web-research"]}}
    )
    assert len(result.encode()) <= MAX_EVIDENCE_BYTES
    assert json.loads(result)["evidence_complete"] is False
    assert events[-1]["result"]["results"][0]["url"] == url
