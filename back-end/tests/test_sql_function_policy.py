"""Behavioral coverage for dialect-aware SQL function policy gates."""

from __future__ import annotations

import logging
from dataclasses import dataclass

import pytest

import service.database.ai_tool_executor as ai_executor_module
import service.database.operations as database_operations
from core.logging import bind_request_id, clear_request_id
from langgraph_orchestration.tool_schemas import ExecuteQueryArgs, ExplainQueryArgs
from service.database.ai_tool_executor import AIToolExecutor
from service.database.security import DatabaseSecurity

DANGEROUS_FUNCTION_CASES = [
    pytest.param(
        "postgresql",
        "SELECT pg_read_file('/etc/passwd')",
        "Function pg_read_file is prohibited: file access",
        id="postgresql-pg-read-file",
    ),
    pytest.param(
        "postgresql",
        "SELECT pg_read_binary_file('/etc/passwd')",
        "Function pg_read_binary_file is prohibited: file access",
        id="postgresql-pg-read-binary-file",
    ),
    pytest.param(
        "postgresql",
        "SELECT pg_ls_dir('/tmp')",
        "Function pg_ls_dir is prohibited: file access",
        id="postgresql-pg-ls-dir",
    ),
    pytest.param(
        "postgresql",
        "SELECT pg_sleep(1)",
        "Function pg_sleep is prohibited: resource delay",
        id="postgresql-pg-sleep",
    ),
    pytest.param(
        "postgresql",
        "SELECT dblink_exec('connection', 'SELECT 1')",
        "Function dblink_exec is prohibited: external database access",
        id="postgresql-dblink-exec",
    ),
    pytest.param(
        "postgresql",
        "SELECT pg_terminate_backend(1)",
        "Function pg_terminate_backend is prohibited: administrative control",
        id="postgresql-pg-terminate-backend",
    ),
    pytest.param(
        "mysql",
        "SELECT load_file('/etc/passwd')",
        "Function load_file is prohibited: file access",
        id="mysql-load-file",
    ),
    pytest.param(
        "mysql",
        "SELECT sleep(1)",
        "Function sleep is prohibited: resource delay",
        id="mysql-sleep",
    ),
    pytest.param(
        "mysql",
        "SELECT benchmark(1000, MD5('x'))",
        "Function benchmark is prohibited: resource exhaustion",
        id="mysql-benchmark",
    ),
    pytest.param(
        "mysql",
        "SELECT sys_exec('id')",
        "Function sys_exec is prohibited: external code execution",
        id="mysql-sys-exec",
    ),
    pytest.param(
        "mysql",
        "SELECT sys_eval('id')",
        "Function sys_eval is prohibited: external code execution",
        id="mysql-sys-eval",
    ),
    pytest.param(
        "mysql",
        "SELECT get_lock('name', 1)",
        "Function get_lock is prohibited: database locking",
        id="mysql-get-lock",
    ),
    pytest.param(
        "sqlserver",
        "SELECT xp_cmdshell('whoami')",
        "Function xp_cmdshell is prohibited: external code execution",
        id="sqlserver-xp-cmdshell",
    ),
    pytest.param(
        "sqlserver",
        "SELECT * FROM openrowset('SQLNCLI', 'connection', 'SELECT 1')",
        "Function openrowset is prohibited: external database access",
        id="sqlserver-openrowset",
    ),
    pytest.param(
        "sqlserver",
        "SELECT * FROM opendatasource('SQLNCLI', 'connection').db.dbo.records",
        "Function opendatasource is prohibited: external database access",
        id="sqlserver-opendatasource",
    ),
    pytest.param(
        "sqlserver",
        "SELECT * FROM openquery(linked_server, 'SELECT 1')",
        "Function openquery is prohibited: external database access",
        id="sqlserver-openquery",
    ),
    pytest.param(
        "sqlserver",
        "SELECT sp_execute_external_script()",
        "Function sp_execute_external_script is prohibited: external code execution",
        id="sqlserver-external-script",
    ),
    pytest.param(
        "oracle",
        "SELECT utl_http.request('https://example.com') FROM dual",
        "Function request is prohibited: network access",
        id="oracle-utl-http-request",
    ),
    pytest.param(
        "oracle",
        "SELECT dbms_lock.sleep(1) FROM dual",
        "Function sleep is prohibited: resource delay",
        id="oracle-dbms-lock-sleep",
    ),
    pytest.param(
        "oracle",
        "SELECT dbms_scheduler.create_job('job') FROM dual",
        "Function create_job is prohibited: administrative control",
        id="oracle-dbms-scheduler-create-job",
    ),
    pytest.param(
        "oracle",
        "SELECT dbms_java.runjava('class') FROM dual",
        "Function runjava is prohibited: external code execution",
        id="oracle-dbms-java-runjava",
    ),
]

