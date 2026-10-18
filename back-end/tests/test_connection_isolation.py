"""Connection credentials, tenant ownership, and destination validation."""

import json
import socket
from contextlib import contextmanager
from types import SimpleNamespace

import pytest
from psycopg2.extensions import parse_dsn

from service.database import connection_handlers as handlers
from service.database.adapters.sqlserver_adapter import SQLServerAdapter
from service.database.connection_manager import ConnectionManager
from service.database.connection_service import ConnectionService
from service.database.database_service import DatabaseService


@pytest.mark.parametrize(
    "change", [{"password": "wrong"}, {"_pool_owner": "other"}, {"service_name": "other"}, {"sslmode": "require"}]
)
def test_pool_identity_includes_credentials_owner_and_options(change):
    manager = object.__new__(ConnectionManager)
    config = {"db_type": "oracle", "host": "db.example", "user": "reader", "password": "secret", "_pool_owner": "owner"}
    assert manager._get_pool_key(config) != manager._get_pool_key({**config, **change})


def test_connection_service_binds_owner_before_first_pool_borrow(monkeypatch):
    seen = []

    @contextmanager
    def borrow(config):
        seen.append(dict(config))
        yield object()

    monkeypatch.setattr(handlers, "_validate_host", lambda host: None)
    monkeypatch.setattr(
        "service.database.connection_manager.get_connection_manager",
        lambda: SimpleNamespace(get_connection_context=borrow),
    )
    monkeypatch.setattr(
        "service.database.adapters.get_adapter", lambda kind: SimpleNamespace(validate_connection=lambda conn: True)
    )
    monkeypatch.setattr(
        "service.database.operations.DatabaseOperations.get_databases",
        lambda config: {"status": "success", "databases": []},
    )
    monkeypatch.setattr(ConnectionService, "_sync_context_from_result", lambda *args: None)
    result = ConnectionService.connect_database(
        {"db_type": "mysql", "host": "db.example", "username": "reader", "password": "secret"}, "owner"
    )
    assert seen[0].get("_pool_owner") == "owner"
    assert result["db_config"]["_pool_owner"] == "owner"


@pytest.mark.asyncio
async def test_authenticated_config_overrides_stale_owner(monkeypatch):
    import dependencies

    original = {"db_type": "mysql", "_pool_owner": "other"}

    async def cached(request):
        return original

    monkeypatch.setattr(dependencies, "_get_cached_db_config", cached)
    request = SimpleNamespace(state=SimpleNamespace())
    config = await dependencies.get_authenticated_db_config(request, {"uid": "owner"})
    assert config["_pool_owner"] == "owner"
    assert original["_pool_owner"] == "other"


@pytest.mark.parametrize(
    "config",
    [
        {"db_type": "sqlserver", "host": "db.example", "user": "reader", "password": "secret"},
        {"db_type": "sqlserver", "connection_string": "Server=db.example;Database=reports;UID=reader;PWD=secret"},
    ],
)
def test_sqlserver_pool_does_not_mutate_session_config(config):
    before = dict(config)
    pool = SQLServerAdapter().create_connection_pool(config)
    assert config == before
    assert json.loads(json.dumps(config)) == before
    assert pool is not config
    assert pool["_open_connections"] == set()


@pytest.fixture
def captured_pg_pool(monkeypatch):
    configs = []

    def resolve(host, *args):
        addresses = {"public.example": "8.8.8.8", "other.example": "1.1.1.1"}
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (addresses.get(host, host), 0))]

    @contextmanager
    def borrow(config):
        configs.append(dict(config))
        yield object()

    monkeypatch.setattr(socket, "getaddrinfo", resolve)
    monkeypatch.setattr(
        "service.database.connection_manager.get_connection_manager",
        lambda: SimpleNamespace(get_connection_context=borrow),
    )
    monkeypatch.setattr(
        "service.database.adapters.get_adapter", lambda kind: SimpleNamespace(validate_connection=lambda conn: True)
    )
    return configs


