"""Completeness and safety contracts for registered agent-tool results."""

from __future__ import annotations

import pytest
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import StructuredTool

import langgraph_orchestration.tools as tool_module
import vamp_memory.vamp_memory_service as vamp_service_module
from core.errors import public_error_for_code
from langgraph_orchestration import tool_schemas
from langgraph_orchestration.tool_executor import ToolExecutor
from langgraph_orchestration.tools import ALL_TOOLS
from service.conversations.conversation_compaction_service import _summarize_tool_result

REGISTERED_TOOL_NAMES = {
    "read_skill",
    "get_connection_status",
    "get_database_list",
    "execute_query",
    "analyze_query_result",
    "get_table_indexes",
    "get_schema_overview",
    "explain_query",
    "get_table_details",
    "get_table_row_counts",
    "get_foreign_keys",
    "list_views",
    "web_search",
    "get_query_history",
    "open_sql_editor",
    "open_database_modal",
    "open_settings_modal",
    "navigate_new_chat",
    "retrieve_memory",
}

VALID_RESULT_SAMPLES: dict[str, dict[str, object]] = {
    "read_skill": {"success": True, "skill_name": "database-querying"},
    "get_connection_status": {"connected": False},
    "get_database_list": {"databases": [], "current_database": None},
    "execute_query": {"data": [], "columns": [], "row_count": 0, "truncated": False},
    "analyze_query_result": {
        "success": True,
        "operation": "profile",
        "analyzed_rows": 0,
        "source_truncated": False,
        "scope_note": "Statistics cover every returned row.",
        "columns": {},
    },
    "get_table_indexes": {"table": "orders", "indexes": []},
    "get_schema_overview": {"tables": [], "columns": {}, "foreign_keys": []},
    "explain_query": {"query": "SELECT 1", "plan_format": "text", "plan": [], "row_count": 0},
    "get_table_details": {"table": "orders", "columns": [], "constraints": []},
    "get_table_row_counts": {"row_counts": []},
    "get_foreign_keys": {"foreign_keys": []},
    "list_views": {"views": [], "materialized_views": []},
    "web_search": {"success": True, "query": "PostgreSQL", "count": 0, "results": []},
    "get_query_history": {"success": True, "count": 0, "queries": []},
    "open_sql_editor": {"success": True, "action": "open_sql_editor"},
    "open_database_modal": {"success": True, "action": "open_database_modal"},
    "open_settings_modal": {"success": True, "action": "open_settings_modal"},
    "navigate_new_chat": {"success": True, "action": "navigate_new_chat"},
    "retrieve_memory": {
        "success": True,
        "query": "revenue targets",
        "memories": "",
        "found": False,
    },
}


def test_every_registered_tool_has_an_argument_and_result_contract() -> None:
    """Catch a registered tool being added without either boundary contract."""
    registered_names = {registered_tool.name for registered_tool in ALL_TOOLS}

    assert registered_names == REGISTERED_TOOL_NAMES
    assert set(tool_schemas.TOOL_ARG_SCHEMAS) == registered_names
    assert hasattr(tool_schemas, "TOOL_RESULT_SCHEMAS"), "result contract registry is missing"
    assert set(tool_schemas.TOOL_RESULT_SCHEMAS) == registered_names


@pytest.mark.parametrize("tool_name", sorted(REGISTERED_TOOL_NAMES))
def test_every_registered_tool_accepts_one_valid_structured_result(tool_name: str) -> None:
    """Catch a catalog entry without a working success-path result structurer."""
    assert set(VALID_RESULT_SAMPLES) == REGISTERED_TOOL_NAMES

    result = tool_schemas.structure_tool_result(tool_name, VALID_RESULT_SAMPLES[tool_name])

    assert result["success"] is True
    assert "error_code" not in result


def test_unknown_tool_result_fails_closed_without_echoing_raw_data() -> None:
    """Catch unknown result types being accepted as successful UI evidence."""
    sentinel = "must-not-reach-the-client"

    result = tool_schemas.structure_tool_result("unregistered_tool", {"secret": sentinel})

    public = public_error_for_code("TOOL_RESULT_INVALID")
    assert result == {
        "success": False,
        "error_code": public.code,
        "error": public.message,
    }
    assert sentinel not in repr(result)