UNKNOWN_FUNCTION_CASES = [
    pytest.param(
        dialect,
        "SELECT custom_side_effect()" + (" FROM dual" if dialect == "oracle" else ""),
        id=f"{dialect}-unknown-function",
    )
    for dialect in ("mysql", "postgresql", "sqlserver", "oracle")
]

ORDINARY_FUNCTION_QUERIES = [
    pytest.param("SELECT COUNT(*) FROM metrics", id="count"),
    pytest.param("SELECT SUM(value) FROM metrics", id="sum"),
    pytest.param("SELECT AVG(value) FROM metrics", id="avg"),
    pytest.param("SELECT MIN(value) FROM metrics", id="min"),
    pytest.param("SELECT MAX(value) FROM metrics", id="max"),
    pytest.param("SELECT LOWER(name) FROM metrics", id="lower"),
    pytest.param("SELECT UPPER(name) FROM metrics", id="upper"),
    pytest.param("SELECT COALESCE(name, '') FROM metrics", id="coalesce"),
    pytest.param("SELECT ROUND(value, 2) FROM metrics", id="round"),
]

DATE_ARITHMETIC_CASES = [
    pytest.param(
        "postgresql",
        "SELECT created_at + INTERVAL '1 day' FROM events",
        id="postgresql-interval",
    ),
    pytest.param(
        "mysql",
        "SELECT DATE_ADD(created_at, INTERVAL 1 DAY) FROM events",
        id="mysql-date-add",
    ),
    pytest.param(
        "sqlserver",
        "SELECT DATEADD(day, 1, created_at) FROM events",
        id="sqlserver-dateadd",
    ),
    pytest.param(
        "oracle",
        "SELECT created_at + INTERVAL '1' DAY FROM events",
        id="oracle-interval",
    ),
]

SAFE_ANONYMOUS_FUNCTION_CASES = [
    pytest.param(
        "postgresql",
        "SELECT AGE(created_at) FROM events",
        id="postgresql-age",
    ),
    pytest.param("mysql", "SELECT NOW()", id="mysql-now"),
    pytest.param("sqlserver", "SELECT ISDATE('2024-01-01')", id="sqlserver-isdate"),
    pytest.param(
        "oracle",
        "SELECT NUMTODSINTERVAL(1, 'DAY') FROM dual",
        id="oracle-numtodsinterval",
    ),
]

STATEFUL_SELECT_CASES = [
    pytest.param(
        "sqlserver",
        "SELECT NEXT VALUE FOR dbo.my_seq",
        "Sequence advancement is prohibited by read-only policy",
        id="sqlserver-next-value-for",
    ),
    pytest.param(
        "oracle",
        "SELECT my_seq.NEXTVAL FROM dual",
        "Sequence advancement is prohibited by read-only policy",
        id="oracle-nextval",
    ),
    pytest.param(
        "sqlserver",
        "SELECT * FROM users WITH (UPDLOCK, HOLDLOCK)",
        "State-changing table lock hint is prohibited by read-only policy",
        id="sqlserver-state-changing-lock-hints",
    ),
    pytest.param(
        "mysql",
        "SELECT @x := 1",
        "Session assignment is prohibited by read-only policy",
        id="mysql-session-assignment",
    ),
]


@pytest.mark.parametrize("dialect,query,warning", DANGEROUS_FUNCTION_CASES)
def test_known_dangerous_functions_are_rejected_with_stable_warnings(
    dialect: str,
    query: str,
    warning: str,
) -> None:
    """Removing a prohibited function category lets a privileged SELECT execute."""
    result = DatabaseSecurity.analyze_sql_query(query, dialect=dialect)

    assert result["is_safe"] is False
    assert result["warnings"] == [warning]


