"""ASGI regressions for authenticated access to cached database metadata."""

from __future__ import annotations

import copy
import re
import time
from dataclasses import dataclass
from typing import Any

import httpx
import pytest
from firebase_admin.auth import RevokedSessionCookieError

import dependencies
from config import get_config
from service.database.database_service import DatabaseService

Config = get_config()

SESSION_COOKIE = "verified-session-cookie"
CSRF_TOKEN = "matching-csrf-token"
DB_CONFIG = {
    "db_type": "postgresql",
    "database": "moonlit",
    "host": "database.internal",
    "port": 5432,
    "username": "metadata-owner",
    "password": "never-expose-this",
    "is_remote": True,
    "schema": "public",
}
INITIAL_SESSION_STATE = {
    "db_config": DB_CONFIG,
    "db_config_last_closed_at": None,
    "db_config_last_used_at": 90.0,
    "session_active_at": 100.0,
}
EXPECTED_SECURITY_HEADERS = {
    "x-content-type-options": Config.SECURITY_HEADER_CONTENT_TYPE_OPTIONS,
    "x-frame-options": Config.SECURITY_HEADER_FRAME_OPTIONS,
    "x-xss-protection": Config.SECURITY_HEADER_XSS_PROTECTION,
    "strict-transport-security": Config.SECURITY_HEADER_HSTS,
    "referrer-policy": Config.SECURITY_HEADER_REFERRER_POLICY,
    "permissions-policy": Config.SECURITY_HEADER_PERMISSIONS_POLICY,
    "server": Config.SERVER_HEADER_VALUE,
}


@dataclass(frozen=True)
class MetadataRoute:
    """One production metadata route and its expected authenticated response."""

    method: str
    path: str
    json: dict[str, Any] | None
    expected_data: dict[str, Any]


METADATA_ROUTES = (
    MetadataRoute(
        "GET",
        "/api/v1/sync_connection_state",
        None,
        {
            "connected": True,
            "db_type": "postgresql",
            "current_database": "moonlit",
            "is_remote": True,
            "databases": ["moonlit", "analytics"],
            "schemas": ["public", "reporting"],
            "current_schema": "public",
        },
    ),
    MetadataRoute(
        "GET",
        "/api/v1/get_databases",
        None,
        {
            "databases": ["moonlit", "analytics"],
            "db_type": "postgresql",
            "is_remote": True,
        },
    ),
    MetadataRoute(
        "GET",
        "/api/v1/get_schemas",
        None,
        {"schemas": ["public", "reporting"], "current_schema": "public"},
    ),
    MetadataRoute(
        "GET",
        "/api/v1/get_tables",
        None,
        {"tables": ["accounts"], "database": "moonlit", "schema": "public"},
    ),
    MetadataRoute(
        "POST",
        "/api/v1/get_table_schema",
        {"table_name": "accounts"},
        {
            "table_name": "accounts",
            "columns": [
                {
                    "name": "id",
                    "data_type": "integer",
                    "nullable": False,
                    "key": "PRI",
                    "default": None,
                    "extra": None,
                    "max_length": None,
                    "numeric_precision": None,
                    "numeric_scale": None,
                }
            ],
            "row_count": 1,
            "database": "moonlit",
            "schema": "public",
        },
    ),
)


class SessionStateBoundary:
    """Deterministic fake for the external per-session state store."""

    def __init__(self) -> None:
        self.key = dependencies.state_key_from_session_cookie(SESSION_COOKIE)
        self.state = {self.key: copy.deepcopy(INITIAL_SESSION_STATE)}
        self.state[self.key]["session_active_at"] = time.time()
        self.read_keys: list[str] = []
        self.merge_calls: list[tuple[str, dict, int]] = []

    async def read(self, key: str) -> dict | None:
        self.read_keys.append(key)
        state = self.state.get(key)
        return copy.deepcopy(state) if state is not None else None

    async def merge(self, key: str, updates: dict, expire_seconds: int) -> dict:
        self.merge_calls.append((key, copy.deepcopy(updates), expire_seconds))
        current = self.state.setdefault(key, {})
        current.update(copy.deepcopy(updates))
        return copy.deepcopy(current)


