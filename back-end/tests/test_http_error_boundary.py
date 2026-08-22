"""Integration tests for the outer HTTP response/security boundary."""

from __future__ import annotations

import re

import httpx
import pytest
from fastapi import Depends, Request, Response
from limits import parse
from pydantic import BaseModel
from slowapi.errors import RateLimitExceeded
from slowapi.wrappers import Limit

from config import get_config
from controller.rate_limiter import limiter
from dependencies import get_current_user

Config = get_config()

EXPECTED_SECURITY_HEADERS = {
    "x-content-type-options": Config.SECURITY_HEADER_CONTENT_TYPE_OPTIONS,
    "x-frame-options": Config.SECURITY_HEADER_FRAME_OPTIONS,
    "x-xss-protection": Config.SECURITY_HEADER_XSS_PROTECTION,
    "strict-transport-security": Config.SECURITY_HEADER_HSTS,
    "referrer-policy": Config.SECURITY_HEADER_REFERRER_POLICY,
    "permissions-policy": Config.SECURITY_HEADER_PERMISSIONS_POLICY,
    "server": Config.SERVER_HEADER_VALUE,
}


class _ValidatedQuery(BaseModel):
    """Test-only schema used to exercise FastAPI request validation."""

    count: int


@pytest.fixture
def boundary_app(monkeypatch):
    """Build the real application with deterministic test-only failure routes."""
    monkeypatch.setattr(Config, "RATELIMIT_ENABLED", True)
    monkeypatch.setattr(Config, "DEBUG", False)
    monkeypatch.setattr(Config, "DEV_AUTH_BYPASS", False)
    # Header injection is outside this response-contract test and would use the
    # configured external Redis rate-limit store. Keep the real exception and
    # handler while cutting only that external boundary.
    monkeypatch.setattr(
        limiter,
        "_inject_headers",
        lambda response, current_limit: response,
    )

    from main import create_app

    app = create_app()

    @app.get("/__test__/validation")
    async def validation_failure(payload: _ValidatedQuery = Depends()):
        return payload

    @app.get("/__test__/auth")
    async def authentication_failure(user: dict = Depends(get_current_user)):
        return user

    @app.get("/__test__/rate-limit")
    async def rate_limit_failure(request: Request):
        limit = Limit(
            parse("1/minute"),
            key_func=lambda: "test-client",
            scope=None,
            per_method=False,
            methods=None,
            error_message=None,
            exempt_when=None,
            cost=1,
            override_defaults=False,
        )
        request.state.view_rate_limit = (limit, ["test-client"])
        raise RateLimitExceeded(limit)

    @app.get("/__test__/unhandled")
    async def unhandled_failure():
        raise RuntimeError("sensitive exception text must not escape")

    @app.get("/__test__/conflicting-headers")
    async def conflicting_headers(response: Response):
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["X-Powered-By"] = "framework-version"
        return {"ok": True}

    return app


async def _request(app, method: str, path: str, **kwargs) -> httpx.Response:
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        return await client.request(method, path, **kwargs)


def _assert_common_error(
    response: httpx.Response,
    *,
    status_code: int,
    error: str,
    details_empty: bool = True,
) -> None:
    payload = response.json()
    assert response.status_code == status_code
    assert set(payload) == {"status", "error", "message", "details"}
    assert payload["status"] == "error"
    assert payload["error"] == error
    assert isinstance(payload["message"], str) and payload["message"]
    assert isinstance(payload["details"], dict)
    if details_empty:
        assert payload["details"] == {}

    for name, value in EXPECTED_SECURITY_HEADERS.items():
        assert response.headers[name] == value

    request_id = response.headers["x-request-id"]
    assert re.fullmatch(r"[A-Za-z0-9_-]{1,64}", request_id)


@pytest.mark.asyncio
async def test_csrf_rejection_uses_the_common_outer_boundary(boundary_app) -> None:
    """Catch CSRF short-circuits bypassing the common envelope and headers."""
    response = await _request(
        boundary_app,
        "POST",
        "/__test__/csrf",
        headers={"X-Request-ID": "csrf-request-123"},
    )

    _assert_common_error(response, status_code=403, error="FORBIDDEN")
    assert response.headers["x-request-id"] == "csrf-request-123"


@pytest.mark.asyncio
async def test_request_validation_failure_uses_the_common_outer_boundary(boundary_app) -> None:
    """Catch validation failures losing standard headers or error fields."""
    response = await _request(boundary_app, "GET", "/__test__/validation?count=not-an-int")

    _assert_common_error(
        response,
        status_code=422,
        error="VALIDATION_ERROR",
        details_empty=False,
    )
    assert response.json()["details"]["errors"]


@pytest.mark.asyncio
async def test_authentication_failure_uses_the_common_outer_boundary(boundary_app) -> None:
    """Catch dependency-raised 401 responses escaping the common boundary."""
    response = await _request(boundary_app, "GET", "/__test__/auth")

    _assert_common_error(response, status_code=401, error="UNAUTHORIZED")


@pytest.mark.asyncio
async def test_framework_404_uses_the_common_outer_boundary(boundary_app) -> None:
    """Catch Starlette framework errors bypassing FastAPI's HTTP handler."""
    response = await _request(boundary_app, "GET", "/__test__/missing")

    _assert_common_error(response, status_code=404, error="NOT_FOUND")


@pytest.mark.asyncio
async def test_rate_limit_failure_uses_the_common_outer_boundary(boundary_app) -> None:
    """Catch SlowAPI's incompatible default 429 response shape."""
    response = await _request(boundary_app, "GET", "/__test__/rate-limit")

    _assert_common_error(response, status_code=429, error="RATE_LIMITED")


@pytest.mark.asyncio
async def test_request_too_large_short_circuit_uses_the_common_outer_boundary(boundary_app) -> None:
    """Catch the raw body limiter running outside response security headers."""
    response = await _request(
        boundary_app,
        "POST",
        "/__test__/body-limit",
        content=b"x" * (Config.REQUEST_BODY_MAX_BYTES + 1),
    )

    _assert_common_error(response, status_code=413, error="REQUEST_TOO_LARGE")


@pytest.mark.asyncio
async def test_unhandled_exception_returns_safe_correlated_common_error(boundary_app, caplog) -> None:
    """Catch raw exception text disclosure and missing outer response headers."""
    response = await _request(
        boundary_app,
        "GET",
        "/__test__/unhandled",
        headers={"X-Request-ID": "unsafe.request.id"},
    )

    _assert_common_error(response, status_code=500, error="INTERNAL_SERVER_ERROR")
    assert response.json()["message"] == "Internal server error"
    assert "sensitive exception text" not in response.text
    assert response.headers["x-request-id"] != "unsafe.request.id"
    error_records = [
        record for record in caplog.records if record.levelno >= 40 and "exception" in record.getMessage().lower()
    ]
    assert error_records
    assert all("sensitive exception text" not in record.getMessage() for record in error_records)
    assert any(
        getattr(record, "request_id", None) == response.headers["x-request-id"]
        for record in error_records
    )


@pytest.mark.asyncio
async def test_outer_boundary_replaces_conflicting_headers_and_clears_context(boundary_app) -> None:
    """Catch downstream header spoofing and request-context leakage."""
    from core.logging import current_request_id

    response = await _request(boundary_app, "GET", "/__test__/conflicting-headers")

    assert response.status_code == 200
    for name, value in EXPECTED_SECURITY_HEADERS.items():
        assert response.headers[name] == value
    assert "x-powered-by" not in response.headers
    assert re.fullmatch(r"[A-Za-z0-9_-]{1,64}", response.headers["x-request-id"])
    assert current_request_id() is None
