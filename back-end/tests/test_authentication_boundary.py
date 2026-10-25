"""Authentication failures must never switch a request to the debug identity."""

from __future__ import annotations

import httpx
import pytest
from fastapi import Depends, FastAPI
from firebase_admin.auth import (
    ExpiredSessionCookieError,
    InvalidSessionCookieError,
    RevokedSessionCookieError,
)


@pytest.fixture
def authentication_app(monkeypatch):
    import dependencies
    from core.account_activity import AccountActivityMiddleware
    from service import redis_service

    monkeypatch.setattr(dependencies.Config, "DEBUG", True)
    monkeypatch.setattr(dependencies.Config, "DEV_AUTH_BYPASS", True)
    monkeypatch.setattr(dependencies.Config, "DEV_AUTH_USER_ID", "debug-user")
    monkeypatch.setattr(redis_service, "_redis_client", None)

    app = FastAPI()
    app.add_middleware(AccountActivityMiddleware)

    @app.get("/required")
    async def required(user=Depends(dependencies.get_current_user)):
        return {"uid": user["uid"]}

    @app.get("/optional")
    async def optional(user=Depends(dependencies.get_current_user_optional)):
        return {"uid": user["uid"] if user else None}

    return app


@pytest.mark.parametrize(
    "error",
    [
        ExpiredSessionCookieError("synthetic expired cookie", None),
        InvalidSessionCookieError("synthetic invalid cookie"),
        RevokedSessionCookieError("synthetic revoked cookie"),
    ],
    ids=["expired", "invalid", "revoked"],
)
@pytest.mark.asyncio
async def test_rejected_cookie_never_becomes_debug_identity(authentication_app, monkeypatch, error):
    import dependencies

    def reject_cookie(_cookie, **_kwargs):
        raise error

    monkeypatch.setattr(dependencies.auth, "verify_session_cookie", reject_cookie)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=authentication_app), base_url="http://test"
    ) as client:
        headers = {"cookie": f"{dependencies.Config.SESSION_COOKIE_NAME}=rejected"}
        required = await client.get("/required", headers=headers)
        optional = await client.get("/optional", headers=headers)

    assert required.status_code == 401
    assert optional.status_code == 200
    assert optional.json() == {"uid": None}


@pytest.mark.parametrize("cookie_value", [None, ""])
@pytest.mark.parametrize("debug,bypass", [(True, True), (True, False), (False, True)])
@pytest.mark.asyncio
async def test_only_absent_cookie_can_use_enabled_debug_bypass(
    authentication_app, monkeypatch, cookie_value, debug, bypass
):
    import dependencies

    monkeypatch.setattr(dependencies.Config, "DEBUG", debug)
    monkeypatch.setattr(dependencies.Config, "DEV_AUTH_BYPASS", bypass)
    headers = {} if cookie_value is None else {"cookie": f"{dependencies.Config.SESSION_COOKIE_NAME}="}
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=authentication_app), base_url="http://test"
    ) as client:
        response = await client.get("/required", headers=headers)

    if cookie_value is None and debug and bypass:
        assert response.status_code == 200
        assert response.json() == {"uid": "debug-user"}
    else:
        assert response.status_code == 401


@pytest.mark.asyncio
async def test_valid_cookie_keeps_verified_identity_with_debug_bypass_enabled(authentication_app, monkeypatch):
    import dependencies

    monkeypatch.setattr(dependencies.auth, "verify_session_cookie", lambda *_args, **_kwargs: {"uid": "verified-user"})
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=authentication_app), base_url="http://test"
    ) as client:
        response = await client.get("/required", headers={"cookie": f"{dependencies.Config.SESSION_COOKIE_NAME}=valid"})

    assert response.status_code == 200
    assert response.json() == {"uid": "verified-user"}


@pytest.mark.parametrize("decoded", [{}, {"uid": None}, {"uid": 123}, {"uid": ""}])
@pytest.mark.asyncio
async def test_verified_session_requires_nonempty_string_identity(authentication_app, monkeypatch, decoded):
    import dependencies

    monkeypatch.setattr(dependencies.auth, "verify_session_cookie", lambda *_args, **_kwargs: decoded)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=authentication_app), base_url="http://test"
    ) as client:
        response = await client.get(
            "/required", headers={"cookie": f"{dependencies.Config.SESSION_COOKIE_NAME}=signed"}
        )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_firebase_outage_never_becomes_debug_identity(authentication_app, monkeypatch):
    import dependencies

    def unavailable(*_args, **_kwargs):
        raise ConnectionError("synthetic Firebase outage")

    monkeypatch.setattr(dependencies.auth, "verify_session_cookie", unavailable)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=authentication_app), base_url="http://test"
    ) as client:
        for path in ("/required", "/optional"):
            response = await client.get(path, headers={"cookie": f"{dependencies.Config.SESSION_COOKIE_NAME}=signed"})
            assert response.status_code == 503