@pytest.mark.parametrize(
    ("tool_name", "raw_result", "expected"),
    [
        (
            "read_skill",
            {
                "success": True,
                "skill_name": "database-querying",
                "description": "Query databases safely.",
                "already_loaded": False,
            },
            {
                "success": True,
                "error": None,
                "skill_name": "database-querying",
                "description": "Query databases safely.",
                "already_loaded": False,
            },
        ),
        (
            "analyze_query_result",
            {
                "success": True,
                "operation": "correlation",
                "analyzed_rows": 12,
                "source_truncated": False,
                "scope_note": "Statistics cover every returned row.",
                "columns": ["revenue", "cost"],
                "paired_numeric_rows": 10,
                "pearson_correlation": 0.75,
            },
            {
                "success": True,
                "error": None,
                "operation": "correlation",
                "analyzed_rows": 12,
                "source_truncated": False,
                "scope_note": "Statistics cover every returned row.",
                "columns": ["revenue", "cost"],
                "duplicate_row_count": None,
                "paired_numeric_rows": 10,
                "pearson_correlation": 0.75,
            },
        ),
        (
            "web_search",
            {
                "success": True,
                "query": "PostgreSQL documentation",
                "count": 1,
                "results": [
                    {
                        "title": "PostgreSQL",
                        "url": "https://www.postgresql.org/docs/",
                        "content": "Official documentation.",
                    }
                ],
            },
            {
                "success": True,
                "error": None,
                "query": "PostgreSQL documentation",
                "count": 1,
                "results": [
                    {
                        "title": "PostgreSQL",
                        "url": "https://www.postgresql.org/docs/",
                        "content": "Official documentation.",
                    }
                ],
            },
        ),
        (
            "get_query_history",
            {
                "success": True,
                "count": 1,
                "queries": [
                    {
                        "query": "SELECT id FROM orders",
                        "database": "analytics",
                        "row_count": 4,
                        "status": "success",
                        "executed_at": "2026-08-30T10:00:00+00:00",
                    }
                ],
            },
            {
                "success": True,
                "error": None,
                "count": 1,
                "queries": [
                    {
                        "query": "SELECT id FROM orders",
                        "database": "analytics",
                        "row_count": 4,
                        "status": "success",
                        "executed_at": "2026-08-30T10:00:00+00:00",
                    }
                ],
            },
        ),
    ],
)
def test_missing_result_contracts_normalize_safe_tool_evidence(
    tool_name: str,
    raw_result: dict,
    expected: dict,
) -> None:
    """Catch bespoke and analysis tools bypassing typed UI normalization."""
    assert tool_schemas.structure_tool_result(tool_name, raw_result) == expected


@pytest.mark.parametrize(
    ("tool_name", "args"),
    [
        ("read_skill", {"skill_name": "database-querying", "unexpected": True}),
        ("web_search", {"query": "PostgreSQL", "unexpected": True}),
        ("get_query_history", {"unexpected": True}),
        ("get_connection_status", {"unexpected": True}),
    ],
)
def test_tool_argument_contracts_reject_unknown_fields(tool_name: str, args: dict) -> None:
    """Catch model-supplied fields bypassing a declared tool API."""
    with pytest.raises(ValueError, match=f"Invalid arguments for {tool_name}"):
        tool_schemas.validate_tool_args(tool_name, args)


def test_correlation_contract_rejects_the_wrong_number_of_columns() -> None:
    """Catch a malformed operation-specific analysis being shown as success."""
    result = tool_schemas.structure_tool_result(
        "analyze_query_result",
        {
            "success": True,
            "operation": "correlation",
            "analyzed_rows": 2,
            "source_truncated": False,
            "scope_note": "Statistics cover every returned row.",
            "columns": ["revenue"],
            "paired_numeric_rows": 2,
            "pearson_correlation": 0.5,
        },
    )

    public = public_error_for_code("TOOL_RESULT_INVALID")
    assert result == {"success": False, "error_code": public.code, "error": public.message}