@pytest.mark.parametrize("dialect,query", UNKNOWN_FUNCTION_CASES)
def test_unknown_anonymous_functions_fail_closed(dialect: str, query: str) -> None:
    """Allowing unknown anonymous functions would reopen the UDF side-effect boundary."""
    result = DatabaseSecurity.analyze_sql_query(query, dialect=dialect)

    assert result["is_safe"] is False
    assert result["warnings"] == [
        "Function custom_side_effect is not allowed: unapproved anonymous function"
    ]


@pytest.mark.parametrize("dialect", ["mysql", "postgresql", "sqlserver", "oracle"])
@pytest.mark.parametrize("query", ORDINARY_FUNCTION_QUERIES)
def test_typed_ordinary_sql_functions_remain_allowed(dialect: str, query: str) -> None:
    """Treating every function as a UDF would break ordinary read-only analytics."""
    result = DatabaseSecurity.analyze_sql_query(query, dialect=dialect)

    assert result["is_safe"] is True
    assert result["warnings"] == []


@pytest.mark.parametrize("dialect,query", DATE_ARITHMETIC_CASES)
def test_typed_date_arithmetic_remains_allowed(dialect: str, query: str) -> None:
    """Dialect parsing must preserve ordinary date arithmetic expressions."""
    result = DatabaseSecurity.analyze_sql_query(query, dialect=dialect)

    assert result["is_safe"] is True
    assert result["warnings"] == []


@pytest.mark.parametrize("dialect,query", SAFE_ANONYMOUS_FUNCTION_CASES)
def test_dialect_specific_safe_anonymous_functions_remain_allowed(
    dialect: str,
    query: str,
) -> None:
    """Removing a dialect allowlist entry would reject a selected harmless scalar."""
    result = DatabaseSecurity.analyze_sql_query(query, dialect=dialect)

    assert result["is_safe"] is True
    assert result["warnings"] == []


@pytest.mark.parametrize("dialect,query,warning", STATEFUL_SELECT_CASES)
def test_stateful_select_constructs_are_rejected_by_actual_dialect(
    dialect: str,
    query: str,
    warning: str,
) -> None:
    """A SELECT root must not authorize AST nodes that mutate database/session state."""
    result = DatabaseSecurity.analyze_sql_query(query, dialect=dialect)

    assert result["is_safe"] is False
    assert result["warnings"] == [warning]


@pytest.mark.parametrize(
    "query",
    [
        "SELECT e.NEXTVAL FROM employees e",
        "SELECT employees.NEXTVAL FROM employees",
        "SELECT d.NEXTVAL FROM (SELECT 1 AS NEXTVAL FROM dual) d",
        "WITH e AS (SELECT 1 AS NEXTVAL FROM dual) SELECT e.NEXTVAL FROM e",
        "SELECT (SELECT e.NEXTVAL FROM dual) FROM employees e",
    ],
)
def test_oracle_relation_bound_nextval_columns_remain_allowed(query: str) -> None:
    result = DatabaseSecurity.analyze_sql_query(query, dialect="oracle")
    assert result["is_safe"] is True
    assert result["warnings"] == []


def test_oracle_nested_unresolved_nextval_sequence_remains_blocked() -> None:
    result = DatabaseSecurity.analyze_sql_query(
        "SELECT (SELECT my_seq.NEXTVAL FROM dual) FROM employees e",
        dialect="oracle",
    )
    assert result["is_safe"] is False
    assert result["warnings"] == [
        "Sequence advancement is prohibited by read-only policy"
    ]


def test_sqlserver_nolock_hint_remains_allowed() -> None:
    """Preserve the deliberately harmless SQL Server non-locking table hint."""
    result = DatabaseSecurity.analyze_sql_query(
        "SELECT * FROM users WITH (NOLOCK)",
        dialect="sqlserver",
    )

    assert result["is_safe"] is True
    assert result["warnings"] == []


@pytest.mark.parametrize("_dialect,query", SAFE_ANONYMOUS_FUNCTION_CASES)
def test_generic_schema_gate_accepts_union_of_safe_anonymous_functions(
    _dialect: str,
    query: str,
) -> None:
    """The pre-connection tool gate must accept every supported dialect allowlist entry."""
    assert ExecuteQueryArgs(query=query).query == query
    assert ExplainQueryArgs(query=query).query == query


