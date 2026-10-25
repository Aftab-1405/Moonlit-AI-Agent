"""Offline executable review evidence. Calls production handlers/services, never lifespan.

Run from repository root: back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/api_reproduce.py
"""
import asyncio
import copy
import importlib.metadata
import json
import os
from pathlib import Path
import socket
import sys
import threading
import time
import faulthandler
import traceback
import tracemalloc
from datetime import datetime, timezone, timedelta
from types import SimpleNamespace
from unittest.mock import patch

os.environ.update(APP_ENV="testing", PYTHON_DOTENV_DISABLED="1", DEV_AUTH_BYPASS="false",
                  RATELIMIT_ENABLED="false", VAMP_MEMORY_ENABLED="false", LLM_RATELIMIT_ENABLED="false",
                  USER_QUOTA_ENABLED="false", SECRET_KEY="test-only-secret-key-do-not-use-in-production-32chars",
                  LOG_FILE="/tmp/moonlit-review-20261025/api_backend.log",
                  AUDIT_LOG_FILE="/tmp/moonlit-review-20261025/api_audit.log",
                  CORS_ORIGINS="https://frontend.example", RATELIMIT_DEFAULT="1 per minute")
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "back-end"))

# An accidental external SDK/network call must fail locally rather than connect.
def no_network(*args, **kwargs):
    raise AssertionError("Offline evidence: network access forbidden")
socket.socket.connect = no_network
socket.create_connection = no_network

import httpx
from fastapi import FastAPI, HTTPException
from starlette.requests import Request
import main
import dependencies as deps
from controller import conversations_controller as conv
from controller import context_controller as ctx
from controller import database_controller as database
from controller import auth_controller as authentication
from controller.rate_limiter import limiter
from core.account_activity import AccountActivityStore
from service.context.context_repository import ContextRepository
from service.context.context_service import ContextService, ContextMetrics
from service.user_settings.user_settings_service import UserSettingsService, DEFAULT_PREFERENCES

RESULTS = {}
def record(key, value):
    RESULTS[key] = value
    print(json.dumps({key: value}, default=str), flush=True)

def request(app=None, cookie="offline-shared-cookie", state=None):
    return Request({"type":"http", "method":"POST", "path":"/offline", "raw_path":b"/offline",
                    "query_string":b"", "scheme":"http", "server":("test",80), "client":("127.0.0.1",123),
                    "headers":[(b"cookie", f"{deps.Config.SESSION_COOKIE_NAME}={cookie}".encode())],
                    "app":app or SimpleNamespace(), "state":state or {"user":{"uid":"review-user"}}})

async def identity():
    return {"uid":"review-user"}

def context_app():
    app = FastAPI()
    app.include_router(ctx.router, prefix="/api/v1")
    app.dependency_overrides[deps.get_current_user] = identity
    app.dependency_overrides[deps.require_admin_user] = identity
    return app

class Quota:
    def __init__(self): self.used = 0; self.refunds = 0
    async def check_and_increment(self, uid):
        self.used += 1
        return True, SimpleNamespace(to_dict=lambda:{})
    async def refund(self, uid): self.used -= 1; self.refunds += 1

async def stream_cleanup_and_admission():
    quota = Quota()
    entered = asyncio.Event()
    class Limiter:
        async def acquire(self, *args):
            entered.set()
            await asyncio.Event().wait()
        async def release(self,*args): pass
    app = SimpleNamespace(state=SimpleNamespace(user_quota=quota,llm_rate_limiter=Limiter()))
    def call():
        return conv._handle_agent_stream(request(app), "review-user", "new-id", "bedrock", "offline-model",
                                         {"prompt":"Hello"}, require_existing_conversation=False)
    with patch.object(conv.LLMOptionsService,"resolve_selection",return_value=("bedrock","offline-model")), \
         patch.object(conv,"resolve_run_policy",return_value=SimpleNamespace()):
        task=asyncio.create_task(call())
        await entered.wait()
        task.cancel()
        try: await task
        except asyncio.CancelledError: pass
        assert quota.used == 1 and quota.refunds == 0
        record("F02", {"debit_before_cancellation":1,"used_after_cancel":quota.used,"refunds":quota.refunds})

        quota=Quota()
        release_entered=asyncio.Event(); release_finished=asyncio.Event(); first_sent=asyncio.Event()
        class ReleaseLimiter:
            async def acquire(self,*args): return True,"offline-key"
            async def release(self,*args):
                release_entered.set()
                await asyncio.sleep(0)
                release_finished.set()
        app.state.user_quota=quota; app.state.llm_rate_limiter=ReleaseLimiter()
        async def source(**kwargs):
            yield "data: first\n\n"
            await asyncio.Event().wait()
        with patch.object(conv.ConversationService,"create_streaming_generator",side_effect=source):
            response=await call()
            async def send(message):
                if message["type"]=="http.response.body" and message.get("body"): first_sent.set()
            async def receive():
                await first_sent.wait()
                return {"type":"http.disconnect"}
            scope={"type":"http","asgi":{"spec_version":"2.3"},"method":"POST","path":"/offline","headers":[]}
            await asyncio.wait_for(response(scope,receive,send),2)
        assert release_entered.is_set() and not release_finished.is_set()
        record("F01",{"asgi_spec":"2.3","release_entered":release_entered.is_set(),"release_finished":release_finished.is_set(),"quota_used":quota.used})