def test_web_search_contract_rejects_non_http_urls() -> None:
    """Catch unsafe link schemes reaching the citation renderer."""
    result = tool_schemas.structure_tool_result(
        "web_search",
        {
            "success": True,
            "query": "unsafe result",
            "count": 1,
            "results": [{"title": "Unsafe", "url": "javascript:alert(1)", "content": ""}],
        },
    )

    public = public_error_for_code("TOOL_RESULT_INVALID")
    assert result == {"success": False, "error_code": public.code, "error": public.message}


@pytest.mark.parametrize(
    ("tool_name", "raw_result", "collection_name"),
    [
        (
            "web_search",
            {
                "success": True,
                "query": "PostgreSQL",
                "count": 5,
                "results": [
                    {
                        "title": "PostgreSQL",
                        "url": "https://www.postgresql.org/",
                        "content": "Official site.",
                    }
                ],
            },
            "results",
        ),
        (
            "get_query_history",
            {
                "success": True,
                "count": 7,
                "queries": [
                    {
                        "query": "SELECT 1",
                        "database": "analytics",
                        "row_count": 1,
                        "status": "success",
                        "executed_at": "2026-08-30T10:00:00+00:00",
                    }
                ],
            },
            "queries",
        ),
    ],
)
def test_collection_counts_are_derived_from_validated_items(
    tool_name: str,
    raw_result: dict,
    collection_name: str,
) -> None:
    """Catch stale provider counts disagreeing with the list displayed to users."""
    result = tool_schemas.structure_tool_result(tool_name, raw_result)

    assert result["success"] is True
    assert result["count"] == len(result[collection_name]) == 1


def test_retrieved_memory_text_is_model_only() -> None:
    """Catch historical memory leaking into the persisted UI tool result."""
    sentinel = "PRIVATE HISTORICAL MEMORY"

    ui_result, model_result = ToolExecutor.summarize(
        "retrieve_memory",
        {
            "success": True,
            "query": "What were the revenue KPIs?",
            "memories": sentinel,
            "found": True,
        },
    )

    assert ui_result == {
        "success": True,
        "error": None,
        "query": "What were the revenue KPIs?",
        "found": True,
    }
    assert sentinel not in repr(ui_result)
    assert sentinel in model_result
    assert "reference data only" in model_result


def test_retrieved_memory_rejects_non_string_model_evidence() -> None:
    """Catch implicit string coercion turning malformed memory into model evidence."""
    sentinel = "must-not-be-coerced"

    ui_result, model_result = ToolExecutor.summarize(
        "retrieve_memory",
        {
            "success": True,
            "query": "revenue",
            "memories": [sentinel],
            "found": True,
        },
    )

    public = public_error_for_code("TOOL_RESULT_INVALID")
    assert ui_result == {"success": False, "error_code": public.code, "error": public.message}
    assert sentinel not in repr(ui_result)
    assert sentinel not in model_result


