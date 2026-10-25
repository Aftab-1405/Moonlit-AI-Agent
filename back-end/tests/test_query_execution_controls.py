"""Synthetic driver controls: no network/database fixture required."""

import asyncio
from contextlib import contextmanager
from threading import Event, Thread
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from service.database.adapters.mysql_adapter import MySQLAdapter
from service.database.adapters.sqlserver_adapter import SQLServerAdapter
from service.database.query_guards import QueryCancellation, query_execution_cursor, set_query_timeout


@pytest.mark.asyncio
async def test_ai_tool_cancellation_reaches_its_owned_connection(monkeypatch):
    from langgraph_orchestration import tools as tool_module

    started, stopped = Event(), Event()
    connection = SimpleNamespace(cancel=stopped.set)

    def execute(_uid, _query, _max_rows, db_config=None, cancellation=None):
        assert cancellation is not None
        with cancellation.bind(connection, "postgresql"):
            started.set()
            assert stopped.wait(3), "Cancelled tool left its database work running"
        return {"success": True}

    async def pipeline(_name, _args, _config, executor):
        return await asyncio.to_thread(executor, {"query": "SELECT fixture"}, "fixture-owner", {}, 1)

    monkeypatch.setattr(tool_module.DBTools, "_execute_query", execute)
    monkeypatch.setattr(tool_module, "_execute_tool", pipeline)
    task = asyncio.create_task(tool_module.execute_query.ainvoke({"query": "SELECT fixture"}, config={}))
    assert await asyncio.to_thread(started.wait, 1)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert stopped.is_set()


def test_mysql_unread_results_disconnect_without_drain():
    cursor = Mock()
    connection = Mock(unread_result=True, _cnx=None)
    del connection._cnx
    connection.cursor.return_value = cursor
    with MySQLAdapter().get_cursor(connection, buffered=False) as result:
        assert result is cursor
    connection.cursor.assert_called_once_with(dictionary=False, buffered=False)
    connection.disconnect.assert_called_once()
    connection.commit.assert_not_called()
    connection.rollback.assert_not_called()
    cursor.fetchall.assert_not_called()


def test_mysql_read_error_discards_unread_socket():
    connection = Mock(unread_result=True, _cnx=None)
    del connection._cnx
    with pytest.raises(ValueError):
        with MySQLAdapter().get_cursor(connection, buffered=False):
            raise ValueError("fetch failed")
    connection.disconnect.assert_called_once()
    connection.rollback.assert_not_called()


def test_mysql_complete_result_commits_and_returns_disconnected_slot():
    connection = Mock(unread_result=False)
    adapter = MySQLAdapter()
    with adapter.get_cursor(connection, buffered=False):
        pass
    connection.commit.assert_called_once()
    connection.disconnect.assert_not_called()
    connection.is_connected.return_value = False
    adapter.return_connection_to_pool(None, connection)
    connection.close.assert_called_once()


@pytest.mark.parametrize("db_type", ["mysql", "sqlserver"])
def test_unsupported_driver_never_claims_server_cancel(db_type):
    connection = Mock()
    token = QueryCancellation()
    with token.bind(connection, db_type):
        token.cancel()
    connection.cancel.assert_not_called()


@pytest.mark.parametrize("db_type", ["postgresql", "oracle"])
def test_cancel_ownership_ends_before_connection_reuse(db_type):
    connection = Mock()
    token = QueryCancellation()
    with token.bind(connection, db_type):
        token.cancel()
    connection.cancel.assert_called_once()
    token.cancel()
    connection.cancel.assert_called_once()
    with pytest.raises(RuntimeError, match="cancelled"):
        with token.bind(connection, db_type):
            pass


def test_unregister_waits_for_inflight_cancel_before_release():
    entered, finish, unregistered = Event(), Event(), Event()

    def cancel():
        entered.set()
        assert finish.wait(2)

    token = QueryCancellation()
    connection = SimpleNamespace(cancel=cancel)
    ownership = token.bind(connection, "postgresql")
    ownership.__enter__()
    cancelling = Thread(target=token.cancel)
    cancelling.start()
    assert entered.wait(2)

    def release():
        ownership.__exit__(None, None, None)
        unregistered.set()

    releasing = Thread(target=release)
    releasing.start()
    assert not unregistered.wait(0.03)
    finish.set()
    cancelling.join(2)
    releasing.join(2)
    assert unregistered.is_set()


@pytest.mark.parametrize("fail", [False, True])
def test_oracle_call_timeout_reset_on_success_and_error(fail):
    connection = SimpleNamespace(call_timeout=30000)

    @contextmanager
    def cursor_context(*args, **kwargs):
        yield Mock()

    adapter = SimpleNamespace(db_type="oracle", get_cursor=cursor_context)
    try:
        with query_execution_cursor(adapter, connection):
            if fail:
                raise ValueError("query failure")
    except ValueError:
        assert fail
    assert connection.call_timeout == 0


def test_postgresql_timeout_resets_before_cursor_release():
    cursor = Mock()

    @contextmanager
    def cursor_context(*args, **kwargs):
        yield cursor
        cursor.execute.assert_called_once_with("RESET statement_timeout")

    adapter = SimpleNamespace(db_type="postgresql", get_cursor=cursor_context)
    with query_execution_cursor(adapter, Mock()):
        pass


