"""Run real ProviderRateLimiter against deterministic Redis command doubles."""
import graph_common
import asyncio
import json
from types import SimpleNamespace
from unittest.mock import patch

from llm_provider import rate_limiter as mod


class RedisCommands:
    """Model only Lua atomic effects, PEXPIRE, ZREM and DECR; no sockets."""
    def __init__(self):
        self.now = 0.0
        self.conc = 0
        self.expires = None
        self.rpm = set()
        self.commit_seen = asyncio.Event()
        self.block_response = False

    async def eval(self, script, numkeys, key, *args):
        assert numkeys == 1
        if script == mod._RATE_LIMIT_LUA:
            self.rpm.add((key, args[-1]))
            return 1
        assert script == mod._CONCURRENCY_ACQUIRE_LUA
        if self.expires is not None and self.now >= self.expires:
            self.conc = 0
            self.expires = None
        if self.conc >= int(args[0]):
            return 0
        self.conc += 1
        self.expires = self.now + 120
        self.commit_seen.set()
        if self.block_response:
            await asyncio.Event().wait()
        return 1

    async def zrem(self, key, member):
        self.rpm.discard((key, member))

    async def decr(self, key):
        self.conc -= 1
        return self.conc

    async def set(self, key, value):
        self.conc = value


def limiter(redis):
    return mod.ProviderRateLimiter(SimpleNamespace(
        LLM_RATELIMIT_ENABLED=True, LLM_MAX_RPM_PER_KEY=100,
        LLM_MAX_CONCURRENT=1, LLM_QUEUE_TIMEOUT=1,
        LLM_ACCOUNT_MAX_RPM=0,
    ), redis_client=redis)


async def main():
    with patch.object(mod, "get_provider_api_key", return_value="synthetic-test-credential"):
        redis = RedisCommands()
        redis.block_response = True
        rl = limiter(redis)
        request = asyncio.create_task(rl.acquire("bedrock", "synthetic-user"))
        await redis.commit_seen.wait()
        before_cancel = redis.conc
        request.cancel()
        try:
            await request
        except asyncio.CancelledError:
            pass
        cancelled = {"redis_concurrency_before_cancel": before_cancel,
                     "redis_concurrency_after_cancel": redis.conc,
                     "rpm_after_cancel": len(redis.rpm),
                     "caller_received_ownership": False}
        assert cancelled["redis_concurrency_after_cancel"] == 1
        assert cancelled["rpm_after_cancel"] == 0

        redis = RedisCommands()
        rl = limiter(redis)
        accepted_a, _ = await rl.acquire("bedrock", "synthetic-user")
        redis.now = 121
        accepted_b, _ = await rl.acquire("bedrock", "synthetic-user")
        after_b = redis.conc
        await rl.release("bedrock", "synthetic-user")  # A ends while B is active.
        after_a_release = redis.conc
        accepted_c, _ = await rl.acquire("bedrock", "synthetic-user")
        expired = {"max_concurrent": 1, "A_at_0": accepted_a,
                   "B_at_121_A_still_active": accepted_b,
                   "counter_after_B": after_b,
                   "counter_after_A_release_B_still_active": after_a_release,
                   "C_while_B_still_active": accepted_c}
        assert accepted_a and accepted_b and accepted_c
        print(json.dumps({"F27": cancelled, "F28": expired}, sort_keys=True))


asyncio.run(main())