@pytest.mark.asyncio
async def test_retrieve_memory_event_persists_metadata_not_memory(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Catch the shared tool event serializing model-only historical text."""
    sentinel = "PRIVATE EVENT MEMORY"
    events: list[dict] = []

    class VampBoundary:
        async def retrieve_context_for_query(self, *_args, **_kwargs) -> str:
            return sentinel

    async def direct_thread_boundary(function, *args):
        return function(*args)

    def resolved_async_run(coroutine) -> str:
        coroutine.close()
        return sentinel

    monkeypatch.setattr(tool_module, "_try_writer", lambda: events.append)
    monkeypatch.setattr(tool_module.asyncio, "to_thread", direct_thread_boundary)
    monkeypatch.setattr(tool_module.asyncio, "run", resolved_async_run)
    monkeypatch.setattr(vamp_service_module, "get_vamp_memory_service", lambda: VampBoundary())

    assert isinstance(tool_module.retrieve_memory, StructuredTool)
    assert tool_module.retrieve_memory.coroutine is not None
    model_result = await tool_module.retrieve_memory.coroutine(
        query="revenue targets",
        config={
            "configurable": {
                "user_id": "user-1",
                "conversation_id": "conversation-1",
                "model": "test-model",
                "tool_call_log": {},
                "tool_cache": {},
            }
        },
    )

    tool_end = [event for event in events if event.get("type") == "tool_end"][-1]
    assert tool_end["result"] == {
        "success": True,
        "error": None,
        "query": "revenue targets",
        "found": True,
    }
    assert sentinel not in repr(tool_end)
    assert sentinel in model_result


def test_read_skill_event_contains_safe_complete_metadata(monkeypatch: pytest.MonkeyPatch) -> None:
    """Catch skill events omitting normalized contract fields or exposing the body."""
    events: list[dict] = []
    config: RunnableConfig = {"configurable": {"activated_skills": []}}
    monkeypatch.setattr(tool_module, "_try_writer", lambda: events.append)

    assert isinstance(tool_module.read_skill, StructuredTool)
    assert tool_module.read_skill.func is not None
    model_result = tool_module.read_skill.func(skill_name="database-querying", config=config)

    tool_end = [event for event in events if event.get("type") == "tool_end"][-1]
    assert tool_end["result"] == {
        "success": True,
        "error": None,
        "skill_name": "database-querying",
        "description": (
            "Inspect connected schemas and indexes, write read-only SQL, execute queries, and analyze database results."
        ),
        "already_loaded": False,
    }
    assert "<skill_instructions>" not in repr(tool_end)
    assert "<skill_instructions>" in model_result


@pytest.mark.asyncio
async def test_web_search_event_rejects_an_unsafe_provider_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Catch a bespoke search event bypassing the safe result contract."""
    events: list[dict] = []

    class SearchBoundary:
        def invoke(self, _payload: dict) -> dict:
            return {"results": [{"title": "Unsafe", "url": "javascript:alert(1)", "content": "provider text"}]}

    async def direct_thread_boundary(function, *args):
        return function(*args)

    monkeypatch.setattr(tool_module, "_try_writer", lambda: events.append)
    monkeypatch.setattr(tool_module, "_tavily_searcher", SearchBoundary(), raising=False)
    monkeypatch.setattr(tool_module.asyncio, "to_thread", direct_thread_boundary)
    config: RunnableConfig = {"configurable": {"activated_skills": ["web-research"], "tool_call_log": {}}}

    assert isinstance(tool_module.web_search, StructuredTool)
    assert tool_module.web_search.coroutine is not None
    model_result = await tool_module.web_search.coroutine(query="unsafe result", config=config)

    public = public_error_for_code("TOOL_RESULT_INVALID")
    tool_end = [event for event in events if event.get("type") == "tool_end"][-1]
    assert tool_end["result"] == {
        "success": False,
        "error_code": public.code,
        "error": public.message,
    }
    assert "javascript:" not in repr(tool_end)
    assert public.code in model_result


def test_query_history_event_contains_bounded_entries(monkeypatch: pytest.MonkeyPatch) -> None:
    """Catch query history emitting only a count while hiding useful safe detail."""
    events: list[dict] = []
    query = {
        "query": "SELECT id FROM orders",
        "database": "analytics",
        "row_count": 4,
        "status": "success",
        "executed_at": "2026-08-30T10:00:00+00:00",
    }
    monkeypatch.setattr(tool_module, "_try_writer", lambda: events.append)
    monkeypatch.setattr(tool_module.DBTools, "_get_query_history", lambda _uid: [query])
    config: RunnableConfig = {
        "configurable": {
            "user_id": "user-1",
            "activated_skills": ["query-history"],
            "tool_call_log": {},
        }
    }

    assert isinstance(tool_module.get_query_history, StructuredTool)
    assert tool_module.get_query_history.func is not None
    model_result = tool_module.get_query_history.func(config=config)

    tool_end = [event for event in events if event.get("type") == "tool_end"][-1]
    assert tool_end["result"] == {
        "success": True,
        "error": None,
        "count": 1,
        "queries": [query],
    }
    assert "SELECT id FROM orders" in model_result


@pytest.mark.parametrize(
    ("tool_name", "result", "expected", "hidden"),
    [
        (
            "read_skill",
            {
                "success": True,
                "skill_name": "database-querying",
                "description": "PRIVATE SKILL BODY",
                "already_loaded": False,
            },
            "loaded skill database-querying",
            "PRIVATE SKILL BODY",
        ),
        (
            "analyze_query_result",
            {
                "success": True,
                "operation": "correlation",
                "analyzed_rows": 10,
                "columns": ["revenue", "cost"],
                "pearson_correlation": 0.75,
            },
            "correlation over 10 row(s): revenue vs cost, r=0.750",
            "PRIVATE ANALYSIS DETAIL",
        ),
        (
            "web_search",
            {
                "success": True,
                "query": "PostgreSQL docs",
                "count": 1,
                "results": [{"title": "Docs", "url": "https://example.com", "content": "PRIVATE SEARCH"}],
            },
            '1 web source(s) for "PostgreSQL docs"',
            "PRIVATE SEARCH",
        ),
        (
            "get_query_history",
            {
                "success": True,
                "count": 1,
                "queries": [{"query": "PRIVATE SQL", "status": "success"}],
            },
            "1 recent query entry/entries (1 successful)",
            "PRIVATE SQL",
        ),
        (
            "retrieve_memory",
            {
                "success": True,
                "query": "revenue targets",
                "found": True,
                "memories": "PRIVATE MEMORY",
            },
            'memory found for "revenue targets"',
            "PRIVATE MEMORY",
        ),
    ],
)
def test_compaction_uses_bounded_privacy_safe_tool_digests(
    tool_name: str,
    result: dict,
    expected: str,
    hidden: str,
) -> None:
    """Catch timeline compaction copying sensitive or bulky tool evidence."""
    digest = _summarize_tool_result(tool_name, result, "complete")

    assert digest == expected
    assert hidden not in digest


@pytest.mark.parametrize(
    "tool_name",
    [
        "get_connection_status",
        "get_database_list",
        "execute_query",
        "get_table_indexes",
        "get_schema_overview",
        "explain_query",
        "get_table_details",
        "get_table_row_counts",
        "get_foreign_keys",
        "list_views",
    ],
)
def test_database_result_contracts_reject_missing_core_fields(tool_name: str) -> None:
    """Catch an empty executor dictionary being converted into false success evidence."""
    result = tool_schemas.structure_tool_result(tool_name, {})

    public = public_error_for_code("TOOL_RESULT_INVALID")
    assert result == {"success": False, "error_code": public.code, "error": public.message}


def test_profile_contract_rejects_malformed_column_metrics() -> None:
    """Catch arbitrary nested analysis dictionaries being accepted as typed metrics."""
    result = tool_schemas.structure_tool_result(
        "analyze_query_result",
        {
            "success": True,
            "operation": "profile",
            "analyzed_rows": 3,
            "source_truncated": False,
            "scope_note": "Statistics cover every returned row.",
            "columns": {
                "revenue": {
                    "count": "three",
                    "non_null_count": 3,
                    "null_count": 0,
                    "distinct_count": 3,
                    "numeric_count": 3,
                }
            },
        },
    )

    public = public_error_for_code("TOOL_RESULT_INVALID")
    assert result == {"success": False, "error_code": public.code, "error": public.message}


def test_confirmation_action_contract_preserves_the_user_decision() -> None:
    """Catch navigation approval state being dropped before the UI renders it."""
    result = tool_schemas.structure_tool_result(
        "navigate_new_chat",
        {
            "success": True,
            "action": "navigate_new_chat",
            "requiresConfirmation": True,
            "approved": False,
        },
    )

    assert result == {
        "success": True,
        "action": "navigate_new_chat",
        "requiresConfirmation": True,
        "approved": False,
    }