class DatabaseServiceBoundary:
    """Deterministic fake for metadata calls to the external database."""

    def __init__(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self.calls: list[tuple[str, dict]] = []

        def record(name: str, db_config: dict) -> None:
            self.calls.append((name, copy.deepcopy(db_config)))

        def get_databases(db_config: dict) -> dict:
            record("get_databases", db_config)
            return {
                "status": "success",
                "databases": ["moonlit", "analytics"],
                "db_type": "postgresql",
                "is_remote": True,
            }

        def get_schemas(db_config: dict) -> dict:
            record("get_schemas", db_config)
            return {
                "status": "success",
                "schemas": ["public", "reporting"],
                "current_schema": "public",
            }

        def get_tables(db_config: dict) -> dict:
            record("get_tables", db_config)
            return {
                "status": "success",
                "tables": ["accounts"],
                "database": "moonlit",
                "schema": "public",
            }

        def get_table_info(db_config: dict, table_name: str) -> dict:
            record("get_table_info", db_config)
            return {
                "status": "success",
                "table_name": table_name,
                "schema": [
                    {
                        "name": "id",
                        "data_type": "integer",
                        "nullable": False,
                        "key": "PRI",
                    }
                ],
                "row_count": 1,
            }

        def disconnect(db_config: dict, user_id: str) -> dict:
            record("disconnect", db_config)
            return {"status": "success", "user_id": user_id}

        monkeypatch.setattr(DatabaseService, "get_databases", get_databases)
        monkeypatch.setattr(DatabaseService, "get_schemas", get_schemas)
        monkeypatch.setattr(DatabaseService, "get_tables", get_tables)
        monkeypatch.setattr(DatabaseService, "get_table_info", get_table_info)
        monkeypatch.setattr(DatabaseService, "disconnect", disconnect)

        async def call_database_boundary(function, *args, **kwargs):
            return function(*args, **kwargs)

        from controller import database_controller, database_schema_controller

        monkeypatch.setattr(database_controller, "run_in_threadpool", call_database_boundary)
        monkeypatch.setattr(database_schema_controller, "run_in_threadpool", call_database_boundary)


@pytest.fixture
def metadata_app(monkeypatch: pytest.MonkeyPatch):
    """Build the real application with production auth behavior enabled."""
    monkeypatch.setattr(Config, "DEBUG", False)
    monkeypatch.setattr(Config, "DEV_AUTH_BYPASS", False)
    monkeypatch.setattr(Config, "RATELIMIT_ENABLED", False)

    async def call_firebase_boundary(function, *args, **kwargs):
        return function(*args, **kwargs)

    monkeypatch.setattr(dependencies, "run_in_threadpool", call_firebase_boundary)

    from main import create_app

    return create_app()


@pytest.fixture
def session_boundary(monkeypatch: pytest.MonkeyPatch) -> SessionStateBoundary:
    """Install a complete read/merge fake beneath production session helpers."""
    boundary = SessionStateBoundary()
    monkeypatch.setattr(dependencies, "_read_state", boundary.read)
    monkeypatch.setattr(dependencies, "_merge_state", boundary.merge)
    return boundary


def _request_kwargs(route: MetadataRoute | None = None) -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        "cookies": {
            Config.SESSION_COOKIE_NAME: SESSION_COOKIE,
            Config.CSRF_COOKIE_NAME: CSRF_TOKEN,
        },
        "headers": {Config.CSRF_HEADER_NAME: CSRF_TOKEN},
    }
    if route and route.json is not None:
        kwargs["json"] = route.json
    return kwargs


async def _request(app, method: str, path: str, **kwargs: Any) -> httpx.Response:
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    cookies = kwargs.pop("cookies", None)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://testserver",
        cookies=cookies,
    ) as client:
        return await client.request(method, path, **kwargs)


def _assert_common_auth_error(response: httpx.Response, status_code: int, error: str) -> None:
    payload = response.json()
    assert response.status_code == status_code
    assert set(payload) == {"status", "error", "message", "details"}
    assert payload["status"] == "error"
    assert payload["error"] == error
    assert isinstance(payload["message"], str) and payload["message"]
    assert payload["details"] == {}

    for name, value in EXPECTED_SECURITY_HEADERS.items():
        assert response.headers[name] == value
    assert re.fullmatch(r"[A-Za-z0-9_-]{1,64}", response.headers["x-request-id"])


@pytest.mark.parametrize("route", METADATA_ROUTES, ids=lambda route: route.path.rsplit("/", 1)[-1])
@pytest.mark.asyncio
async def test_revoked_cookie_cannot_read_refresh_or_expose_cached_database_metadata(
    metadata_app,
    monkeypatch: pytest.MonkeyPatch,
    session_boundary: SessionStateBoundary,
    route: MetadataRoute,
) -> None:
    """Catch revoked cookies reaching cached state or database metadata services."""
    database = DatabaseServiceBoundary(monkeypatch)

    def reject_revoked_cookie(session_cookie: str) -> dict:
        raise RevokedSessionCookieError(f"revoked cookie: {session_cookie}")

    monkeypatch.setattr(dependencies, "verify_session_cookie_value", reject_revoked_cookie)
    state_before = copy.deepcopy(session_boundary.state)

    response = await _request(
        metadata_app,
        route.method,
        route.path,
        **_request_kwargs(route),
    )

    _assert_common_auth_error(response, 401, "UNAUTHORIZED")
    assert database.calls == []
    assert session_boundary.read_keys == []
    assert session_boundary.merge_calls == []
    assert session_boundary.state == state_before


