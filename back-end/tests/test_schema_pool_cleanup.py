"""Exercise real pool manager, PostgreSQL adapter, and cleanup routes with a tracked driver pool."""

from datetime import datetime, timezone
from types import SimpleNamespace

import httpx
import pytest
from fastapi import FastAPI

from service.database.connection_manager import ConnectionManager
from service.database.database_service import DatabaseService


@pytest.fixture
def pools(monkeypatch):
    from service.database import connection_manager
    from service.database.adapters import postgresql_adapter

    created = []

    class Pool:
        def __init__(self, **kwargs):
            self.closed = False
            self.fail_close = False
            self.borrowed = 0
            self.conn = SimpleNamespace(
                cursor=lambda: SimpleNamespace(
                    execute=lambda *args: None, fetchall=lambda: [("orders",)], close=lambda: None
                ),
                commit=lambda: None,
                rollback=lambda: None,
            )
            created.append(self)

        def getconn(self):
            assert not self.closed
            self.borrowed += 1
            return self.conn

        def putconn(self, conn):
            self.borrowed -= 1

        def closeall(self):
            if self.fail_close:
                raise RuntimeError("driver close failed")
            assert self.borrowed == 0
            self.closed = True

    monkeypatch.setattr(postgresql_adapter.pool, "ThreadedConnectionPool", Pool)
    monkeypatch.setattr(ConnectionManager, "_start_cleanup_thread", lambda self: None)
    manager = ConnectionManager()
    monkeypatch.setattr(connection_manager, "get_connection_manager", lambda: manager)
    monkeypatch.setattr(
        "service.database.context_sync.get_default_context_sync",
        lambda: SimpleNamespace(clear_connection=lambda uid: None),
    )
    return manager, created


def switched_config(manager):
    config = dict(
        db_type="postgresql",
        host="db.example",
        user="reader",
        password="secret",
        database="reports",
        _pool_owner="user-1",
    )
    with manager.get_connection_context(config):
        pass
    for schema in ["public", "sales", "public"]:
        result = DatabaseService.select_schema(config, schema)
        assert result["status"] == "success"
        config = result["db_config"]
    return config


def test_schema_switch_reuses_pool_and_disconnect_closes_it(pools):
    manager, created = pools
    config = switched_config(manager)
    assert len(created) == 1
    assert created[0].borrowed == 0
    assert DatabaseService.disconnect(config)["status"] == "success"
    assert all(pool.closed for pool in created)
    assert not manager._pools
    assert DatabaseService.disconnect(config)["status"] == "success"


@pytest.mark.asyncio
@pytest.mark.parametrize("fail_close", [False, True])
async def test_account_route_closes_switched_pool_before_erasure(pools, monkeypatch, fail_close):
    from controller import user_dashboard_controller as controller
    from core.account_activity import AccountActivityMiddleware
    from dependencies import get_current_user
    from service.dashboard.account_deletion import AccountDeletionService

    manager, created = pools
    config = switched_config(manager)
    for pool in created:
        pool.fail_close = fail_close
    erased = []

    async def value(result):
        return result

    async def direct(fn, *args, **kwargs):
        return fn(*args, **kwargs)

    async def erase(uid):
        assert all(pool.closed for pool in created)
        assert not manager._pools
        erased.append(uid)
        return {"deleted_conversations": 0}

    monkeypatch.setattr(controller, "run_in_threadpool", direct)
    monkeypatch.setattr(controller, "verify_csrf_token", lambda request: None)
    monkeypatch.setattr(
        controller.auth,
        "verify_session_cookie",
        lambda *args, **kwargs: {"uid": "user-1", "auth_time": datetime.now(timezone.utc).timestamp()},
    )
    monkeypatch.setattr(controller, "get_session_data", lambda request: value({"db_config": config}))
    monkeypatch.setattr(controller, "get_all_user_session_state", lambda uid: value([{"db_config": config}]))
    monkeypatch.setattr(controller, "clear_all_user_session_state", lambda uid: value(None))
    monkeypatch.setattr(controller, "clear_session_state", lambda request: value(None))
    monkeypatch.setattr(AccountDeletionService, "delete_user", erase)
    app = FastAPI()
    app.add_middleware(AccountActivityMiddleware)
    app.state.user_quota = SimpleNamespace(delete_user_usage=lambda uid: value(None))
    app.include_router(controller.account_router, prefix="/api/v1")

    async def authenticated_user():
        return {"uid": "user-1"}

    app.dependency_overrides[get_current_user] = authenticated_user
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
        cookies={controller.Config.SESSION_COOKIE_NAME: "fresh-session"},
    ) as client:
        response = await client.delete("/api/v1/user/account")
        if fail_close:
            assert response.status_code == 503
            assert not erased
            assert manager._pools  # Retain the pool so cleanup can be retried.
            for pool in created:
                pool.fail_close = False
            response = await client.delete("/api/v1/user/account")
    assert response.status_code == 200
    assert erased == ["user-1"]
    assert all(pool.closed for pool in created)


@pytest.mark.parametrize(
    "change",
    [
        {"_pool_owner": "other-user"},
        {"password": "rotated"},
        {"database": "other-database"},
        {"sslmode": "verify-full"},
    ],
)
def test_schema_independent_identity_preserves_connection_isolation(pools, change):
    manager, created = pools
    config = switched_config(manager)
    other = {**config, **change}
    with manager.get_connection_context(other):
        pass
    assert len(created) == 2
    assert DatabaseService.disconnect(config)["status"] == "success"
    assert created[0].closed and not created[1].closed
    assert DatabaseService.disconnect(other)["status"] == "success"
    assert all(pool.closed for pool in created)


def test_disconnect_retains_failed_pool_for_retry(pools):
    manager, created = pools
    config = switched_config(manager)
    created[0].fail_close = True
    assert DatabaseService.disconnect(config)["status"] == "error"
    assert not created[0].closed and manager._pools
    created[0].fail_close = False
    assert DatabaseService.disconnect(config)["status"] == "success"
    assert created[0].closed and not manager._pools
