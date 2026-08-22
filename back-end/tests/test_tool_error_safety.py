"""Behavioral tests for safe tool, provider, and persisted error contracts."""

from __future__ import annotations

import json
import logging
import socket
from contextlib import contextmanager
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from fastapi import HTTPException

import controller.context_controller as context_controller
import controller.conversations_controller as conversations_controller
import langgraph_orchestration.stream_conversation as stream_conversation_module
import langgraph_orchestration.tools as tool_module
import llm_provider.bedrock_client as bedrock_client_module
import llm_provider.model_factory as model_factory
import llm_provider.token_budget as token_budget
import service.conversations.conversation_streaming_service as conversation_streaming_module
import service.database.ai_tool_executor as db_executor_module
import service.database.connection_handlers as connection_handlers
import service.database.context_sync as context_sync_module
import service.database.database_service as database_service_module
import service.database.operations as database_operations
import service.firestore.firestore_service as firestore_service_module
import service.redis_service as redis_service_module
import vamp_memory.vamp_memory_service as vamp_service_module
from api_contract.conversations import RenameConversationRequest
from langgraph_orchestration.stream_lifecycle import ConcurrentTaskRunError
from langgraph_orchestration.tool_schemas import structure_tool_result
from service.conversations.conversation_compaction_service import (
    ConversationCompactionService,
    _summarize_tool_result,
)
from service.conversations.conversation_repository import ConversationRepository
from service.database.ai_tool_executor import AIToolExecutor
from service.database.database_service import DatabaseService

RAW_SECRET = (
    "permission denied password=boundary-secret "
    "postgresql://admin:dsn-secret@private-db.internal/payroll "
    "SELECT salary FROM private_payroll /srv/moonlit/secrets.env "
    "x-amzn-requestid=provider-secret"
)


def _assert_secret_absent(value: Any) -> None:
    rendered = json.dumps(value, default=str)
    for secret in (
        "boundary-secret",
        "dsn-secret",
        "private-db.internal",
        "SELECT salary FROM private_payroll",
        "/srv/moonlit/secrets.env",
        "provider-secret",
    ):
        assert secret not in rendered


def _assert_safe_log_records(records: list[logging.LogRecord]) -> None:
    assert records
    for record in records:
        assert record.exc_info is None
        _assert_secret_absent(record.getMessage())


class _FailingCursor:
    """Complete cursor fake that fails only at the selected database operation."""

    def __init__(self) -> None:
        self.closed = False

    def execute(self, statement, params=None) -> None:
        del params
        if statement == "HEALTH CHECK":
            return
        raise RuntimeError(RAW_SECRET)

    def fetchone(self):
        return (1,)

    def fetchall(self):
        return []

    def fetchmany(self, size):
        del size
        return []

    def close(self) -> None:
        self.closed = True


class _FailingConnection:
    """Connection fake exposing the production cursor interface."""

    def cursor(self) -> _FailingCursor:
        return _FailingCursor()


class _FailingAdapter:
    """Adapter fake covering query, schema, and EXPLAIN executor paths."""

    explain_format = "text"

    def get_health_check_sql(self) -> str:
        return "HEALTH CHECK"

    def get_set_timeout_sql(self, timeout_seconds: int):
        del timeout_seconds
        return None

    def get_all_tables_for_cache(self, database: str, *, schema: str):
        del database, schema
        return "SCHEMA QUERY", ()

    def run_explain(self, cursor: _FailingCursor, query: str):
        del cursor, query
        raise RuntimeError(RAW_SECRET)

    def get_column_names_from_cursor(self, cursor: _FailingCursor) -> list[str]:
        del cursor
        return []


class _ContextSync:
    """In-memory context fake matching the database executor's used methods."""

    def __init__(self) -> None:
        self.queries: list[tuple] = []

    def get_connection(self, user_id: str) -> dict:
        del user_id
        return {
            "connected": True,
            "db_type": "mysql",
            "database": "analytics",
            "schema": "public",
        }

    def add_query(self, *args) -> None:
        self.queries.append(args)

    def get_schema_context(self, user_id: str, database: str):
        del user_id, database
        return None

    def store_schema_context(self, *args) -> None:
        del args