async def context_routes():
    app=context_app()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url="http://test") as client:
        attempts=[]
        def failed_delete(uid,field): attempts.append(field); return False
        with patch.object(ContextRepository,"get",return_value={"database_schemas":{"sales":{},"analytics":{}}}), \
             patch.object(ContextRepository,"delete_field",side_effect=failed_delete):
            response=await client.delete("/api/v1/user/context/schemas")
        assert response.status_code==200 and len(attempts)==2 and "Cleared 2" in response.json()["message"]
        record("F03",{"status":response.status_code,"body":response.json(),"failed_deletions":attempts})

        class SlowRef:
            def set(self,*args,**kwargs): time.sleep(.12)
        ticks=[]
        async def timer():
            start=time.perf_counter(); await asyncio.sleep(.01); ticks.append(time.perf_counter()-start)
        with patch.object(ContextRepository,"get_ref",return_value=SlowRef()):
            for _ in range(3):
                task=asyncio.create_task(timer()); await asyncio.sleep(0)
                response=await client.post("/api/v1/context/metrics/reset")
                await task
        assert min(ticks)>.1 and response.status_code==200
        record("F04",{"firestore_set_delay_seconds":.12,"timer_target_seconds":.01,"observed_timer_seconds":ticks,"status":response.status_code})

        stored={"preferences":{"connectionPersistence":0}}
        writes=[]
        def rejected_update(uid,payload): writes.append(copy.deepcopy(payload)); return False
        deps._memory_state.clear()
        cookie="settings-cookie"
        client.cookies.set(deps.Config.SESSION_COOKIE_NAME,cookie)
        with patch.object(ContextRepository,"get",side_effect=lambda uid:copy.deepcopy(stored)), \
             patch.object(ContextRepository,"update",side_effect=rejected_update):
            response=await client.post("/api/v1/user/settings",json={"connectionPersistence":60})
            after=await client.get("/api/v1/user/settings")
        state_before_get=writes[0]["preferences"]["connectionPersistence"]
        assert response.status_code==200 and response.json()["settings"]["connectionPersistence"]==60
        assert after.json()["settings"]["connectionPersistence"]==0
        # Repeat POST and inspect real memory-backed session before GET remirrors the old value.
        with patch.object(ContextRepository,"get",side_effect=lambda uid:copy.deepcopy(stored)), \
             patch.object(ContextRepository,"update",return_value=False):
            await client.post("/api/v1/user/settings",json={"connectionPersistence":60})
        session=await deps._read_state(deps.state_key_from_session_cookie(cookie))
        assert session["connectionPersistenceMinutes"]==60
        record("F07",{"post_status":response.status_code,"reported_preference":response.json()["settings"]["connectionPersistence"],
                       "session_mirror":session["connectionPersistenceMinutes"],"next_get":after.json()["settings"]["connectionPersistence"],"repository_update":False})

        deps._memory_state.clear()
        cookie="two-tabs-cookie"; client.cookies.set(deps.Config.SESSION_COOKIE_NAME,cookie)
        await deps._write_state(deps.state_key_from_session_cookie(cookie),
                                {"db_config":{"db_type":"postgresql","host":"synthetic","database":"sales"},
                                 "connectionPersistenceMinutes":0,"session_instance_id":"tab-A","session_active_at":time.time()},3600)
        with patch.object(database.DatabaseService,"disconnect",return_value={"status":"success"}) as disconnect:
            response=await client.post("/api/v1/user/session/active",json={"sessionInstanceId":"tab-B"})
        session=await deps._read_state(deps.state_key_from_session_cookie(cookie))
        assert response.status_code==200 and disconnect.call_count==1 and session["db_config"] is None
        record("F05",{"tab_A_heartbeat_age_seconds":"approximately 0","tab_B_status":response.status_code,
                       "disconnect_calls":disconnect.call_count,"db_config":session["db_config"]})

