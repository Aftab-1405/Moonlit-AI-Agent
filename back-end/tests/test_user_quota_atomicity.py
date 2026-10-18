"""Lost Redis responses must never trigger a second quota mutation."""

from collections import defaultdict

import pytest

from service.quota.user_quota_service import UserQuotaConfig, UserQuotaService


class QuotaRedis:
    def __init__(self, fail_window=None, refund_response_lost=False):
        self.counts = defaultdict(int)
        self.ttls = {}
        self.fail_window = fail_window
        self.refund_response_lost = refund_response_lost

    async def incr(self, key):
        self.counts[key] += 1
        return self.counts[key]

    async def expire(self, key, ttl):
        self.ttls[key] = ttl

    async def ttl(self, key):
        return self.ttls.get(key, -2)

    async def eval(self, script, numkeys, key, *args):
        if args:
            count = await self.incr(key)
            if count == 1:
                await self.expire(key, args[0])
            if key.endswith(self.fail_window or "never"):
                raise ConnectionError("increment response lost")
            return count
        self.counts[key] = max(self.counts[key] - 1, 0)
        return self.counts[key]

    def pipeline(self):
        redis = self

        class Pipeline:
            def __init__(self):
                self.commands = []

            def eval(self, *args):
                self.commands.append(args)

            async def execute(self):
                for args in self.commands:
                    await redis.eval(*args)
                if redis.refund_response_lost:
                    raise ConnectionError("refund response lost")

        return Pipeline()


def service(redis):
    return UserQuotaService(redis, UserQuotaConfig(True, 4, 100, 500, 60, 3600, 86400))


@pytest.mark.asyncio
@pytest.mark.parametrize("window", ["minute", "hour", "day"])
async def test_uncertain_debit_fails_closed_without_replaying_increment(window):
    redis = QuotaRedis(fail_window=window)

    with pytest.raises(ConnectionError):
        await service(redis).check_and_increment("u")

    assert all(count == 1 for count in redis.counts.values())
    assert all(key in redis.ttls for key in redis.counts)


@pytest.mark.asyncio
async def test_lost_refund_response_does_not_refund_other_requests():
    redis = QuotaRedis(refund_response_lost=True)
    subject = service(redis)
    await subject.check_and_increment("u")
    await subject.check_and_increment("u")

    await subject.refund("u")

    assert dict(redis.counts) == {
        "quota:u:minute": 1,
        "quota:u:hour": 1,
        "quota:u:day": 1,
    }


@pytest.mark.asyncio
async def test_quota_rejection_preserves_preexisting_usage_and_expiry():
    redis = QuotaRedis()
    subject = service(redis)
    for _ in range(4):
        allowed, _ = await subject.check_and_increment("u")
        assert allowed
    allowed, usage = await subject.check_and_increment("u")

    assert not allowed
    assert usage.minute["used"] == 4
    assert list(redis.counts.values()) == [4, 4, 4]
    assert redis.ttls == {"quota:u:minute": 60, "quota:u:hour": 3600, "quota:u:day": 86400}