@pytest.mark.asyncio
async def test_optional_authentication_preserves_account_erasure_denial(authentication_app, monkeypatch):
    import dependencies
    from core.account_activity import get_account_activity_store

    monkeypatch.setattr(dependencies.auth, "verify_session_cookie", lambda *_args, **_kwargs: {"uid": "deleting-user"})
    store = get_account_activity_store()
    token = await store.admit("deleting-user")
    await store.begin_erasure("deleting-user", token)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=authentication_app), base_url="http://test"
    ) as client:
        response = await client.get(
            "/optional", headers={"cookie": f"{dependencies.Config.SESSION_COOKIE_NAME}=signed"}
        )

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_logout_clears_local_session_during_firebase_verification_outage(authentication_app, monkeypatch):
    from http.cookies import SimpleCookie

    import dependencies
    from controller import auth_controller

    def unavailable(*_args, **_kwargs):
        raise ConnectionError("synthetic Firebase outage")

    monkeypatch.setattr(dependencies.auth, "verify_session_cookie", unavailable)
    session_key = dependencies.state_key_from_session_cookie("signed")
    monkeypatch.setattr(dependencies, "_memory_state", {session_key: ({"_user_id": "user"}, float("inf"))})
    authentication_app.include_router(auth_controller.router)
    config = dependencies.Config
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=authentication_app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/logout_authenticated_user_session",
            headers={
                "cookie": f"{config.SESSION_COOKIE_NAME}=signed; {config.CSRF_COOKIE_NAME}=synthetic-csrf",
                config.CSRF_HEADER_NAME: "synthetic-csrf",
            },
        )

    assert response.status_code == 200
    assert session_key not in dependencies._memory_state
    cookies = SimpleCookie()
    cookies.load(response.headers["set-cookie"])
    assert cookies[config.SESSION_COOKIE_NAME].value == ""
    assert cookies[config.SESSION_COOKIE_NAME]["max-age"] == "0"


@pytest.mark.parametrize("erasure_state", ["active", "pending", "deleted"])
@pytest.mark.parametrize("valid_csrf", [True, False])
@pytest.mark.asyncio
async def test_logout_during_erasure_keeps_barrier_but_clears_session(
    authentication_app, monkeypatch, erasure_state, valid_csrf
):
    from http.cookies import SimpleCookie

    import dependencies
    from controller import auth_controller
    from core import account_activity
    from core.account_activity import AccountActivityStore

    uid = "logout-erasure-user"
    store = AccountActivityStore()
    monkeypatch.setattr(account_activity, "get_account_activity_store", lambda: store)
    monkeypatch.setattr(dependencies.auth, "verify_session_cookie", lambda *_a, **_kw: {"uid": uid})
    token = await store.admit(uid)
    await store.begin_erasure(uid, token)
    if erasure_state == "pending":
        await store.release(uid, token)
    elif erasure_state == "deleted":
        await store.complete_erasure(uid, token)
    session_key = dependencies.state_key_from_session_cookie("signed")
    monkeypatch.setattr(dependencies, "_memory_state", {session_key: ({"_user_id": uid}, float("inf"))})
    authentication_app.include_router(auth_controller.router)
    config = dependencies.Config
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=authentication_app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/logout_authenticated_user_session",
            headers={
                "cookie": f"{config.SESSION_COOKIE_NAME}=signed; {config.CSRF_COOKIE_NAME}=csrf",
                config.CSRF_HEADER_NAME: "csrf" if valid_csrf else "wrong",
            },
        )
        blocked = await client.get("/required", headers={"cookie": f"{config.SESSION_COOKIE_NAME}=signed"})
    assert blocked.status_code == 409
    if not valid_csrf:
        assert response.status_code == 403
        assert session_key in dependencies._memory_state
        assert "set-cookie" not in response.headers
        return
    assert response.status_code == 200
    assert session_key not in dependencies._memory_state
    cookies = SimpleCookie()
    cookies.load(response.headers["set-cookie"])
    assert cookies[config.SESSION_COOKIE_NAME].value == ""
    assert cookies[config.SESSION_COOKIE_NAME]["max-age"] == "0"


@pytest.mark.parametrize("failure", ["none", "invalid-cookie", "revocation", "session-storage"])
@pytest.mark.asyncio
async def test_logout_cleanup_survives_external_failures(authentication_app, monkeypatch, failure):
    from http.cookies import SimpleCookie

    import dependencies
    from controller import auth_controller

    monkeypatch.setattr(dependencies.Config, "DEV_AUTH_BYPASS", False)

    def verify(*_args, **_kwargs):
        if failure == "invalid-cookie":
            raise InvalidSessionCookieError("synthetic invalid cookie")
        return {"uid": "logout-user"}

    def revoke(_uid):
        if failure == "revocation":
            raise ConnectionError("synthetic revocation outage")

    class UnavailableRedis:
        async def delete(self, key):
            raise ConnectionError("synthetic storage outage")

    async def redis():
        return UnavailableRedis()

    monkeypatch.setattr(dependencies.auth, "verify_session_cookie", verify)
    monkeypatch.setattr(auth_controller.auth, "revoke_refresh_tokens", revoke)
    if failure == "session-storage":
        monkeypatch.setattr(dependencies, "get_redis", redis)
    session_key = dependencies.state_key_from_session_cookie("signed")
    monkeypatch.setattr(dependencies, "_memory_state", {session_key: ({"_user_id": "logout-user"}, float("inf"))})
    authentication_app.include_router(auth_controller.router)
    config = dependencies.Config
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=authentication_app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/logout_authenticated_user_session",
            headers={
                "cookie": f"{config.SESSION_COOKIE_NAME}=signed; {config.CSRF_COOKIE_NAME}=csrf",
                config.CSRF_HEADER_NAME: "csrf",
            },
        )
    assert response.status_code == 200
    if failure != "session-storage":
        assert session_key not in dependencies._memory_state
    cookies = SimpleCookie()
    cookies.load(response.headers["set-cookie"])
    assert cookies[config.SESSION_COOKIE_NAME]["max-age"] == "0"