@pytest.fixture
def failing_database_boundaries(monkeypatch: pytest.MonkeyPatch) -> None:
    """Install complete fakes at the context, adapter, and connection boundaries."""
    context_sync = _ContextSync()
    adapter = _FailingAdapter()

    @contextmanager
    def failing_connection(_db_config):
        yield _FailingConnection()

    monkeypatch.setattr(context_sync_module, "get_default_context_sync", lambda: context_sync)
    monkeypatch.setattr("service.database.adapters.get_adapter", lambda _db_type: adapter)
    monkeypatch.setattr(db_executor_module, "get_tool_connection", failing_connection)


def _tool_config() -> dict:
    return {
        "configurable": {
            "user_id": "user-1",
            "conversation_id": "00000000-0000-4000-8000-000000000001",
            "db_config": {"db_type": "mysql", "database": "analytics"},
            "max_rows": 100,
            "activated_skills": ["database-querying"],
            "tool_cache": {},
            "tool_call_log": {},
            "model": "mock-model",
        }
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "tool_name,raw_args",
    [
        ("execute_query", {"query": "SELECT 1", "max_rows": 10}),
        ("get_schema_overview", {"target_tables": None}),
        ("explain_query", {"query": "SELECT 1"}),
    ],
)
async def test_database_failures_are_stable_in_sse_and_model_output(
    monkeypatch: pytest.MonkeyPatch,
    failing_database_boundaries: None,
    tool_name: str,
    raw_args: dict,
) -> None:
    """Removing DB mapping from any executor leaks its exception through two outputs."""
    del failing_database_boundaries
    events: list[dict] = []
    monkeypatch.setattr(tool_module, "_try_writer", lambda: events.append)

    executors = {
        "execute_query": lambda validated, user_id, db_config, max_rows: AIToolExecutor._execute_query(
            user_id,
            validated["query"],
            max_rows,
            db_config,
        ),
        "get_schema_overview": lambda validated, user_id, db_config, _max_rows: (
            AIToolExecutor._get_schema_overview(
                user_id,
                target_tables=validated.get("target_tables"),
                db_config=db_config,
            )
        ),
        "explain_query": lambda validated, user_id, db_config, _max_rows: AIToolExecutor._explain_query(
            user_id,
            db_config,
            validated["query"],
        ),
    }

    model_summary = await tool_module._execute_tool(
        tool_name,
        raw_args,
        _tool_config(),
        executors[tool_name],
    )

    tool_end = [event for event in events if event.get("type") == "tool_end"][-1]
    assert tool_end["result"] == {
        "success": False,
        "error_code": "DB_PERMISSION_DENIED",
        "error": "Database permission denied.",
    }
    assert "DB_PERMISSION_DENIED" in model_summary
    assert "Database permission denied." in model_summary
    _assert_secret_absent(events)
    _assert_secret_absent(model_summary)


@pytest.mark.asyncio
async def test_generic_tool_wrapper_failure_has_one_safe_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The wrapper's exception branch must not serialize its executor exception."""
    events: list[dict] = []
    monkeypatch.setattr(tool_module, "_try_writer", lambda: events.append)

    def fail_executor(*_args):
        raise RuntimeError(RAW_SECRET)

    model_summary = await tool_module._execute_tool(
        "get_connection_status",
        {},
        _tool_config(),
        fail_executor,
    )

    tool_end = [event for event in events if event.get("type") == "tool_end"][-1]
    assert tool_end["result"] == {
        "success": False,
        "error_code": "TOOL_EXECUTION_FAILED",
        "error": "Tool execution failed.",
    }
    assert "TOOL_EXECUTION_FAILED" in model_summary
    assert "Tool execution failed." in model_summary
    _assert_secret_absent(events)
    _assert_secret_absent(model_summary)


