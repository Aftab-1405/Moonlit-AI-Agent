"""Offline review evidence; run with back-end/.venv/bin/python from repo root.

Imports actual application modules. Network destinations and all database driver
connections are intercepted. No Firebase app or production credential is used.
"""
import os
import sys
from pathlib import Path

os.environ.update(APP_ENV="testing", PYTHON_DOTENV_DISABLED="1", DEV_AUTH_BYPASS="false",
    RATELIMIT_ENABLED="false", VAMP_MEMORY_ENABLED="false", LLM_RATELIMIT_ENABLED="false",
    USER_QUOTA_ENABLED="false", SECRET_KEY="test-only-secret-key-do-not-use-in-production-32chars",
    LOG_FILE="/tmp/moonlit-db-evidence.log", AUDIT_LOG_FILE="/tmp/moonlit-db-audit.log")
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "back-end"))
import json
import asyncio
import httpx
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import patch, AsyncMock

from fastapi import FastAPI
import oracledb
from controller import database_controller as routes
from dependencies import get_current_user, require_authenticated_db_config
from service.database import connection_handlers as handlers
from service.database.connection_service import ConnectionService
from service.database.operations import DatabaseOperations, DatabaseOperationError
from service.database.adapters.oracle_adapter import OracleAdapter
from service.database.adapters.sqlserver_adapter import SQLServerAdapter
from service.database.adapters.postgresql_adapter import PostgreSQLAdapter
from service.database.mysql_utils import get_mysql_connect_kwargs

def emit(name, **data):
    print(json.dumps({"case": name, **data}, default=str))

def post(config, path, payload, *, authenticated=True):
    app = FastAPI()
    app.include_router(routes.router, prefix="/api/v1")
    async def user():
        return {"uid": "review-user"}
    async def database():
        return config
    if authenticated:
        app.dependency_overrides[get_current_user] = user
    app.dependency_overrides[require_authenticated_db_config] = database
    async def inline_threadpool(function, *args, **kwargs):
        # Review does not assess thread scheduling. Avoid the sandbox runtime's
        # AnyIO worker wakeup hang while retaining route/service/model execution.
        return function(*args, **kwargs)
    async def run():
        with patch.object(routes, "run_in_threadpool", inline_threadpool):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://review") as c:
                return await c.post(path, json=payload)
    return asyncio.run(run())

def oracle_failover():
    # Real oracledb parser confirms both public first destination and private
    # failover destination. Fake pool only prevents actual outbound TCP.
    checked, driver_hosts = [], []
    adapter = OracleAdapter()
    def dns(host, port, *args, **kwargs):
        checked.append(host)
        return [(2, 1, 6, "", ("8.8.8.8", 0))]
    def pool(**kwargs):
        params = oracledb.ConnectParams()
        params.parse_connect_string(kwargs["dsn"])
        driver_hosts.extend(params.host if isinstance(params.host, list) else [params.host])
        return SimpleNamespace(min=2, max=10, opened=2)
    class Manager:
        @contextmanager
        def get_connection_context(self, config):
            adapter.create_connection_pool(config)
            yield object()
        @contextmanager
        def get_cursor(self, config):
            yield SimpleNamespace(execute=lambda *a: None, fetchall=lambda: [])
    payload = {"db_type": "oracle", "connection_string": "review/test@8.8.8.8:1521,127.0.0.1:1521/ORCL"}
    with patch("socket.getaddrinfo", dns), patch("oracledb.create_pool", pool), \
         patch("service.database.connection_manager.get_connection_manager", return_value=Manager()), \
         patch.object(OracleAdapter, "validate_connection", return_value=True), \
         patch.object(ConnectionService, "_sync_context_from_result"), \
         patch.object(routes, "update_session_data", new=AsyncMock()):
        response = post({}, "/api/v1/connect_db", payload)
        denied = post({}, "/api/v1/connect_db", payload, authenticated=False)
        private_only = post({}, "/api/v1/connect_db", {"db_type": "oracle", "connection_string": "review/test@127.0.0.1:1521/ORCL"})
    assert response.status_code == 200, response.text
    assert checked == ["8.8.8.8"] and driver_hosts == ["8.8.8.8", "127.0.0.1"]
    assert denied.status_code == 401 and private_only.status_code == 400
    emit("oracle_failover_destination_bypass", http_status=response.status_code,
         validated_hosts=checked, actual_driver_parsed_hosts=driver_hosts,
         unauthenticated_control_status=denied.status_code, private_only_control_status=private_only.status_code)