async def settings_interleaving():
    stored={"preferences":{**DEFAULT_PREFERENCES,"queryTimeout":30,"maxRows":1000}}
    barrier=threading.Barrier(2); first_write=threading.Event(); trace=[]; lock=threading.Lock()
    def get(uid):
        result=copy.deepcopy(stored)
        with lock: trace.append("read baseline")
        barrier.wait(2)
        return result
    def update(uid,payload):
        is_timeout=payload["preferences"]["queryTimeout"]==60
        if is_timeout: first_write.wait(2)
        with lock:
            # merge=True still writes every supplied preference leaf.
            stored["preferences"].update(payload["preferences"])
            trace.append("write timeout" if is_timeout else "write maxRows")
        if not is_timeout: first_write.set()
        return True
    with patch.object(ContextRepository,"get",side_effect=get),patch.object(ContextRepository,"update",side_effect=update):
        outputs=await asyncio.gather(asyncio.to_thread(UserSettingsService.save,"review-user",{"queryTimeout":60}),
                                     asyncio.to_thread(UserSettingsService.save,"review-user",{"maxRows":2000}))
    assert stored["preferences"]["queryTimeout"]==60 and stored["preferences"]["maxRows"]==1000
    record("F06",{"patches":[{"queryTimeout":60},{"maxRows":2000}],"trace":trace,
                   "final":{"queryTimeout":stored["preferences"]["queryTimeout"],"maxRows":stored["preferences"]["maxRows"]},
                   "both_calls_returned":True})

async def middleware_routes():
    with patch.object(main.AppConfig,"RATELIMIT_ENABLED",True):
        app=main.create_app()
    app.dependency_overrides[deps.get_current_user]=identity
    from controller import database_schema_controller as schemas
    async def db_config(): return {"db_type":"postgresql","database":"offline"}
    app.dependency_overrides[deps.require_authenticated_db_config]=db_config
    limiter.enabled=True
    @app.get("/offline-raise")
    async def raise_error(): raise RuntimeError("synthetic internal error")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url="http://test") as client:
        with patch.object(schemas.DatabaseService,"get_tables",return_value={"status":"success","tables":[]}):
            responses=[await client.get("/api/v1/get_tables") for _ in range(3)]
        statuses=[r.status_code for r in responses]
        assert statuses==[200,200,200]
        record("F08",{"configured_default":main.AppConfig.RATELIMIT_DEFAULT,"limiter_enabled":limiter.enabled,
                       "registered_default_groups":len(limiter._default_limits),"get_tables_statuses":statuses,
                       "middleware":[m.cls.__name__ for m in app.user_middleware]})
        origin={"origin":"https://frontend.example"}
        normal=await client.get("/api/v1/",headers=origin)
        csrf=await client.post("/api/v1/user/settings",json={"theme":"dark"},headers=origin)
        large=await client.post("/api/v1/user/settings",content=b"x"*(main.AppConfig.REQUEST_BODY_MAX_BYTES+1),headers=origin)
        error=await client.get("/offline-raise",headers=origin)
        values=[{"status":r.status_code,"allow_origin":r.headers.get("access-control-allow-origin")} for r in (normal,csrf,large,error)]
        assert [v["status"] for v in values]==[200,403,413,500]
        assert values[0]["allow_origin"]=="https://frontend.example" and all(v["allow_origin"] is None for v in values[1:])
        record("F09",{"origin":origin["origin"],"normal_csrf_large_unhandled":values})
    limiter.enabled=False

async def disconnect_and_login():
    app=FastAPI(); app.include_router(database.router,prefix="/api/v1"); app.include_router(authentication.router)
    app.dependency_overrides[deps.get_current_user]=identity
    async def cached_config(request:Request):
        return (await deps.get_session_data(request) or {}).get("db_config")
    app.dependency_overrides[deps.get_authenticated_db_config]=cached_config
    deps._memory_state.clear(); cookie="failed-disconnect-cookie"
    await deps._write_state(deps.state_key_from_session_cookie(cookie),{"db_config":{"db_type":"postgresql","database":"sales"}},3600)
    closes=[]
    def close_pool(config):
        closes.append(config)
        raise RuntimeError("synthetic pool close failure")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url="http://test") as client:
        client.cookies.set(deps.Config.SESSION_COOKIE_NAME,cookie)
        with patch("service.database.connection_manager.get_connection_manager",return_value=SimpleNamespace(close_pool=close_pool)), \
             patch("service.database.context_sync.get_default_context_sync",return_value=SimpleNamespace(clear_connection=lambda uid:None)):
            first=await client.post("/api/v1/disconnect_db"); second=await client.post("/api/v1/disconnect_db")
        session=await deps._read_state(deps.state_key_from_session_cookie(cookie))
        assert [first.status_code,second.status_code]==[500,200] and len(closes)==1 and session["db_config"] is None
        record("F10",{"statuses":[first.status_code,second.status_code],"pool_close_attempts":len(closes),"db_config":session["db_config"]})
        client.cookies.clear(); client.cookies.set(deps.Config.CSRF_COOKIE_NAME,"csrf")
        with patch.object(authentication.auth,"verify_id_token",return_value={"uid":"review-user"}) as verify, \
             patch.object(authentication.auth,"create_session_cookie",side_effect=ConnectionError("offline Firebase outage")):
            response=await client.post("/set_authenticated_user_session",json={"idToken":"synthetic-valid-token"},
                                       headers={deps.Config.CSRF_HEADER_NAME:"csrf"})
        assert verify.call_count==1 and response.status_code==401
        record("F11",{"id_token_verified":True,"create_session_cookie_error":"ConnectionError","status":response.status_code,"body":response.json()})