@pytest.mark.asyncio
async def test_vamp_failure_is_stable_in_sse_and_model_output(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The VAMP executor's caught failure must not become tool evidence."""
    events: list[dict] = []
    monkeypatch.setattr(tool_module, "_try_writer", lambda: events.append)

    class FailingVampService:
        async def retrieve_context_for_query(
            self,
            conversation_id: str,
            user_id: str,
            query: str,
            *,
            model_id: str | None,
        ) -> str:
            del conversation_id, user_id, query, model_id
            raise RuntimeError(RAW_SECRET)

    monkeypatch.setattr(
        vamp_service_module,
        "get_vamp_memory_service",
        lambda: FailingVampService(),
    )

    model_summary = await tool_module.retrieve_memory.coroutine(
        query="revenue history",
        config=_tool_config(),
    )

    tool_end = [event for event in events if event.get("type") == "tool_end"][-1]
    assert tool_end["result"] == {
        "success": False,
        "error_code": "MEMORY_RETRIEVAL_FAILED",
        "error": "Memory retrieval failed.",
    }
    assert "MEMORY_RETRIEVAL_FAILED" in model_summary
    assert "Memory retrieval failed." in model_summary
    _assert_secret_absent(events)
    _assert_secret_absent(model_summary)


@pytest.mark.asyncio
async def test_vamp_vector_failure_persists_only_stable_reason(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Vector retry state must not persist or log the indexing exception."""
    reasons: list[str] = []

    class SummaryRepositoryBoundary:
        @property
        def mark_vector_indexed(self):
            raise RuntimeError(RAW_SECRET)

        @staticmethod
        def mark_vector_failed(
            conversation_id: str,
            summary_id: str,
            *,
            reason: str,
        ) -> None:
            assert conversation_id == "conversation-1"
            assert summary_id == "summary-1"
            reasons.append(reason)

    service = vamp_service_module.VampMemoryService(
        summary_repo=SummaryRepositoryBoundary(),
        context_budget_tokens=1,
    )

    with caplog.at_level(logging.WARNING, logger=vamp_service_module.logger.name):
        result = await service._index_with_failure_record(
            {
                "conversation_id": "conversation-1",
                "summary_id": "summary-1",
                "schema_version": 2,
                "memory_bullets": [],
            }
        )

    assert result is False
    assert reasons == ["[VAMP_VECTOR_INDEX_FAILED] Memory vector indexing failed."]
    _assert_secret_absent(reasons)
    _assert_safe_log_records(caplog.records)


def test_structuring_failure_is_a_stable_failure_not_success_with_raw_detail() -> None:
    """A Pydantic conversion failure must not return raw data as successful evidence."""
    result = structure_tool_result(
        "get_table_row_count",
        {"table": "example", "row_count": RAW_SECRET},
    )

    assert result == {
        "success": False,
        "error_code": "TOOL_RESULT_INVALID",
        "error": "Tool result could not be structured.",
    }
    _assert_secret_absent(result)


def test_compaction_error_summary_rejects_legacy_raw_fallback() -> None:
    """Persisted legacy error text must not be copied into a future model prompt."""
    assert _summarize_tool_result(
        "execute_query",
        {"error": RAW_SECRET},
        "error",
    ) == "ERROR [TOOL_EXECUTION_FAILED] — Tool execution failed."
    assert _summarize_tool_result(
        "execute_query",
        {
            "error_code": "DB_TIMEOUT",
            "error": "Database operation timed out.",
        },
        "error",
    ) == "ERROR [DB_TIMEOUT] — Database operation timed out."


@pytest.mark.asyncio
async def test_compaction_failure_returns_only_stable_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The background compaction result is later consumed and must be public-safe."""
    monkeypatch.setattr(
        firestore_service_module.FirestoreService,
        "get_db",
        staticmethod(lambda: (_ for _ in ()).throw(RuntimeError(RAW_SECRET))),
    )

    result = await ConversationCompactionService.check_and_summarize(
        "00000000-0000-4000-8000-000000000001",
        "user-1",
        model="mock-model",
        pressure_budget_tokens=100,
    )

    assert result["reason"] == "error"
    assert result["error_code"] == "CONVERSATION_COMPACTION_FAILED"
    assert result["error"] == "Conversation compaction failed."
    _assert_secret_absent(result)


def test_cleanup_retry_creation_persists_stable_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Creating a retry record must never persist the cleanup exception string."""
    writes: list[dict] = []

    class FakeCollection:
        def add(self, payload: dict) -> None:
            writes.append(payload)

    class FakeDb:
        def collection(self, name: str) -> FakeCollection:
            assert name == "qdrant_conversation_cleanup"
            return FakeCollection()

    monkeypatch.setattr(
        firestore_service_module.FirestoreService,
        "get_db",
        staticmethod(lambda: FakeDb()),
    )

    ConversationRepository.create_memory_cleanup_retry(
        "00000000-0000-4000-8000-000000000001",
        "user-1",
        RuntimeError(RAW_SECRET),
    )

    assert writes[0]["error_code"] == "MEMORY_CLEANUP_FAILED"
    assert writes[0]["last_error"] == "Memory cleanup failed."
    _assert_secret_absent(writes)


def test_cleanup_retry_failure_update_persists_stable_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A failed retry update must replace, not append, legacy raw exception detail."""
    updates: list[dict] = []

    class FakeReference:
        def delete(self) -> None:
            raise AssertionError("failed cleanup records must remain")

        def update(self, payload: dict) -> None:
            updates.append(payload)

    class FakeDocument:
        reference = FakeReference()

        def to_dict(self) -> dict:
            return {
                "conversation_id": "00000000-0000-4000-8000-000000000001",
                "user_id": "user-1",
                "attempts": 0,
            }

    class FakeQuery:
        def where(self, *, filter):
            del filter
            return self

        def get(self, *, retry, timeout):
            del retry, timeout
            return [FakeDocument()]

    class FakeDb:
        def collection(self, name: str) -> FakeQuery:
            assert name == "qdrant_conversation_cleanup"
            return FakeQuery()

    class FailingMemoryCleaner:
        async def delete_conversation_pointers(self, conversation_id: str, user_id: str) -> None:
            del conversation_id, user_id
            raise RuntimeError(RAW_SECRET)

    monkeypatch.setattr(
        firestore_service_module.FirestoreService,
        "get_db",
        staticmethod(lambda: FakeDb()),
    )

    assert ConversationRepository.retry_qdrant_cleanups(FailingMemoryCleaner()) == 0
    assert updates[0]["error_code"] == "MEMORY_CLEANUP_FAILED"
    assert updates[0]["last_error"] == "Memory cleanup failed."
    _assert_secret_absent(updates)


@pytest.mark.asyncio
async def test_redis_info_failure_is_stable_for_http_callers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The context metrics helper must not serialize Redis exception text."""

    class FailingRedis:
        async def info(self) -> dict:
            raise RuntimeError(RAW_SECRET)

    monkeypatch.setattr(redis_service_module, "get_redis_client", lambda: FailingRedis())

    result = await context_controller.get_redis_info()

    assert result == {
        "connected": False,
        "error_code": "REDIS_INFO_FAILED",
        "error": "Redis information is unavailable.",
    }
    _assert_secret_absent(result)


def test_database_list_failure_returns_stable_http_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Database enumeration errors flow to an HTTP response through DatabaseService."""
    monkeypatch.setattr(
        "service.database.connection_manager.get_connection_manager",
        lambda: (_ for _ in ()).throw(RuntimeError(RAW_SECRET)),
    )

    result = database_operations.DatabaseOperations.get_databases(
        {"db_type": "mysql", "database": "analytics"},
    )

    assert result == {
        "status": "error",
        "error_code": "DB_PERMISSION_DENIED",
        "message": "Database permission denied.",
    }
    _assert_secret_absent(result)


def test_query_value_error_returns_stable_http_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The dedicated ValueError branch must not treat exception text as validation output."""

    class Cursor:
        connection = object()
        description = []

        def execute(self, statement, params=None) -> None:
            del statement, params

        def fetchone(self):
            return (1,)

        def fetchmany(self, size):
            del size
            return []

    class Manager:
        @contextmanager
        def get_cursor(self, db_config):
            del db_config
            yield Cursor()

    class Adapter:
        def get_health_check_sql(self) -> str:
            return "HEALTH CHECK"

        def get_set_timeout_sql(self, timeout_seconds: int):
            del timeout_seconds
            return None

        def get_column_names_from_cursor(self, cursor: Cursor):
            del cursor
            raise ValueError(RAW_SECRET)

    monkeypatch.setattr("service.database.adapters.get_adapter", lambda _db_type: Adapter())
    monkeypatch.setattr(
        "service.database.connection_manager.get_connection_manager",
        lambda: Manager(),
    )

    result = database_operations.execute_sql_query(
        {"db_type": "mysql", "database": "analytics"},
        "SELECT 1",
    )

    assert result == {
        "status": "error",
        "error_code": "DB_PERMISSION_DENIED",
        "message": "Database permission denied.",
    }
    _assert_secret_absent(result)


@pytest.mark.parametrize(
    "connect_call",
    [
        lambda: connection_handlers.connect_mysql("db.example.com", 3306, "user", "password"),
        lambda: connection_handlers.connect_postgresql("db.example.com", 5432, "user", "password"),
        lambda: connection_handlers.connect_sqlserver("db.example.com", 1433, "user", "password"),
        lambda: connection_handlers.connect_oracle("db.example.com", 1521, "user", "password", "XE"),
        lambda: connection_handlers.connect_remote_postgresql(
            "postgresql://user:password@db.example.com/analytics"
        ),
        lambda: connection_handlers.connect_remote_mysql(
            "mysql://user:password@db.example.com/analytics"
        ),
        lambda: connection_handlers.connect_remote_oracle(
            "user/password@db.example.com:1521/XE"
        ),
        lambda: connection_handlers.connect_remote_sqlserver(
            "Driver={ODBC Driver 17 for SQL Server};Server=db.example.com;"
            "Database=analytics;UID=user;PWD=password"
        ),
    ],
)
def test_connection_handler_failures_return_stable_contracts(
    monkeypatch: pytest.MonkeyPatch,
    connect_call,
) -> None:
    """Every DBMS connection family shares the same classified public failure shape."""

    class OracleAdapter:
        def _parse_connection_string(self, connection_string: str) -> dict:
            del connection_string
            return {"dsn": "db.example.com:1521/XE", "user": "user"}

    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *_args, **_kwargs: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 0)),
        ],
    )
    monkeypatch.setattr(
        "service.database.connection_manager.get_connection_manager",
        lambda: (_ for _ in ()).throw(RuntimeError(RAW_SECRET)),
    )
    monkeypatch.setattr(
        "service.database.adapters.get_adapter",
        lambda _db_type: OracleAdapter(),
    )

    result = connect_call()

    assert result == {
        "status": "error",
        "error_code": "DB_PERMISSION_DENIED",
        "message": "Database permission denied.",
    }
    _assert_secret_absent(result)


def test_select_database_failure_returns_stable_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Database selection must not return fetch exceptions to the controller."""
    monkeypatch.setattr(
        database_operations,
        "fetch_database_info",
        lambda *_args: (_ for _ in ()).throw(RuntimeError(RAW_SECRET)),
    )

    result = connection_handlers.select_database(
        {"db_type": "mysql", "database": "before"},
        "analytics",
    )

    assert result == {
        "status": "error",
        "error_code": "DB_PERMISSION_DENIED",
        "message": "Database permission denied.",
    }
    _assert_secret_absent(result)


def test_host_resolution_and_oracle_parse_failures_are_stable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Adjacent connection-validation errors must not interpolate their exceptions."""
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(socket.gaierror(RAW_SECRET)),
    )
    resolution = connection_handlers._validate_host("db.example.com")
    assert resolution == {
        "status": "error",
        "error_code": "DB_HOST_RESOLUTION_FAILED",
        "message": "Database host could not be resolved.",
    }

    class FailingOracleAdapter:
        def _parse_connection_string(self, connection_string: str) -> dict:
            del connection_string
            raise ValueError(RAW_SECRET)

    monkeypatch.setattr(
        "service.database.adapters.get_adapter",
        lambda _db_type: FailingOracleAdapter(),
    )
    parse = connection_handlers.connect_remote_oracle("invalid-but-sensitive")
    assert parse == {
        "status": "error",
        "error_code": "DB_CONNECTION_STRING_INVALID",
        "message": "Database connection string is invalid.",
    }
    _assert_secret_absent((resolution, parse))


def test_database_service_public_failures_are_stable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Switch and disconnect service failures must retain their status-style outer shape."""
    monkeypatch.setattr(
        "service.database.connection_manager.get_connection_manager",
        lambda: (_ for _ in ()).throw(RuntimeError(RAW_SECRET)),
    )

    switched = DatabaseService.switch_remote_database(
        {
            "db_type": "postgresql",
            "connection_string": "postgresql://user:password@db.example.com/before",
        },
        "analytics",
    )
    disconnected = DatabaseService.disconnect(
        {"db_type": "postgresql", "database": "analytics"},
        "user-1",
    )

    expected = {
        "status": "error",
        "error_code": "DB_PERMISSION_DENIED",
        "message": "Database permission denied.",
    }
    assert switched == expected
    assert disconnected == expected
    _assert_secret_absent((switched, disconnected))


def test_schema_selection_failure_preserves_safe_outer_shape(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Schema selection keeps recovery fields while replacing raw DB detail."""

    class Manager:
        @contextmanager
        def get_cursor(self, db_config):
            del db_config
            raise RuntimeError(RAW_SECRET)
            yield

    class Adapter:
        def get_tables_query(self, schema_name: str) -> str:
            del schema_name
            return "SCHEMA QUERY"

    original = {
        "db_type": "postgresql",
        "database": "analytics",
        "schema": "public",
    }
    monkeypatch.setattr("service.database.adapters.get_adapter", lambda _db_type: Adapter())
    monkeypatch.setattr(
        "service.database.connection_manager.get_connection_manager",
        lambda: Manager(),
    )

    result = database_service_module.DatabaseService.select_schema(
        original,
        "private_schema",
        "user-1",
    )

    assert result == {
        "status": "error",
        "error_code": "DB_PERMISSION_DENIED",
        "message": "Database permission denied.",
        "schema": "private_schema",
        "tables": [],
        "db_config": original,
    }
    _assert_secret_absent(result)


def test_bedrock_token_count_failure_raises_stable_provider_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The provider request ID and credential detail must not enter the raised contract."""

    class FailingBedrockClient:
        def count_tokens(self, **kwargs):
            del kwargs
            raise RuntimeError(RAW_SECRET)

    monkeypatch.setattr(bedrock_client_module, "_resolve_model_id", lambda model_id: model_id)
    monkeypatch.setattr(
        bedrock_client_module,
        "get_bedrock_client",
        lambda: FailingBedrockClient(),
    )

    with pytest.raises(token_budget.TokenCountingError) as caught:
        token_budget.count_bedrock_converse_tokens("provider.model-v1")

    assert str(caught.value) == "Provider token counting failed."
    _assert_secret_absent(str(caught.value))


def test_model_prewarm_logs_safely(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Provider initialization remains best-effort without raw exception logging."""
    monkeypatch.setattr(model_factory, "get_supported_providers", lambda: ("bedrock",))
    monkeypatch.setattr(model_factory, "get_provider_models", lambda _provider: ["provider.model-v1"])
    monkeypatch.setattr(
        model_factory,
        "get_chat_model",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError(RAW_SECRET)),
    )

    with caplog.at_level(logging.WARNING, logger=model_factory.logger.name):
        model_factory.prewarm_chat_models()

    rendered = caplog.records[-1].getMessage()
    assert "PROVIDER_INITIALIZATION_FAILED" in rendered
    _assert_secret_absent(rendered)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "operation",
    ["stream", "get", "fetch_execution", "delete", "rename"],
)
async def test_conversation_http_permission_errors_have_one_stable_contract(
    monkeypatch: pytest.MonkeyPatch,
    operation: str,
) -> None:
    """Conversation authorization failures must not expose repository detail."""

    def deny(*_args, **_kwargs):
        raise PermissionError(RAW_SECRET)

    conversation_id = "00000000-0000-4000-8000-000000000001"
    user = {"uid": "user-1"}

    with pytest.raises(HTTPException) as caught:
        if operation == "stream":
            monkeypatch.setattr(
                conversations_controller.LLMOptionsService,
                "resolve_selection",
                lambda provider, model: (provider, model),
            )
            monkeypatch.setattr(
                conversations_controller.ConversationService,
                "verify_conversation_owner",
                deny,
            )
            await conversations_controller._handle_agent_stream(
                SimpleNamespace(),
                "user-1",
                conversation_id,
                "bedrock",
                "provider.model-v1",
                {},
            )
        elif operation == "get":
            monkeypatch.setattr(
                conversations_controller.ConversationService,
                "get_conversation_data",
                deny,
            )
            await conversations_controller.get_conversation(conversation_id, user)
        elif operation == "fetch_execution":
            monkeypatch.setattr(
                conversations_controller.ConversationService,
                "verify_conversation_owner",
                deny,
            )
            await conversations_controller.fetch_execution_result(
                conversation_id,
                "execution-1",
                user,
            )
        elif operation == "delete":
            monkeypatch.setattr(
                conversations_controller.ConversationService,
                "delete_user_conversation",
                deny,
            )
            await conversations_controller.delete_conversation(conversation_id, user)
        else:
            monkeypatch.setattr(
                conversations_controller.ConversationService,
                "rename_user_conversation",
                deny,
            )
            await conversations_controller.rename_conversation(
                conversation_id,
                RenameConversationRequest(title="Renamed"),
                user,
            )

    assert caught.value.status_code == 403
    assert caught.value.detail == {
        "error": "CONVERSATION_ACCESS_DENIED",
        "message": "Conversation access denied.",
    }
    _assert_secret_absent(caught.value.detail)


@pytest.mark.asyncio
async def test_conversation_permission_http_response_uses_common_stable_code(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The production exception handler must promote the stable conversation code."""
    import main as main_module

    def deny(*_args, **_kwargs):
        raise PermissionError(RAW_SECRET)

    async def current_user():
        return {"uid": "user-1"}

    monkeypatch.setattr(
        conversations_controller.ConversationService,
        "get_conversation_data",
        deny,
    )
    app = main_module.create_app()
    app.dependency_overrides[conversations_controller.get_current_user] = current_user
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(
            "/api/v1/get_conversation/00000000-0000-4000-8000-000000000001",
        )

    assert response.status_code == 403
    assert response.json() == {
        "status": "error",
        "error": "CONVERSATION_ACCESS_DENIED",
        "message": "Conversation access denied.",
        "details": {},
    }
    _assert_secret_absent(response.json())


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["delete", "rename"])
async def test_conversation_http_not_found_errors_have_one_stable_contract(
    monkeypatch: pytest.MonkeyPatch,
    operation: str,
) -> None:
    """Conversation mutation misses must not expose repository ValueErrors."""

    def missing(*_args, **_kwargs):
        raise ValueError(RAW_SECRET)

    conversation_id = "00000000-0000-4000-8000-000000000001"
    user = {"uid": "user-1"}

    with pytest.raises(HTTPException) as caught:
        if operation == "delete":
            monkeypatch.setattr(
                conversations_controller.ConversationService,
                "delete_user_conversation",
                missing,
            )
            await conversations_controller.delete_conversation(conversation_id, user)
        else:
            monkeypatch.setattr(
                conversations_controller.ConversationService,
                "rename_user_conversation",
                missing,
            )
            await conversations_controller.rename_conversation(
                conversation_id,
                RenameConversationRequest(title="Renamed"),
                user,
            )

    assert caught.value.status_code == 404
    assert caught.value.detail == {
        "error": "CONVERSATION_NOT_FOUND",
        "message": "Conversation not found.",
    }
    _assert_secret_absent(caught.value.detail)


@pytest.mark.asyncio
async def test_conversation_http_failure_logs_without_traceback_or_raw_detail(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Unexpected HTTP-boundary failures need safe correlated diagnostics."""

    def fail(*_args, **_kwargs):
        raise RuntimeError(RAW_SECRET)

    monkeypatch.setattr(
        conversations_controller.ConversationService,
        "get_conversation_data",
        fail,
    )

    with caplog.at_level(logging.ERROR, logger=conversations_controller.logger.name):
        with pytest.raises(HTTPException) as caught:
            await conversations_controller.get_conversation(
                "00000000-0000-4000-8000-000000000001",
                {"uid": "user-1"},
            )

    assert caught.value.status_code == 500
    assert caught.value.detail == "An internal error occurred while fetching conversation."
    _assert_safe_log_records(caplog.records)


@pytest.mark.asyncio
async def test_concurrent_agent_run_has_stable_sse_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A lease collision must not serialize its exception into SSE."""

    class BusyLease:
        acquired = False
        _stream_task = None

        def __init__(self, *_args, **_kwargs) -> None:
            pass

        async def acquire(self):
            raise ConcurrentTaskRunError(RAW_SECRET)

        async def close(self) -> None:
            pass

    monkeypatch.setattr(stream_conversation_module, "TaskRunLease", BusyLease)

    events = [
        line
        async for line in stream_conversation_module.stream_conversation(
            "00000000-0000-4000-8000-000000000001",
            "hello",
            "user-1",
            model="provider.model-v1",
        )
    ]

    assert json.loads(events[0][6:]) == {
        "type": "error",
        "message": "Another request is already running for this conversation.",
    }
    assert json.loads(events[1][6:]) == {"type": "done"}
    _assert_secret_absent(events)


@pytest.mark.asyncio
async def test_agent_stream_failure_logs_safely_and_emits_stable_sse(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """The outer agent-stream exception remains classifiable but never public or logged raw."""

    monkeypatch.setattr(
        stream_conversation_module.PromptBuilder,
        "build_system_prompt",
        staticmethod(lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError(RAW_SECRET))),
    )

    with caplog.at_level(logging.ERROR, logger=stream_conversation_module.logger.name):
        events = [
            line
            async for line in stream_conversation_module.stream_conversation(
                "00000000-0000-4000-8000-000000000001",
                "hello",
                "user-1",
                model="mock-model",
            )
        ]

    assert json.loads(events[0][6:]) == {
        "type": "error",
        "message": "Something went wrong. Please try again.",
    }
    assert json.loads(events[1][6:]) == {"type": "done"}
    _assert_secret_absent(events)
    _assert_safe_log_records(caplog.records)


@pytest.mark.asyncio
async def test_conversation_streaming_service_failure_logs_safely_and_emits_stable_sse(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """The repository-to-SSE wrapper may classify raw text only in process."""

    monkeypatch.setattr(
        ConversationRepository,
        "get",
        staticmethod(lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError(RAW_SECRET))),
    )

    with caplog.at_level(logging.ERROR, logger=conversation_streaming_module.logger.name):
        events = [
            line
            async for line in conversation_streaming_module.ConversationStreamingService.create_streaming_generator(
                "00000000-0000-4000-8000-000000000001",
                None,
                "user-1",
            )
        ]

    assert json.loads(events[0][6:]) == {
        "type": "error",
        "message": "AI service error. Please try again.",
    }
    _assert_secret_absent(events)
    _assert_safe_log_records(caplog.records)
