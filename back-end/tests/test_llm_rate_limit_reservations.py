"""Reservations must represent admitted calls, including under contention."""

import asyncio
from collections import defaultdict
from types import SimpleNamespace

import pytest

from llm_provider import rate_limiter


class RedisReservations:
    """Stateful Redis boundary double; inject failures after RPM writes."""

    def __init__(self, failure=None):
        self.members = defaultdict(set)
        self.concurrent = defaultdict(int)
        self.failure = failure

    async def eval(self, script, numkeys, key, *args):
        if script == rate_limiter._CONCURRENCY_ACQUIRE_LUA:
            if self.failure == "concurrency_error":
                raise ConnectionError("response lost")
            if self.failure == "cancel":
                raise asyncio.CancelledError()
            if self.concurrent[key] >= args[0]:
                return 0
            self.concurrent[key] += 1
            return 1
        if script == rate_limiter._RATE_LIMIT_LUA:
            _, _, limit, member = args
            if self.failure == "user_error" and ":account:" not in key:
                # The write completed, but its acknowledgement was lost.
                self.members[key].add(member)
                raise ConnectionError("response lost")
            if len(self.members[key]) >= limit:
                return 0
            self.members[key].add(member)
            return 1
        # The former refund script accessed nonexistent ARGV[2]. Redis
        # rejects that ZREM call rather than removing the reservation.
        raise ValueError("Lua redis command arguments must be strings or integers")

    async def zrem(self, key, member):
        self.members[key].discard(member)


def limiter(redis, **overrides):
    config = dict(LLM_MAX_RPM_PER_KEY=10, LLM_MAX_CONCURRENT=10, LLM_QUEUE_TIMEOUT=0, LLM_ACCOUNT_MAX_RPM=10)
    config.update(overrides)
    return rate_limiter.ProviderRateLimiter(SimpleNamespace(**config), redis)


@pytest.mark.asyncio
async def test_simultaneous_calls_have_distinct_rpm_reservations(monkeypatch):
    redis = RedisReservations()
    subject = limiter(redis, LLM_MAX_RPM_PER_KEY=2)
    monkeypatch.setattr(rate_limiter.time, "time", lambda: 1000)

    results = await asyncio.gather(*[subject._acquire_redis("bedrock", "u", "key") for _ in range(3)])

    assert results == [(True, "key"), (True, "key"), (False, None)]
    assert len(redis.members["llm_ratelimit:bedrock:u:rpm"]) == 2
    assert len(redis.members["llm_ratelimit:bedrock:account:rpm"]) == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", ["user_full", "concurrency_full", "user_error", "concurrency_error"])
async def test_denied_call_returns_all_its_rpm_reservations(failure):
    redis = RedisReservations(failure)
    subject = limiter(redis)
    if failure == "user_full":
        subject.app_config.LLM_MAX_RPM_PER_KEY = 0
    if failure == "concurrency_full":
        subject.app_config.LLM_MAX_CONCURRENT = 0

    assert await subject._acquire_redis("bedrock", "u", "key") == (False, None)
    assert not redis.members["llm_ratelimit:bedrock:account:rpm"]
    assert not redis.members["llm_ratelimit:bedrock:u:rpm"]


@pytest.mark.asyncio
async def test_cancelled_call_returns_all_its_rpm_reservations():
    redis = RedisReservations("cancel")
    subject = limiter(redis)

    with pytest.raises(asyncio.CancelledError):
        await subject._acquire_redis("bedrock", "u", "key")

    assert not redis.members["llm_ratelimit:bedrock:account:rpm"]
    assert not redis.members["llm_ratelimit:bedrock:u:rpm"]


@pytest.mark.asyncio
async def test_retry_refunds_before_waiting_and_admits_once(monkeypatch):
    redis = RedisReservations()
    subject = limiter(redis, LLM_QUEUE_TIMEOUT=1, LLM_ACCOUNT_MAX_RPM=1)
    redis.concurrent["llm_ratelimit:bedrock:u:conc"] = 10

    async def release_contention(_):
        assert not redis.members["llm_ratelimit:bedrock:account:rpm"]
        assert not redis.members["llm_ratelimit:bedrock:u:rpm"]
        redis.concurrent["llm_ratelimit:bedrock:u:conc"] = 0

    monkeypatch.setattr(rate_limiter.asyncio, "sleep", release_contention)
    assert await subject._acquire_redis("bedrock", "u", "key") == (True, "key")
    assert len(redis.members["llm_ratelimit:bedrock:account:rpm"]) == 1
    assert len(redis.members["llm_ratelimit:bedrock:u:rpm"]) == 1
