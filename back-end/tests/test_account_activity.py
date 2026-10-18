import asyncio

import httpx
import pytest
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from starlette.responses import StreamingResponse

from core.account_activity import (
    AccountActivityMiddleware,
    AccountActivityStore,
    AccountBusyError,
    run_account_work,
    track_account_request,
)


@pytest.fixture
def store(monkeypatch):
    store = AccountActivityStore()
    monkeypatch.setattr("core.account_activity.get_account_activity_store", lambda: store)
    return store


@pytest.mark.asyncio
async def test_erasure_rejects_active_work_then_blocks_new_writes(store):
    stream = await store.admit("user-1")
    deletion = await store.admit("user-1", allow_pending=True)
    with pytest.raises(AccountBusyError):
        await store.begin_erasure("user-1", deletion)
    await store.release("user-1", stream)
    await store.begin_erasure("user-1", deletion)
    with pytest.raises(AccountBusyError):
        await store.admit("user-1")
    with pytest.raises(AccountBusyError):
        await store.admit("user-1", allow_pending=True)
    other = await store.admit("user-10")
    await store.release("user-10", other)


@pytest.mark.asyncio
async def test_failed_erasure_allows_only_recovery_and_completed_erasure_is_terminal(store):
    deletion = await store.admit("user-1", allow_pending=True)
    await store.begin_erasure("user-1", deletion)
    await store.release("user-1", deletion)
    with pytest.raises(AccountBusyError):
        await store.admit("user-1")
    retry = await store.admit("user-1", allow_pending=True)
    await store.begin_erasure("user-1", retry)
    await store.complete_erasure("user-1", retry)
    await store.release("user-1", retry)
    for allow_pending in (False, True):
        with pytest.raises(AccountBusyError):
            await store.admit("user-1", allow_pending=allow_pending)


@pytest.mark.asyncio
async def test_unknown_token_cannot_begin_or_complete_erasure(store):
    with pytest.raises(AccountBusyError):
        await store.begin_erasure("user-1", "unknown")
    with pytest.raises(AccountBusyError):
        await store.complete_erasure("user-1", "unknown")


@pytest.mark.asyncio
async def test_cancelled_caller_keeps_work_admitted_until_actual_completion(store):
    started = asyncio.Event()
    finish = asyncio.Event()
    completed = asyncio.Event()

    async def work():
        started.set()
        await finish.wait()
        completed.set()

    caller = asyncio.create_task(run_account_work("user-1", work))
    await started.wait()
    caller.cancel()
    with pytest.raises(asyncio.CancelledError):
        await caller
    deletion = await store.admit("user-1", allow_pending=True)
    with pytest.raises(AccountBusyError):
        await store.begin_erasure("user-1", deletion)
    finish.set()
    await completed.wait()
    await asyncio.sleep(0)
    await store.begin_erasure("user-1", deletion)


@pytest.mark.asyncio
async def test_request_admission_covers_stream_final_writes(store):
    started = asyncio.Event()
    finish = asyncio.Event()
    saved = []
    app = FastAPI()
    app.add_middleware(AccountActivityMiddleware)

    @app.get("/stream")
    async def stream(request: Request):
        await track_account_request(request, "user-1")

        async def body():
            try:
                started.set()
                yield b"data: first\n\n"
                await finish.wait()
            finally:
                saved.append("final response and usage")

        return StreamingResponse(body())

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = asyncio.create_task(client.get("/stream"))
        await started.wait()
        deletion = await store.admit("user-1", allow_pending=True)
        with pytest.raises(AccountBusyError):
            await store.begin_erasure("user-1", deletion)
        finish.set()
        await response
        await store.begin_erasure("user-1", deletion)
    assert saved == ["final response and usage"]


@pytest.mark.asyncio
async def test_authentication_started_before_erasure_cannot_write_after_completion(store, monkeypatch):
    import dependencies

    verifying = asyncio.Event()
    finish_verification = asyncio.Event()
    writes = []

    async def verify_in_threadpool(*args, **kwargs):
        verifying.set()
        await finish_verification.wait()
        return {"uid": "user-1"}

    monkeypatch.setattr(dependencies, "run_in_threadpool", verify_in_threadpool)
    app = FastAPI()
    app.add_middleware(AccountActivityMiddleware)

    @app.post("/write")
    async def write(user=Depends(dependencies.get_current_user)):
        writes.append(user["uid"])
        return {"ok": True}

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
        cookies={dependencies.Config.SESSION_COOKIE_NAME: "preverified-cookie"},
    ) as client:
        late_request = asyncio.create_task(client.post("/write"))
        await verifying.wait()
        deletion = await store.admit("user-1", allow_pending=True)
        await store.begin_erasure("user-1", deletion)
        await store.complete_erasure("user-1", deletion)
        await store.release("user-1", deletion)
        finish_verification.set()
        response = await late_request

    assert response.status_code == 409
    assert writes == []


@pytest.mark.asyncio
async def test_activity_store_outage_rejects_request_before_writes(monkeypatch):
    class UnavailableRedis:
        async def eval(self, *args):
            raise ConnectionError("Redis unavailable")

    monkeypatch.setattr(
        "core.account_activity.get_account_activity_store", lambda: AccountActivityStore(UnavailableRedis())
    )
    app = FastAPI()
    app.add_middleware(AccountActivityMiddleware)
    writes = []

    @app.post("/write")
    async def write(request: Request):
        await track_account_request(request, "user-1")
        writes.append("write")

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/write")
    assert response.status_code == 503
    assert writes == []


@pytest.mark.asyncio
async def test_login_cannot_recreate_session_after_erasure(store, monkeypatch):
    from controller import auth_controller

    deletion = await store.admit("user-1", allow_pending=True)
    await store.begin_erasure("user-1", deletion)
    await store.complete_erasure("user-1", deletion)
    await store.release("user-1", deletion)
    created = []

    async def thread_call(function, *args, **kwargs):
        return function(*args, **kwargs)

    monkeypatch.setattr(auth_controller, "run_in_threadpool", thread_call)
    monkeypatch.setattr(auth_controller, "verify_csrf_token", lambda request: None)
    monkeypatch.setattr(auth_controller.auth, "verify_id_token", lambda *args, **kwargs: {"uid": "user-1"})
    monkeypatch.setattr(auth_controller.auth, "create_session_cookie", lambda *args, **kwargs: created.append(True))
    request = Request({"type": "http", "method": "POST", "path": "/set_authenticated_user_session", "headers": []})

    with pytest.raises(HTTPException) as error:
        await auth_controller.set_authenticated_user_session.__wrapped__(
            request,
            Response(),
            auth_controller.SetSessionRequest(idToken="verified-token"),
        )
    assert error.value.status_code == 409
    assert created == []


@pytest.mark.asyncio
async def test_cancelled_request_retains_admission_when_completion_is_unknown(store):
    admitted = asyncio.Event()

    async def app(scope, receive, send):
        await track_account_request(Request(scope), "user-1")
        admitted.set()
        await asyncio.Event().wait()

    scope = {"type": "http", "method": "GET", "path": "/work", "headers": []}
    caller = asyncio.create_task(AccountActivityMiddleware(app)(scope, None, None))
    await admitted.wait()
    caller.cancel()
    with pytest.raises(asyncio.CancelledError):
        await caller
    deletion = await store.admit("user-1", allow_pending=True)
    with pytest.raises(AccountBusyError):
        await store.begin_erasure("user-1", deletion)
