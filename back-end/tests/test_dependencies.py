"""Tests for the FastAPI dependencies (CSRF, session state).

These tests cover the bank-grade security fixes:

- ``verify_csrf_token`` uses constant-time comparison (FIX [AUDIT-2-D]).
- ``_merge_state`` performs an atomic read-merge-write on Redis (FIX
  [AUDIT-2-D]). The in-memory fallback uses a lock so concurrent
  requests do not lose updates.
"""

from __future__ import annotations

import asyncio
import json
import threading
from typing import Any
from unittest.mock import MagicMock

import pytest


class TestCsrfConstantTime:
    """Tests for the CSRF token verifier."""

    def test_accepts_matching_tokens(self) -> None:
        """Verify matching CSRF cookie and header tokens are accepted."""
        from starlette.datastructures import Headers

        from dependencies import verify_csrf_token

        request = MagicMock()
        request.cookies = {"csrf_token": "abc123"}
        request.headers = Headers({"X-CSRF-Token": "abc123"})
        request.url.path = "/api/v1/test"
        request.method = "POST"
        request.client = MagicMock(host="127.0.0.1")
        # Should not raise.
        verify_csrf_token(request)

    def test_rejects_mismatched_tokens(self) -> None:
        """Reject mismatched CSRF cookie and header tokens with HTTP 403."""
        from fastapi import HTTPException

        from dependencies import verify_csrf_token

        request = MagicMock()
        request.cookies = {"csrf_token": "abc123"}
        request.headers = {"X-CSRF-Token": "different"}
        request.url.path = "/api/v1/test"
        request.method = "POST"
        request.client = MagicMock(host="127.0.0.1")
        with pytest.raises(HTTPException) as exc_info:
            verify_csrf_token(request)
        assert exc_info.value.status_code == 403

    def test_rejects_missing_cookie(self) -> None:
        """Reject a request missing the csrf_token cookie with HTTP 403."""
        from fastapi import HTTPException

        from dependencies import verify_csrf_token

        request = MagicMock()
        request.cookies = {}
        request.headers = {"X-CSRF-Token": "abc123"}
        request.url.path = "/api/v1/test"
        request.method = "POST"
        request.client = MagicMock(host="127.0.0.1")
        with pytest.raises(HTTPException) as exc_info:
            verify_csrf_token(request)
        assert exc_info.value.status_code == 403

    def test_rejects_missing_header(self) -> None:
        """Reject a request missing the X-CSRF-Token header with HTTP 403."""
        from fastapi import HTTPException

        from dependencies import verify_csrf_token

        request = MagicMock()
        request.cookies = {"csrf_token": "abc123"}
        request.headers = {}
        request.url.path = "/api/v1/test"
        request.method = "POST"
        request.client = MagicMock(host="127.0.0.1")
        with pytest.raises(HTTPException) as exc_info:
            verify_csrf_token(request)
        assert exc_info.value.status_code == 403


class TestMergeStateInMemoryFallback:
    """Tests for the in-memory fallback of ``_merge_state``.

    Deterministic fake-EVAL boundary coverage for the Redis path lives in
    ``test_lua_merge_regression.py``; here we verify the fallback contract.
    """

    def test_merge_state_writes_to_memory(self) -> None:
        """Verify ``_merge_state`` writes a new key to the in-memory fallback."""
        from dependencies import _memory_state, _merge_state

        _memory_state.clear()
        asyncio.run(_merge_state("test:key:1", {"a": 1}, expire_seconds=60))
        assert "test:key:1" in _memory_state
        data, _ = _memory_state["test:key:1"]
        assert data["a"] == 1

    def test_merge_state_merges_existing(self) -> None:
        """Verify ``_merge_state`` shallow-merges new top-level state fields."""
        from dependencies import _memory_state, _merge_state

        _memory_state.clear()
        asyncio.run(_merge_state("test:key:2", {"a": 1}, expire_seconds=60))
        asyncio.run(_merge_state("test:key:2", {"b": 2}, expire_seconds=60))
        data, _ = _memory_state["test:key:2"]
        assert data == {"a": 1, "b": 2}

    def test_merge_state_shallowly_overwrites_nested_state_and_preserves_none(
        self,
    ) -> None:
        """Nested updates replace wholesale while unrelated fields survive."""
        from dependencies import _memory_state, _merge_state

        _memory_state.clear()
        asyncio.run(
            _merge_state(
                "test:key:shallow",
                {
                    "preferences": {"theme": "dark", "density": "compact"},
                    "unrelated": "preserved",
                    "clearable": "present",
                },
                expire_seconds=60,
            )
        )

        result = asyncio.run(
            _merge_state(
                "test:key:shallow",
                {"preferences": {"theme": "light"}, "clearable": None},
                expire_seconds=60,
            )
        )

        expected = {
            "preferences": {"theme": "light"},
            "unrelated": "preserved",
            "clearable": None,
        }
        data, _ = _memory_state["test:key:shallow"]
        assert result == expected
        assert data == expected

    def test_merge_state_is_thread_safe(self) -> None:
        """Concurrent merges from multiple threads do not lose updates."""
        from dependencies import _memory_state, _merge_state

        _memory_state.clear()

        def worker(n: int) -> None:
            asyncio.run(_merge_state("test:key:3", {f"k{n}": n}, expire_seconds=60))

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(20)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        data, _ = _memory_state["test:key:3"]
        # All 20 keys should be present (no lost updates).
        assert len(data) == 20
        for i in range(20):
            assert data[f"k{i}"] == i

    def test_merge_state_returns_merged_dict(self) -> None:
        """Verify ``_merge_state`` returns the merged dict to the caller."""
        from dependencies import _memory_state, _merge_state

        _memory_state.clear()
        asyncio.run(_merge_state("test:key:4", {"a": 1}, expire_seconds=60))
        result = asyncio.run(_merge_state("test:key:4", {"b": 2}, expire_seconds=60))
        assert result == {"a": 1, "b": 2}

    def test_merge_state_refreshes_in_memory_ttl(self, monkeypatch) -> None:
        import dependencies

        dependencies._memory_state.clear()
        dependencies._memory_state["test:key:ttl"] = ({"existing": True}, 101.0)
        monkeypatch.setattr(dependencies.time, "time", lambda: 100.0)

        asyncio.run(
            dependencies._merge_state(
                "test:key:ttl", {"updated": True}, expire_seconds=60
            )
        )

        data, expires_at = dependencies._memory_state["test:key:ttl"]
        assert data == {"existing": True, "updated": True}
        assert expires_at == 160.0