@pytest.mark.parametrize("route", METADATA_ROUTES, ids=lambda route: route.path.rsplit("/", 1)[-1])
@pytest.mark.asyncio
async def test_firebase_outage_cannot_read_or_mutate_cached_database_context(
    metadata_app,
    monkeypatch: pytest.MonkeyPatch,
    session_boundary: SessionStateBoundary,
    route: MetadataRoute,
) -> None:
    """Catch Firebase infrastructure failures falling through to cache or DB access."""
    database = DatabaseServiceBoundary(monkeypatch)

    def fail_firebase_verification(session_cookie: str) -> dict:
        raise RuntimeError(f"Firebase unavailable for {session_cookie}")

    monkeypatch.setattr(dependencies, "verify_session_cookie_value", fail_firebase_verification)
    state_before = copy.deepcopy(session_boundary.state)

    response = await _request(
        metadata_app,
        route.method,
        route.path,
        **_request_kwargs(route),
    )

    _assert_common_auth_error(response, 503, "REQUEST_FAILED")
    assert database.calls == []
    assert session_boundary.read_keys == []
    assert session_boundary.merge_calls == []
    assert session_boundary.state == state_before


@pytest.mark.parametrize("route", METADATA_ROUTES, ids=lambda route: route.path.rsplit("/", 1)[-1])
@pytest.mark.asyncio
async def test_verified_cookie_receives_cached_database_metadata(
    metadata_app,
    monkeypatch: pytest.MonkeyPatch,
    session_boundary: SessionStateBoundary,
    route: MetadataRoute,
) -> None:
    """Catch authenticated metadata routes losing their cached database context."""
    database = DatabaseServiceBoundary(monkeypatch)
    verification_calls: list[str] = []

    def verify_cookie(session_cookie: str) -> dict:
        verification_calls.append(session_cookie)
        return {
            "uid": "metadata-owner",
            "email": "owner@example.com",
            "name": "Metadata Owner",
            "picture": None,
            "verified": True,
        }

    monkeypatch.setattr(dependencies, "verify_session_cookie_value", verify_cookie)
    state_before_active = session_boundary.state[session_boundary.key]["session_active_at"]

    response = await _request(
        metadata_app,
        route.method,
        route.path,
        **_request_kwargs(route),
    )

    assert response.status_code == 200
    assert response.json()["status"] == "success"
    assert response.json()["data"] == route.expected_data
    assert "never-expose-this" not in response.text
    assert verification_calls == [SESSION_COOKIE]
    assert session_boundary.read_keys == [session_boundary.key]
    assert len(session_boundary.merge_calls) == 1
    assert session_boundary.state[session_boundary.key]["session_active_at"] >= state_before_active
    assert session_boundary.state[session_boundary.key]["db_config_last_used_at"] > 100.0
    assert database.calls
    assert all(config == DB_CONFIG for _, config in database.calls)


@pytest.mark.asyncio
async def test_fastapi_reuses_verified_identity_for_route_and_database_context(
    metadata_app,
    monkeypatch: pytest.MonkeyPatch,
    session_boundary: SessionStateBoundary,
) -> None:
    """Catch duplicate Firebase verification when a route also requests the user dependency."""
    database = DatabaseServiceBoundary(monkeypatch)
    verification_calls: list[str] = []

    def verify_cookie(session_cookie: str) -> dict:
        verification_calls.append(session_cookie)
        return {
            "uid": "metadata-owner",
            "email": "owner@example.com",
            "name": "Metadata Owner",
            "picture": None,
            "verified": True,
        }

    monkeypatch.setattr(dependencies, "verify_session_cookie_value", verify_cookie)

    response = await _request(
        metadata_app,
        "POST",
        "/api/v1/disconnect_db",
        **_request_kwargs(),
    )

    assert response.status_code == 200
    assert response.json() == {
        "status": "success",
        "data": {"disconnected": True},
        "message": "Database disconnected successfully",
    }
    assert verification_calls == [SESSION_COOKIE]
    assert database.calls == [("disconnect", DB_CONFIG)]
    assert session_boundary.state[session_boundary.key]["db_config"] is None