def selection_failure():
    config = {"db_type": "mysql", "host": "8.8.8.8", "user": "review", "database": "old"}
    updater = AsyncMock()
    with patch.object(DatabaseOperations, "get_tables", side_effect=DatabaseOperationError("offline denied")), \
         patch.object(ConnectionService, "_sync_context_from_result"), \
         patch.object(routes, "update_session_data", new=updater):
        response = post(config, "/api/v1/select_database", {"database": "inaccessible"})
    assert response.status_code == 200, response.text
    stored = updater.call_args.args[1]["db_config"]["database"]
    assert stored == "inaccessible"
    emit("failed_database_selection_accepted", http_status=response.status_code,
         selected=response.json()["data"]["selected_database"], saved_database=stored)

def dsn_database_override():
    mysql = get_mysql_connect_kwargs({"connection_string": "mysql://review:test@8.8.8.8/source",
                                     "database": "target"})
    sqlserver = SQLServerAdapter().create_connection_pool({
        "connection_string": "Server=8.8.8.8;Database=source;UID=review;PWD=test", "database": "target"})
    pg_options = []
    def pg_pool(**kwargs):
        from psycopg2.extensions import parse_dsn
        pg_options.append(parse_dsn(kwargs["dsn"])["dbname"])
        return object()
    with patch("service.database.adapters.postgresql_adapter.pool.ThreadedConnectionPool", pg_pool):
        PostgreSQLAdapter().create_connection_pool({"connection_string": "host=8.8.8.8 dbname=source user=review", "database": "target"})
    assert mysql["database"] == sqlserver["database"] == "source"
    assert pg_options == ["target"]
    emit("dsn_overrides_selected_database", displayed_database="target",
         mysql_driver_database=mysql["database"], sqlserver_driver_database=sqlserver["database"],
         postgresql_control=pg_options[0])

def row_count_schema():
    import sqlite3
    calls = []
    connection = sqlite3.connect(":memory:")
    connection.executescript("""
        ATTACH ':memory:' AS dbo;
        ATTACH ':memory:' AS public;
        CREATE TABLE dbo.orders (id INTEGER);
        CREATE TABLE public.orders (id INTEGER);
        INSERT INTO dbo.orders VALUES (1),(2),(3);
        INSERT INTO public.orders VALUES (1),(2),(3),(4),(5),(6),(7);
    """)
    class Cursor:
        def __init__(self):
            self.cursor = connection.cursor()
        def execute(self, query):
            calls.append(query)
            self.cursor.execute(query)
        def fetchall(self):
            return self.cursor.fetchall()
    class Manager:
        @contextmanager
        def get_cursor(self, config):
            yield Cursor()
    with patch("service.database.connection_manager.get_connection_manager", return_value=Manager()):
        result = DatabaseOperations.get_table_row_counts({"db_type": "sqlserver", "database": "sales"}, ["orders"], "sales")
    assert "[public].[orders]" in calls[0]
    assert result[0]["row_count"] == 7
    emit("sqlserver_default_count_schema", query=calls[0], returned=result, intended_dbo_rows=3,
         limit="actual generated query executed SQLite attached dbo/public schemas; no SQLServer service")
    connection.close()

if __name__ == "__main__":
    oracle_failover()
    selection_failure()
    dsn_database_override()
    row_count_schema()