class _RaceExposingRedisFake:
    """Fake Redis that forces read/modify/write callers to race."""

    def __init__(self, expected_readers: int) -> None:
        self.store: dict[str, str] = {}
        self.expiries: dict[str, int] = {}
        self.expected_readers = expected_readers
        self._readers_ready = asyncio.Event()
        self._read_count = 0
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> str | None:
        self._read_count += 1
        if self._read_count == self.expected_readers:
            self._readers_ready.set()
        await self._readers_ready.wait()
        await asyncio.sleep(0)
        return self.store.get(key)

    async def set(self, key: str, value: str, ex: int) -> None:
        await asyncio.sleep(0)
        self.store[key] = value
        self.expiries[key] = ex

    async def eval(self, script: str, numkeys: int, *args: Any) -> str:
        key, updates_json, expire_seconds = args
        async with self._lock:
            current = json.loads(self.store.get(key, "{}"))
            current.update(json.loads(updates_json))
            encoded = json.dumps(current)
            self.store[key] = encoded
            self.expiries[key] = int(expire_seconds)
            return encoded


def test_update_session_data_preserves_concurrent_partial_updates(monkeypatch) -> None:
    import dependencies
    from service import redis_service

    concurrent_updates = 20
    request = MagicMock()
    request.cookies = {dependencies.Config.SESSION_COOKIE_NAME: "session-cookie"}
    fake = _RaceExposingRedisFake(expected_readers=concurrent_updates)
    monkeypatch.setattr(redis_service, "_redis_client", fake)
    monkeypatch.setattr(dependencies.time, "time", lambda: 123.0)

    async def scenario() -> None:
        results = await asyncio.gather(
            *(
                dependencies.update_session_data(
                    request, {f"setting_{index}": index}, expire_seconds=75
                )
                for index in range(concurrent_updates)
            )
        )
        assert results == [True] * concurrent_updates

    asyncio.run(scenario())

    key = dependencies.state_key_from_session_cookie("session-cookie")
    assert json.loads(fake.store[key]) == {
        **{f"setting_{index}": index for index in range(concurrent_updates)},
        "session_active_at": 123.0,
    }
    assert fake.expiries[key] == 75


def test_replace_session_data_removes_stale_fields(monkeypatch) -> None:
    import dependencies
    from service import redis_service

    fake = _RaceExposingRedisFake(expected_readers=1)
    session_cookie = "fresh-cookie"
    key = dependencies.state_key_from_session_cookie(session_cookie)
    fake.store[key] = json.dumps({"stale": "value", "db_config": {"old": True}})
    monkeypatch.setattr(redis_service, "_redis_client", fake)
    monkeypatch.setattr(dependencies.time, "time", lambda: 456.0)

    asyncio.run(
        dependencies.replace_session_data_for_cookie(
            session_cookie, {"db_config": None}, expire_seconds=80
        )
    )

    assert json.loads(fake.store[key]) == {"db_config": None, "session_active_at": 456.0}
    assert fake.expiries[key] == 80


def test_private_cached_db_reader_preserves_session_lifecycle(monkeypatch) -> None:
    """The private state reader still returns cached config and refreshes activity."""
    import dependencies
    from service import redis_service

    fake = _RaceExposingRedisFake(expected_readers=1)
    session_cookie = "cached-config-cookie"
    key = dependencies.state_key_from_session_cookie(session_cookie)
    db_config = {"db_type": "postgresql", "database": "moonlit"}
    fake.store[key] = json.dumps(
        {
            "db_config": db_config,
            "db_config_last_closed_at": None,
            "db_config_last_used_at": 100.0,
            "session_active_at": 100.0,
        }
    )
    monkeypatch.setattr(redis_service, "_redis_client", fake)
    monkeypatch.setattr(dependencies.time, "time", lambda: 200.0)
    request = MagicMock()
    request.cookies = {dependencies.Config.SESSION_COOKIE_NAME: session_cookie}
    request.state = MagicMock(spec=[])

    result = asyncio.run(dependencies._get_cached_db_config(request))

    assert result == db_config
    assert json.loads(fake.store[key]) == {
        "db_config": db_config,
        "db_config_last_closed_at": None,
        "db_config_last_used_at": 200.0,
        "session_active_at": 200.0,
    }


def test_require_authenticated_db_config_rejects_missing_config() -> None:
    """Authenticated routes without cached configuration retain the public 400 contract."""
    from fastapi import HTTPException

    import dependencies

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(dependencies.require_authenticated_db_config(None))

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "No database configured. Please connect to a database first."