@pytest.mark.parametrize(
    "dialect,query,warning",
    [
        pytest.param(
            "mysql",
            "SELECT AGE(created_at) FROM events",
            "Function age is not allowed: unapproved anonymous function",
            id="mysql-rejects-postgresql-age",
        ),
        pytest.param(
            "postgresql",
            "SELECT ISDATE('2024-01-01')",
            "Function isdate is not allowed: unapproved anonymous function",
            id="postgresql-rejects-sqlserver-isdate",
        ),
        pytest.param(
            "sqlserver",
            "SELECT NOW()",
            "Function now is not allowed: unapproved anonymous function",
            id="sqlserver-rejects-mysql-now",
        ),
        pytest.param(
            "mysql",
            "SELECT NUMTODSINTERVAL(1, 'DAY')",
            "Function numtodsinterval is not allowed: unapproved anonymous function",
            id="mysql-rejects-oracle-numtodsinterval",
        ),
    ],
)
def test_dialect_specific_anonymous_allowlists_are_not_interchangeable(
    dialect: str,
    query: str,
    warning: str,
) -> None:
    """Using the generic union at execution time would authorize the wrong dialect."""
    result = DatabaseSecurity.analyze_sql_query(query, dialect=dialect)

    assert result["is_safe"] is False
    assert result["warnings"] == [warning]


