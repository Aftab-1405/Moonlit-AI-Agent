"""Queries must run with the selected schema and an installed timeout."""

from contextlib import contextmanager

import pytest
from psycopg2.sql import SQL, Composed, Identifier

from service.database.ai_tool_executor import AIToolExecutor
from service.database.operations import execute_sql_query

QUERY = "SELECT id FROM orders"


class Connection:
    def __init__(self, *, reject_timeout=False):
        self.reject_timeout = reject_timeout
        self._call_timeout = None
        self.cursor_instance = Cursor(self)

    @property
    def call_timeout(self):
        return self._call_timeout

    @call_timeout.setter
    def call_timeout(self, value):
        if self.reject_timeout:
            raise RuntimeError("driver cannot install timeout")
        self._call_timeout = value

    def cursor(self):
        return self.cursor_instance


class Cursor:
    description = [("id", "int")]
    column_names = ["id"]

    def __init__(self, connection):
        self.connection = connection
        self.statements = []
        self.closed = False
        self.reject_sql_timeout = False

    def execute(self, statement):
        self.statements.append(statement)
        if self.reject_sql_timeout and isinstance(statement, str) and statement.startswith("SET"):
            raise RuntimeError("timeout permission denied")

    def fetchone(self):
        return (1,)

    def fetchmany(self, _limit):
        return [(7,)]

    def close(self):
        self.closed = True


@pytest.fixture
def database_boundary(monkeypatch):
    connection = Connection()

    class Manager:
        @contextmanager
        def get_cursor(self, _config):
            yield connection.cursor_instance

    @contextmanager
    def tool_connection(_config):
        yield connection

    monkeypatch.setattr("service.database.connection_manager.get_connection_manager", lambda: Manager())
    monkeypatch.setattr("service.database.ai_tool_executor.get_tool_connection", tool_connection)
    return connection


def execute(path, config):
    if path == "manual":
        return execute_sql_query(config, QUERY, timeout_seconds=30)
    return AIToolExecutor._execute_query_with_db_config(config, {"schema": "stale_schema"}, QUERY, 10)


@pytest.mark.parametrize("path", ["manual", "ai"])
@pytest.mark.parametrize("db_type", ["mysql", "postgresql", "sqlserver", "oracle"])
def test_timeout_install_failure_prevents_user_query(database_boundary, path, db_type):
    connection = database_boundary
    connection.reject_timeout = True
    connection.cursor_instance.reject_sql_timeout = True

    result = execute(path, {"db_type": db_type, "database": "sales"})

    assert QUERY not in connection.cursor_instance.statements
    assert result["status"] == "error"
    if path == "ai":
        assert connection.cursor_instance.closed


def test_missing_oracle_connection_prevents_manual_query(database_boundary):
    cursor = database_boundary.cursor_instance
    cursor.connection = None

    result = execute("manual", {"db_type": "oracle", "database": "sales"})

    assert QUERY not in cursor.statements
    assert result["status"] == "error"


@pytest.mark.parametrize("path", ["manual", "ai"])
def test_missing_timeout_mechanism_prevents_query(database_boundary, monkeypatch, path):
    monkeypatch.setattr(
        "service.database.adapters.mysql_adapter.MySQLAdapter.get_set_timeout_sql",
        lambda *_args, **_kwargs: None,
    )

    result = execute(path, {"db_type": "mysql"})

    assert QUERY not in database_boundary.cursor_instance.statements
    assert result["status"] == "error"


@pytest.mark.parametrize("path", ["manual", "ai"])
def test_each_postgres_borrow_uses_selected_schema(database_boundary, path):
    cursor = database_boundary.cursor_instance
    for schema in ("TenantOne", "public"):
        cursor.statements.clear()
        result = execute(path, {"db_type": "postgresql", "schema": schema})

        assert result["status"] == "success"
        assert cursor.statements[-2:] == [Composed([SQL("SET search_path TO "), Identifier(schema)]), QUERY]


def test_ai_default_dialect_resets_schema_to_public(database_boundary):
    result = execute("ai", {"database": "sales"})

    assert result["status"] == "success"
    assert database_boundary.cursor_instance.statements[-2:] == [
        Composed([SQL("SET search_path TO "), Identifier("public")]),
        QUERY,
    ]


@pytest.mark.parametrize("path", ["manual", "ai"])
@pytest.mark.parametrize("schema", ["public; SELECT 1", "tenant.other", "bad\n"])
def test_invalid_selected_schema_prevents_query(database_boundary, path, schema):
    result = execute(path, {"db_type": "postgresql", "schema": schema})

    assert QUERY not in database_boundary.cursor_instance.statements
    assert result["status"] == "error"


@pytest.mark.parametrize("path", ["manual", "ai"])
def test_oracle_timeout_installed_on_success(database_boundary, path):
    result = execute(path, {"db_type": "oracle", "database": "sales"})

    assert result["status"] == "success"
    assert database_boundary.call_timeout == 30000
    assert database_boundary.cursor_instance.statements[-1] == QUERY