async def queue_and_context_errors():
    measurements=[]
    for count in (1000,10000):
        produced=0
        async def source():
            nonlocal produced
            for index in range(count):
                produced+=1
                yield f"data: {index:08d} " + "x"*1024 + "\n\n"
        tracemalloc.start()
        stream=conv._stream_with_heartbeats(source())
        started=time.perf_counter()
        await anext(stream)
        retained,peak=tracemalloc.get_traced_memory()
        measurements.append({"events":count,"payload_bytes":1041,"produced_at_first_delivery":produced,
                             "retained_bytes":retained,"peak_bytes":peak,"seconds":time.perf_counter()-started})
        assert produced==count
        await stream.aclose()
        tracemalloc.stop()
    assert measurements[1]["retained_bytes"]>measurements[0]["retained_bytes"]*5
    record("F34",measurements)
    now=datetime.now(timezone.utc)
    values={"datetime":now,"utc_iso":now.isoformat(),"offset_iso":now.astimezone(timezone(timedelta(hours=5,minutes=30))).isoformat()}
    hits={}
    with patch.object(ContextMetrics,"record_hit"),patch.object(ContextMetrics,"record_miss"):
        for kind,value in values.items():
            cached={"cached_at":value,"tables":["orders"],"columns":{}}
            with patch.object(ContextService,"_get_context",return_value={"database_schemas":{"sales":cached}}):
                hits[kind]=ContextService.get_schema_context("review-user","sales") is not None
    assert hits["datetime"] is False and hits["utc_iso"] is True
    from service.context import context_service
    stale=now-timedelta(seconds=context_service._config.SCHEMA_CONTEXT_TTL_SECONDS+60)
    stale_hits={}
    with patch.object(ContextMetrics,"record_hit"),patch.object(ContextMetrics,"record_miss"):
        for kind,value in {"utc_iso":stale.isoformat(),"offset_iso":stale.astimezone(timezone(timedelta(hours=5,minutes=30))).isoformat()}.items():
            with patch.object(ContextService,"_get_context",return_value={"database_schemas":{"sales":{"cached_at":value,"tables":["old_table"]}}}):
                stale_hits[kind]=ContextService.get_schema_context("review-user","sales") is not None
    assert stale_hits=={"utc_iso":False,"offset_iso":True}
    record("F35",{"same_instant":{k:str(v) for k,v in values.items()},"cache_hits":hits,
                   "ttl_seconds":context_service._config.SCHEMA_CONTEXT_TTL_SECONDS,
                   "age_of_stale_instant_seconds":context_service._config.SCHEMA_CONTEXT_TTL_SECONDS+60,
                   "stale_cache_hits":stale_hits})
    from core.errors import classify_db_error, public_database_error
    errors={message:{"category":classify_db_error(message),"public_code":public_database_error(RuntimeError(message)).code}
            for message in ("ORA-01031: insufficient privileges","ORA-01756: quoted string not properly terminated")}
    assert all(v["category"]=="unknown" for v in errors.values())
    record("F36",errors)

async def run():
    # The sandbox does not reliably wake selector self-pipes from worker threads.
    # A local timer keeps the loop polling; production scheduling is unchanged.
    async def poll_loop():
        while True: await asyncio.sleep(.005)
    poller=asyncio.create_task(poll_loop())
    record("runtime",{"python":sys.version.split()[0],**{p:importlib.metadata.version(p) for p in ("fastapi","starlette","pydantic","slowapi","httpx")}})
    try:
        await stream_cleanup_and_admission()
        await context_routes()
        await settings_interleaving()
        await middleware_routes()
        await disconnect_and_login()
        await queue_and_context_errors()
    except BaseException:
        traceback.print_exc()
        raise
    finally:
        await asyncio.get_running_loop().shutdown_default_executor()
        poller.cancel()

if __name__=="__main__":
    faulthandler.dump_traceback_later(15, exit=True)
    asyncio.run(run())
    faulthandler.cancel_dump_traceback_later()