def test_sqlserver_lock_timeout_is_not_execution_deadline():
    from service.database.adapters.sqlserver_adapter import Config

    adapter = SQLServerAdapter()
    cursor = Mock()
    assert adapter.get_set_timeout_sql(30) is None
    set_query_timeout(adapter, cursor, Mock(), Config.QUERY_TIMEOUT_SECONDS)
    cursor.execute.assert_not_called()
    details = set_query_timeout(adapter, cursor, Mock(), Config.QUERY_TIMEOUT_SECONDS + 1)
    assert details["requested_timeout_seconds"] == Config.QUERY_TIMEOUT_SECONDS + 1
    assert details["effective_timeout_seconds"] == Config.QUERY_TIMEOUT_SECONDS
    assert details["timeout_scope"] == "driver-configured"
    cursor.execute.assert_not_called()


def test_mysql_discard_clears_physical_unread_flag_for_reconnect():
    physical = Mock(unread_result=True)
    wrapper = SimpleNamespace(_cnx=physical)
    MySQLAdapter._discard_unread_connection(wrapper)
    physical.disconnect.assert_called_once()
    assert physical.unread_result is False
    assert not hasattr(wrapper, "unread_result")


@pytest.mark.asyncio
async def test_http_disconnect_cancels_only_request_owned_driver(monkeypatch):
    import asyncio
    import inspect

    from api_contract.database import RunQueryRequest
    from controller import database_controller

    active, other = Mock(), Mock()
    bound, finished = asyncio.Event(), asyncio.Event()

    async def execute(*args, cancellation, **kwargs):
        with cancellation.bind(active, "postgresql"):
            bound.set()
            await asyncio.wait_for(finished.wait(), 2)
        return {"status": "error"}

    active.cancel.side_effect = finished.set

    async def disconnected():
        await bound.wait()
        return True

    async def threadpool(function, *args, **kwargs):
        value = function(*args, **kwargs)
        return await value if inspect.isawaitable(value) else value

    monkeypatch.setattr(database_controller, "run_in_threadpool", threadpool)
    monkeypatch.setattr(database_controller.DatabaseService, "execute_query", execute)
    monkeypatch.setattr(database_controller, "_raise_service_error", lambda result: None)
    monkeypatch.setattr(database_controller, "_normalize_query_response", lambda result: {})
    monkeypatch.setattr(database_controller, "ApiSuccess", lambda **kwargs: kwargs)
    await database_controller.run_sql_query(
        RunQueryRequest(sql_query="SELECT 1"),
        SimpleNamespace(is_disconnected=disconnected),
        db_config={"db_type": "postgresql"},
        user={"uid": "owner"},
    )
    active.cancel.assert_called_once()
    other.cancel.assert_not_called()


@pytest.mark.parametrize("fail", [False, True])
def test_manager_unregisters_before_cursor_cleanup_and_pool_release(fail):
    from service.database.connection_manager import ConnectionManager

    events = []
    token = QueryCancellation()
    connection = Mock()

    @contextmanager
    def cursor_context(*args, **kwargs):
        try:
            yield Mock()
        finally:
            token.cancel()  # A late disconnect during cursor cleanup.
            events.append("cursor_closed")

    adapter = SimpleNamespace(db_type="oracle", get_cursor=cursor_context)
    manager = ConnectionManager.__new__(ConnectionManager)
    manager._get_pool_key = lambda config: "pool"
    manager._get_or_create_pool = lambda *args: None
    manager._adapters = {"pool": adapter}
    manager.get_connection = lambda config: connection
    manager.return_connection = lambda *args: events.append("released")
    try:
        with manager.get_cursor({"db_type": "oracle"}, buffered=False, cancellation=token):
            if fail:
                raise ValueError("query failure")
    except ValueError:
        assert fail
    assert events == ["cursor_closed", "released"]
    connection.cancel.assert_not_called()
    if fail:
        assert connection._failed is True


def test_unsupported_deadline_remains_honest_at_public_error_boundary():
    from core.errors import UnsupportedQueryTimeout, public_database_error, public_error_for_code

    public = public_database_error(UnsupportedQueryTimeout("internal detail"))
    assert public.code == "DB_TIMEOUT_UNSUPPORTED"
    assert "configured query timeout" in public_error_for_code(public.code).message


def test_oracle_query_cursor_fetches_numbers_as_decimal_without_global_defaults():
    from decimal import Decimal

    import oracledb

    cursor = Mock(arraysize=100)
    connection = Mock(call_timeout=1000)

    @contextmanager
    def get_cursor(*_args, **_kwargs):
        yield cursor

    adapter = SimpleNamespace(db_type="oracle", get_cursor=get_cursor)
    with query_execution_cursor(adapter, connection):
        handler = cursor.outputtypehandler
        handler(cursor, SimpleNamespace(type_code=oracledb.DB_TYPE_NUMBER))
        cursor.var.assert_called_once_with(Decimal, arraysize=100)
        assert handler(cursor, SimpleNamespace(type_code=oracledb.DB_TYPE_BINARY_DOUBLE)) is None
    assert connection.call_timeout == 0
