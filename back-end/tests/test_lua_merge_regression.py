"""Regression tests for atomic Redis-backed session-state merges."""

from __future__ import annotations

import asyncio
import json
from typing import Any

import pytest


class _AtomicRedisFake:
    """Execute the EVAL boundary atomically while recording its contract."""

    def __init__(self) -> None:
        self.store: dict[str, str] = {}
        self.expiries: dict[str, int] = {}
        self.eval_calls: list[tuple[str, int, tuple[Any, ...]]] = []
        self.get_called = False
        self.set_called = False
        self._lock = asyncio.Lock()

    async def eval(self, script: str, numkeys: int, *args: Any) -> str:
        self.eval_calls.append((script, numkeys, args))
        key, updates_json, expire_seconds = args
        async with self._lock:
            current = json.loads(self.store.get(key, "{}"))
            updates = json.loads(updates_json)
            if not isinstance(current, dict):
                raise RuntimeError("session state must be a JSON object")
            if not isinstance(updates, dict):
                raise RuntimeError("session updates must be a JSON object")
            await asyncio.sleep(0)
            current.update(updates)
            encoded = json.dumps(current)
            self.store[key] = encoded
            self.expiries[key] = int(expire_seconds)
            return encoded

    async def get(self, key: str) -> str | None:
        self.get_called = True
        return self.store.get(key)

    async def set(self, key: str, value: str, ex: int) -> None:
        self.set_called = True


class _FailingEvalRedis:
    def __init__(self) -> None:
        self.get_called = False
        self.set_called = False

    async def eval(self, script: str, numkeys: int, *args: Any) -> str:
        raise RuntimeError("EVAL unavailable")

    async def get(self, key: str) -> str | None:
        self.get_called = True
        return None

    async def set(self, key: str, value: str, ex: int) -> None:
        self.set_called = True


class _NonObjectEvalRedis(_FailingEvalRedis):
    async def eval(self, script: str, numkeys: int, *args: Any) -> str:
        return json.dumps(["not", "an", "object"])



def test_redis_merge_uses_one_eval_and_refreshes_ttl(monkeypatch) -> None:
    from dependencies import _merge_state
    from service import redis_service

    async def scenario() -> tuple[dict, _AtomicRedisFake]:
        fake = _AtomicRedisFake()
        fake.store["session:1"] = json.dumps({"existing": True})
        monkeypatch.setattr(redis_service, "_redis_client", fake)
        result = await _merge_state("session:1", {"updated": True}, expire_seconds=90)
        return result, fake

    result, fake = asyncio.run(scenario())

    assert result == {"existing": True, "updated": True}
    assert fake.expiries["session:1"] == 90
    assert len(fake.eval_calls) == 1
    _, numkeys, args = fake.eval_calls[0]
    assert numkeys == 1
    assert args == ("session:1", '{"updated":true}', 90)


def test_redis_merge_shallowly_overwrites_nested_state_and_preserves_none(
    monkeypatch,
) -> None:
    from dependencies import _merge_state
    from service import redis_service

    async def scenario() -> tuple[dict, _AtomicRedisFake]:
        fake = _AtomicRedisFake()
        fake.store["session:shallow"] = json.dumps(
            {
                "preferences": {"theme": "dark", "density": "compact"},
                "unrelated": "preserved",
                "clearable": "present",
            }
        )
        monkeypatch.setattr(redis_service, "_redis_client", fake)
        result = await _merge_state(
            "session:shallow",
            {"preferences": {"theme": "light"}, "clearable": None},
            expire_seconds=90,
        )
        return result, fake

    result, fake = asyncio.run(scenario())

    expected = {
        "preferences": {"theme": "light"},
        "unrelated": "preserved",
        "clearable": None,
    }
    assert result == expected
    assert json.loads(fake.store["session:shallow"]) == expected
    assert fake.expiries["session:shallow"] == 90


def test_concurrent_redis_merges_preserve_every_field(monkeypatch) -> None:
    from dependencies import _merge_state
    from service import redis_service

    async def scenario() -> tuple[dict, _AtomicRedisFake]:
        fake = _AtomicRedisFake()
        monkeypatch.setattr(redis_service, "_redis_client", fake)
        await asyncio.gather(
            *(
                _merge_state("session:2", {f"key_{index}": index}, 60)
                for index in range(20)
            )
        )
        return json.loads(fake.store["session:2"]), fake

    merged, fake = asyncio.run(scenario())

    assert merged == {f"key_{index}": index for index in range(20)}
    assert len(fake.eval_calls) == 20


def test_non_object_updates_are_rejected_before_eval_or_mutation(monkeypatch) -> None:
    from dependencies import _merge_state
    from service import redis_service

    fake = _AtomicRedisFake()
    fake.store["session:updates-array"] = json.dumps({"existing": True})
    monkeypatch.setattr(redis_service, "_redis_client", fake)

    with pytest.raises(ValueError, match="Session state updates must be a JSON object"):
        asyncio.run(_merge_state("session:updates-array", ["not", "an", "object"], 60))

    assert fake.store["session:updates-array"] == '{"existing": true}'
    assert fake.expiries == {}
    assert fake.eval_calls == []
    assert fake.get_called is False
    assert fake.set_called is False


def test_stored_array_state_fails_closed_before_mutation(monkeypatch) -> None:
    from dependencies import _merge_state
    from service import redis_service

    fake = _AtomicRedisFake()
    fake.store["session:stored-array"] = "  [\"not\", \"an\", \"object\"]"
    monkeypatch.setattr(redis_service, "_redis_client", fake)

    with pytest.raises(RuntimeError, match="Atomic Redis session update failed"):
        asyncio.run(_merge_state("session:stored-array", {"updated": True}, 60))

    assert fake.store["session:stored-array"] == "  [\"not\", \"an\", \"object\"]"
    assert fake.expiries == {}
    assert len(fake.eval_calls) == 1
    assert fake.get_called is False
    assert fake.set_called is False


@pytest.mark.parametrize("fake", [_FailingEvalRedis(), _NonObjectEvalRedis()])
def test_redis_merge_failures_fail_closed_without_get_set_fallback(
    monkeypatch, fake: _FailingEvalRedis
) -> None:
    from dependencies import _merge_state
    from service import redis_service

    monkeypatch.setattr(redis_service, "_redis_client", fake)

    with pytest.raises(RuntimeError, match="Atomic Redis session update failed"):
        asyncio.run(_merge_state("session:3", {"field": "value"}, 60))

    assert fake.get_called is False
    assert fake.set_called is False