def test_parse_errors_are_stable_while_diagnostics_are_sanitized_and_correlated(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Returning or logging raw parser text would expose the submitted SQL."""
    bind_request_id("req_sql_policy")
    try:
        with caplog.at_level(logging.ERROR, logger="service.database.security"):
            result = DatabaseSecurity.analyze_sql_query(
                "SELECT 'sql-policy-secret",
                dialect="postgresql",
            )
    finally:
        clear_request_id()

    assert result["is_safe"] is False
    assert result["warnings"] == ["SQL could not be safely parsed"]
    record = caplog.records[-1]
    assert "analyze_sql_query" in record.getMessage()
    assert "SQL_PARSE_FAILED" in record.getMessage()
    assert "sql-policy-secret" not in record.getMessage()
    assert record.request_id == "req_sql_policy"
    assert record.exc_info is None


@dataclass
class _DatabaseBoundaryProbe:
    """External database boundary fake that records forbidden entry attempts."""

    attempts: int = 0

    def reject_entry(self, *_args, **_kwargs):
        self.attempts += 1
        raise AssertionError("database boundary reached before SQL policy rejection")


class _ConnectedContextSync:
    """Complete current-connection fake used by the explain execution path."""

    def __init__(self, db_type: str) -> None:
        self.db_type = db_type

    def get_connection(self, user_id: str) -> dict:
        assert user_id == "user-1"
        return {
            "connected": True,
            "db_type": self.db_type,
            "database": "analytics",
            "schema": "public",
        }


def test_human_execution_rejects_dangerous_function_before_database_boundary(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Removing the human dialect gate would enter the adapter/connection boundary."""
    boundary = _DatabaseBoundaryProbe()
    monkeypatch.setattr("service.database.adapters.get_adapter", boundary.reject_entry)
    monkeypatch.setattr(
        "service.database.connection_manager.get_connection_manager",
        boundary.reject_entry,
    )

    result = database_operations.execute_sql_query(
        {"db_type": "mysql", "database": "analytics"},
        "SELECT load_file('/etc/passwd')",
    )

    assert result == {
        "status": "error",
        "message": "Query blocked: Function load_file is prohibited: file access",
    }
    assert boundary.attempts == 0


@pytest.mark.parametrize("dialect,query,warning", STATEFUL_SELECT_CASES)
def test_human_execution_rejects_stateful_select_before_database_boundary(
    monkeypatch: pytest.MonkeyPatch,
    dialect: str,
    query: str,
    warning: str,
) -> None:
    """Human execution must enforce each stateful guard at the actual DB dialect."""
    boundary = _DatabaseBoundaryProbe()
    monkeypatch.setattr("service.database.adapters.get_adapter", boundary.reject_entry)
    monkeypatch.setattr(
        "service.database.connection_manager.get_connection_manager",
        boundary.reject_entry,
    )

    result = database_operations.execute_sql_query(
        {"db_type": dialect, "database": "analytics"},
        query,
    )

    assert result == {
        "status": "error",
        "message": f"Query blocked: {warning}",
    }
    assert boundary.attempts == 0


def test_ai_execution_rejects_dangerous_function_before_database_boundary(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Removing the AI execute dialect gate would open a tool database connection."""
    boundary = _DatabaseBoundaryProbe()
    monkeypatch.setattr("service.database.adapters.get_adapter", boundary.reject_entry)
    monkeypatch.setattr(ai_executor_module, "get_tool_connection", boundary.reject_entry)

    result = AIToolExecutor._execute_query_with_db_config(
        {"db_type": "postgresql", "database": "analytics"},
        {"db_type": "postgresql", "database": "analytics", "schema": "public"},
        "SELECT pg_read_file('/etc/passwd')",
        100,
    )

    assert result == {
        "status": "error",
        "message": (
            "Query blocked for security reasons: "
            "Function pg_read_file is prohibited: file access"
        ),
    }
    assert boundary.attempts == 0


@pytest.mark.parametrize("dialect,query,warning", STATEFUL_SELECT_CASES)
def test_ai_execution_rejects_stateful_select_before_database_boundary(
    monkeypatch: pytest.MonkeyPatch,
    dialect: str,
    query: str,
    warning: str,
) -> None:
    """AI execution must enforce each stateful guard at the actual DB dialect."""
    boundary = _DatabaseBoundaryProbe()
    monkeypatch.setattr("service.database.adapters.get_adapter", boundary.reject_entry)
    monkeypatch.setattr(ai_executor_module, "get_tool_connection", boundary.reject_entry)

    result = AIToolExecutor._execute_query_with_db_config(
        {"db_type": dialect, "database": "analytics"},
        {"db_type": dialect, "database": "analytics", "schema": "public"},
        query,
        100,
    )

    assert result == {
        "status": "error",
        "message": f"Query blocked for security reasons: {warning}",
    }
    assert boundary.attempts == 0


def test_ai_explain_rejects_dangerous_function_before_database_boundary(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Removing the explain dialect gate would hand dangerous SQL to the adapter."""
    boundary = _DatabaseBoundaryProbe()
    context_sync = _ConnectedContextSync("sqlserver")
    monkeypatch.setattr(
        "service.database.context_sync.get_default_context_sync",
        lambda: context_sync,
    )
    monkeypatch.setattr("service.database.adapters.get_adapter", boundary.reject_entry)
    monkeypatch.setattr(ai_executor_module, "get_tool_connection", boundary.reject_entry)

    result = AIToolExecutor._explain_query(
        "user-1",
        {"db_type": "sqlserver", "database": "analytics"},
        "SELECT xp_cmdshell('whoami')",
    )

    assert result == {
        "error": (
            "Query blocked for security reasons: "
            "Function xp_cmdshell is prohibited: external code execution"
        )
    }
    assert boundary.attempts == 0


@pytest.mark.parametrize("dialect,query,warning", STATEFUL_SELECT_CASES)
def test_ai_explain_rejects_stateful_select_before_database_boundary(
    monkeypatch: pytest.MonkeyPatch,
    dialect: str,
    query: str,
    warning: str,
) -> None:
    """AI EXPLAIN must enforce each stateful guard at the connected DB dialect."""
    boundary = _DatabaseBoundaryProbe()
    context_sync = _ConnectedContextSync(dialect)
    monkeypatch.setattr(
        "service.database.context_sync.get_default_context_sync",
        lambda: context_sync,
    )
    monkeypatch.setattr("service.database.adapters.get_adapter", boundary.reject_entry)
    monkeypatch.setattr(ai_executor_module, "get_tool_connection", boundary.reject_entry)

    result = AIToolExecutor._explain_query(
        "user-1",
        {"db_type": dialect, "database": "analytics"},
        query,
    )

    assert result == {
        "error": f"Query blocked for security reasons: {warning}",
    }
    assert boundary.attempts == 0


def test_execution_rechecks_actual_dialect_after_generic_tool_validation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Using only the schema union would let a PostgreSQL-only function reach MySQL."""
    query = "SELECT AGE(created_at) FROM events"
    assert ExecuteQueryArgs(query=query).query == query

    boundary = _DatabaseBoundaryProbe()
    monkeypatch.setattr("service.database.adapters.get_adapter", boundary.reject_entry)
    monkeypatch.setattr(
        "service.database.connection_manager.get_connection_manager",
        boundary.reject_entry,
    )

    result = database_operations.execute_sql_query(
        {"db_type": "mysql", "database": "analytics"},
        query,
    )

    assert result == {
        "status": "error",
        "message": (
            "Query blocked: Function age is not allowed: "
            "unapproved anonymous function"
        ),
    }
    assert boundary.attempts == 0