@pytest.mark.parametrize(
    "dsn",
    [
        "postgresql://u:p@public.example/db?host=127.0.0.1",
        "postgresql://u:p@public.example/db?hostaddr=127.0.0.1",
        "postgresql://u:p@public.example/db?host=public.example,127.0.0.1",
        "postgresql://u:p@public.example/db?host=%2Fvar%2Frun%2Fpostgresql",
        "postgresql://u:p@public.example/db?service=internal",
    ],
)
def test_postgresql_rejects_effective_private_destinations(dsn, captured_pg_pool):
    result = handlers.connect_remote_postgresql(dsn)
    assert result["status"] == "error"
    assert captured_pg_pool == []


def test_postgresql_pins_validated_addresses_and_preserves_tls(captured_pg_pool):
    result = handlers.connect_remote_postgresql("postgresql://u:p@public.example,other.example/db?sslmode=verify-full")
    assert result["status"] == "connected"
    options = parse_dsn(captured_pg_pool[0]["connection_string"])
    assert options["host"] == "public.example,other.example"
    assert options["hostaddr"] == "8.8.8.8,1.1.1.1"
    assert options["sslmode"] == "verify-full"
    assert options["dbname"] == "db"


def test_switch_database_preserves_normalized_dsn_owner_and_schema(monkeypatch, captured_pg_pool):
    connected = handlers.connect_remote_postgresql(
        "postgresql://u:p@public.example/db?sslmode=verify-full", pool_owner="owner"
    )
    config = {**connected["db_config"], "schema": "reporting"}
    monkeypatch.setattr(DatabaseService, "_fetch_tables", lambda *args: [])
    monkeypatch.setattr(DatabaseService, "_update_context", lambda *args: None)
    monkeypatch.setattr(ConnectionService, "_sync_context_from_result", lambda *args: None)
    result = DatabaseService.switch_remote_database(config, "other", "owner")
    assert result["status"] in {"connected", "success"}
    next_config = captured_pg_pool[-1]
    assert parse_dsn(next_config["connection_string"])["dbname"] == "other"
    assert parse_dsn(next_config["connection_string"])["hostaddr"] == "8.8.8.8"
    assert next_config["_pool_owner"] == "owner"
    assert next_config["schema"] == "reporting"


@pytest.mark.parametrize("database", ["sales reports", "分析", "sales?ssl_disabled=true"])
def test_mysql_database_switch_roundtrips_name_without_injecting_options(monkeypatch, captured_pg_pool, database):
    from service.database.mysql_utils import parse_mysql_connection_string

    monkeypatch.setattr(DatabaseService, "_fetch_tables", lambda *args: [])
    config = {
        "db_type": "mysql",
        "connection_string": "mysql://u:p@public.example/old?sslmode=require",
        "_pool_owner": "owner",
    }
    result = DatabaseService.switch_remote_database(config, database)
    assert result["status"] == "success"
    connection_string = captured_pg_pool[-1]["connection_string"]
    assert parse_mysql_connection_string(connection_string)["database"] == database
    assert handlers._parse_connection_string(connection_string)["database"] == database
    assert connection_string.endswith("?sslmode=require")


def test_postgres_pool_uses_selected_database_with_pinned_dsn(monkeypatch):
    from service.database.adapters import postgresql_adapter

    calls = []
    monkeypatch.setattr(postgresql_adapter.pool, "ThreadedConnectionPool", lambda **kwargs: calls.append(kwargs))
    config = {
        "db_type": "postgresql",
        "database": "selected",
        "connection_string": "host=db.example hostaddr=8.8.8.8 dbname=original sslmode=verify-full",
    }
    postgresql_adapter.PostgreSQLAdapter().create_connection_pool(config)
    options = parse_dsn(calls[0]["dsn"])
    options.update({key: value for key, value in calls[0].items() if key in {"dbname", "database"}})
    assert options.get("database", options["dbname"]) == "selected"
    assert options["hostaddr"] == "8.8.8.8"
    assert options["sslmode"] == "verify-full"
