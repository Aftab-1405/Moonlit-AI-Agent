"""Account erasure barrier shared by requests and detached account work.

Admissions deliberately do not expire: a paused worker must not outlive its
admission and write after erasure. Lost workers therefore fail closed; operators
may remove stale admissions only after confirming those workers have terminated.
Completed erasures retain a hashed-UID tombstone to reject preverified requests.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import threading
import uuid
from collections.abc import Awaitable, Callable
from contextvars import ContextVar

import anyio
from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)
current_account_user_id: ContextVar[str | None] = ContextVar("account_user_id", default=None)


class AccountBusyError(RuntimeError):
    """Account work conflicts with an active or pending erasure."""


_ACTIVITY_LUA = """
local action = ARGV[1]
local token = ARGV[2]
local state = redis.call('GET', KEYS[1])
if action == 'admit' then
    if state and not (state == 'pending' and ARGV[3] == '1') then return 0 end
    redis.call('SADD', KEYS[2], token)
elseif action == 'begin' then
    if (state and state ~= 'pending') or redis.call('SISMEMBER', KEYS[2], token) == 0
       or redis.call('SCARD', KEYS[2]) ~= 1 then return 0 end
    redis.call('SET', KEYS[1], token)
elseif action == 'complete' then
    if state ~= token then return 0 end
    redis.call('SET', KEYS[1], 'deleted')
elseif action == 'release' then
    redis.call('SREM', KEYS[2], token)
    if state == token then redis.call('SET', KEYS[1], 'pending') end
else return redis.error_reply('Unknown account activity operation') end
return 1
"""


class AccountActivityStore:
    def __init__(self, redis_client=None):
        self.redis = redis_client
        self._lock = threading.RLock()
        self._states: dict[str, str] = {}
        self._requests: dict[str, set[str]] = {}

    async def _change(self, user_id, action, token, allow_pending=False):
        digest = hashlib.sha256(user_id.encode("utf-8")).hexdigest()
        if self.redis is not None:
            # Both keys occupy the same Redis Cluster hash slot.
            prefix = f"account_activity:{{{digest}}}"
            allowed = await self.redis.eval(
                _ACTIVITY_LUA,
                2,
                f"{prefix}:state",
                f"{prefix}:requests",
                action,
                token,
                "1" if allow_pending else "0",
            )
            if not allowed:
                raise AccountBusyError("Account has active work or erasure in progress")
            return

        with self._lock:
            state = self._states.get(digest)
            requests = self._requests.get(digest, set())
            if action == "admit":
                if state and not (state == "pending" and allow_pending):
                    raise AccountBusyError("Account erasure is in progress")
                self._requests.setdefault(digest, set()).add(token)
            elif action == "begin":
                if state not in (None, "pending") or requests != {token}:
                    raise AccountBusyError("Account has active work")
                self._states[digest] = token
            elif action == "complete":
                if state != token:
                    raise AccountBusyError("Account erasure ownership was lost")
                self._states[digest] = "deleted"
            elif action == "release":
                requests.discard(token)
                if not requests:
                    self._requests.pop(digest, None)
                if state == token:
                    self._states[digest] = "pending"

    async def admit(self, user_id: str, *, allow_pending=False) -> str:
        token = uuid.uuid4().hex
        await self._change(user_id, "admit", token, allow_pending)
        return token

    async def begin_erasure(self, user_id: str, token: str) -> None:
        await self._change(user_id, "begin", token)

    async def complete_erasure(self, user_id: str, token: str) -> None:
        await self._change(user_id, "complete", token)

    async def release(self, user_id: str, token: str) -> None:
        await self._change(user_id, "release", token)


_memory_store = AccountActivityStore()


def get_account_activity_store() -> AccountActivityStore:
    from config import get_config
    from service.redis_service import get_redis_client

    redis = get_redis_client()
    if redis is not None:
        return AccountActivityStore(redis)
    if get_config().APP_ENV.lower() in {"production", "staging"}:
        raise RuntimeError("Shared account activity store is unavailable")
    return _memory_store


async def track_account_request(request: Request, user_id: str, *, allow_pending=False):
    admissions = request.scope.setdefault("state", {}).setdefault("account_admissions", {})
    if user_id in admissions:
        current_account_user_id.set(user_id)
        return admissions[user_id]
    try:
        store = get_account_activity_store()
        token = await store.admit(user_id, allow_pending=allow_pending)
    except AccountBusyError as exc:
        raise HTTPException(409, "Account deletion is in progress. Please retry deletion.") from exc
    except Exception as exc:
        raise HTTPException(503, "Account activity service temporarily unavailable") from exc
    admissions[user_id] = (store, token)
    current_account_user_id.set(user_id)
    return store, token


class AccountActivityMiddleware:
    """Release admissions only after streaming and response background work ends."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        cancelled = False
        context_token = current_account_user_id.set(None)
        try:
            await self.app(scope, receive, send)
        except asyncio.CancelledError:
            cancelled = True
            raise
        finally:
            current_account_user_id.reset(context_token)
            if scope["type"] == "http" and not cancelled:
                with anyio.CancelScope(shield=True):
                    for user_id, (store, token) in scope.get("state", {}).get("account_admissions", {}).items():
                        await store.release(user_id, token)


_background_work: set[asyncio.Task] = set()


async def run_account_work(user_id: str, operation: Callable[[], Awaitable]):
    """Keep detached writes admitted even after their caller times out or cancels."""
    store = get_account_activity_store()
    token = await store.admit(user_id)

    async def execute():
        cancelled = False
        try:
            return await operation()
        except asyncio.CancelledError:
            # Shutdown may cancel the task while a native worker thread lives.
            # Retain admission rather than asserting that its writes stopped.
            cancelled = True
            raise
        finally:
            if not cancelled:
                await store.release(user_id, token)

    def completed(task):
        _background_work.discard(task)
        if not task.cancelled() and task.exception() is not None:
            logger.warning("Account background work failed (%s)", type(task.exception()).__name__)

    task = asyncio.create_task(execute())
    _background_work.add(task)
    task.add_done_callback(completed)
    return await asyncio.shield(task)
