"""
User Quota Service - Per-user rate limiting using Redis.

Three-tier sliding quota system
-------------------------------
Every authenticated chat request increments three Redis counters keyed by
``quota:{user_id}:{minute|hour|day}``. Each key has a TTL equal to its window
length, so the counters self-expire at the close of their window.

Atomicity contract
~~~~~~~~~~~~~~~~~~
INCR and the conditional EXPIRE (only set on the FIRST increment of a fresh
window) must execute atomically. If they were separated (as they were before
FIX [H16]), a process crash between the two would leave a counter with value
``1`` and no TTL — the user would be permanently locked out of that window.
``check_and_increment`` therefore uses a single Lua script (``_INCR_WITH_EXPIRE``)
that does both in one round-trip.

Refund semantics
~~~~~~~~~~~~~~~~
Quota is debited *before* the LLM call. If the LLM call never produces
user-visible output (rate-limiter rejection, network error before the first
token), the request did not actually consume LLM tokens, so the caller MUST
invoke :py:meth:`refund` to release the debited counters. If the stream
delivered partial content, the caller MUST NOT refund — the user did consume
LLM tokens for that turn. See FIX [C4].
"""

import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)


# FIX [H16]: Atomic INCR + conditional EXPIRE in a single Redis round-trip.
# Previously the two operations were in separate pipelines; a process crash
# between them left the counter with no TTL and the user was permanently
# locked out of that quota window.
_INCR_WITH_EXPIRE = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
"""


@dataclass
class UserQuotaConfig:
    """Configuration for per-user quota."""

    enabled: bool
    per_minute: int
    per_hour: int
    per_day: int
    minute_ttl_seconds: int
    hour_ttl_seconds: int
    day_ttl_seconds: int


@dataclass
class QuotaUsage:
    """Current quota usage for a user."""

    minute: dict  # {"used": int, "limit": int, "resets_in": int}
    hour: dict
    day: dict

    def to_dict(self) -> dict:
        """Return a plain-dict view of the usage windows for JSON serialization."""
        return {"minute": self.minute, "hour": self.hour, "day": self.day}


class UserQuotaService:
    """
    Per-user quota tracking using Redis.

    Uses Redis keys with configurable TTLs for automatic expiration:
    - quota:{user_id}:minute
    - quota:{user_id}:hour
    - quota:{user_id}:day
    """

    def __init__(self, redis_client, config: UserQuotaConfig):
        """Initialize the service with a Redis client and quota configuration."""
        self.redis = redis_client
        self.config = config

        self.limits = {
            "minute": (config.per_minute, config.minute_ttl_seconds),
            "hour": (config.per_hour, config.hour_ttl_seconds),
            "day": (config.per_day, config.day_ttl_seconds),
        }

        if config.enabled:
            logger.info(
                f"👤 UserQuotaService initialized: {config.per_minute}/min, {config.per_hour}/hr, {config.per_day}/day"
            )

    def _get_key(self, user_id: str, timeframe: str) -> str:
        """Generate Redis key for user quota."""
        return f"quota:{user_id}:{timeframe}"

    async def check_and_increment(self, user_id: str) -> tuple[bool, QuotaUsage]:
        """
        Check if user is within quota and atomically increment all three counters.

        Uses a single Lua script per timeframe so that INCR and the conditional
        EXPIRE execute as one atomic Redis operation (FIX [H16]). The EXPIRE is
        applied only when the INCR returns ``1`` (i.e. the key was just created);
        subsequent increments reuse the existing TTL.

        Args:
            user_id: The user's ID

        Returns:
            tuple: (allowed: bool, usage: QuotaUsage)
            - allowed=True: Request can proceed
            - allowed=False: Quota exceeded (counters already reverted)
        """
        if not self.config.enabled:
            return True, QuotaUsage(
                minute={"used": 0, "limit": self.config.per_minute, "resets_in": 0},
                hour={"used": 0, "limit": self.config.per_hour, "resets_in": 0},
                day={"used": 0, "limit": self.config.per_day, "resets_in": 0},
            )

        if not self.redis:
            logger.warning("Redis not available, skipping quota check")
            return True, QuotaUsage(
                minute={"used": 0, "limit": self.config.per_minute, "resets_in": 0},
                hour={"used": 0, "limit": self.config.per_hour, "resets_in": 0},
                day={"used": 0, "limit": self.config.per_day, "resets_in": 0},
            )

        usage_data = {}
        exceeded_timeframe = None

        # FIX [H16]: Atomic INCR + conditional EXPIRE in a single round-trip
        # per timeframe. Previously the INCR pipeline and the EXPIRE pipeline
        # were separate; a crash between them left the counter with no TTL and
        # the user was permanently locked out of that quota window.
        for timeframe, (limit, ttl) in self.limits.items():
            key = self._get_key(user_id, timeframe)
            # A failed response may hide a completed INCR. Fail closed rather
            # than replaying it or splitting INCR from EXPIRE. Earlier windows
            # may remain debited until expiry when the outcome is uncertain.
            count = await self.redis.eval(_INCR_WITH_EXPIRE, 1, key, ttl)
            if int(count) > limit:
                exceeded_timeframe = timeframe
            usage_data[timeframe] = {
                "used": int(count),
                "limit": limit,
            }

        if exceeded_timeframe:
            await self.refund(user_id)
            logger.warning(f"User {user_id} exceeded {exceeded_timeframe} quota")
            # We don't have exact TTLs here for the rejected payload, but 0 is fine
            for tf in self.limits.keys():
                usage_data[tf]["used"] -= 1
                usage_data[tf]["resets_in"] = 0

            return False, QuotaUsage(
                minute=usage_data.get("minute", {}),
                hour=usage_data.get("hour", {}),
                day=usage_data.get("day", {}),
            )

        # Look up the remaining TTL for each window so the UI can display
        # "resets in" countdowns. INCR has already been applied atomically,
        # so this is a read-only follow-up.
        for timeframe, (limit, ttl) in self.limits.items():
            key = self._get_key(user_id, timeframe)
            try:
                remaining_ttl = await self.redis.ttl(key)
            except Exception:
                remaining_ttl = -1
            if remaining_ttl is None or remaining_ttl < 0:
                remaining_ttl = ttl
            usage_data[timeframe]["resets_in"] = int(remaining_ttl)

        usage = QuotaUsage(
            minute=usage_data.get("minute", {}),
            hour=usage_data.get("hour", {}),
            day=usage_data.get("day", {}),
        )

        logger.debug(f"User {user_id} quota: {usage.minute['used']}/min, {usage.hour['used']}/hr")
        return True, usage

    async def refund(self, user_id: str) -> None:
        """Best-effort decrement of all three quota counters by one.

        Called by :func:`_handle_agent_stream` (FIX [C4]) on any failure path
        where the user never received LLM output: rate-limiter rejection, stream
        errors before the first token, or graph setup failures. If the stream
        delivered partial content the caller MUST NOT invoke this — the user
        consumed LLM tokens for that turn and a refund would let them bypass the
        quota.

        The decrement is best-effort: a Redis hiccup during refund is logged
        but not raised, because the request has already failed and the caller
        cannot meaningfully retry.

        FIX [AUDIT-2-B]: the previous implementation used ``DECR`` without a
        floor, so a refund on an already-zero counter would push the value
        to -1, allowing the next ``INCR`` to surface ``used=0`` even though
        a request had been served. We now use a Lua script that clamps the
        decrement at zero (``DECR-with-floor``), so refunds on zero counters
        are no-ops.

        Args:
            user_id: The user whose counters should be decremented.
        """
        if not self.config.enabled or not self.redis:
            return

        # FIX [AUDIT-2-B]: Lua script that decrements only if the current
        # value is > 0. This prevents refunds on already-zero counters
        # from driving the counter negative and allowing a free request
        # on the next increment.
        decr_with_floor_lua = """
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if current > 0 then
  return redis.call('DECR', KEYS[1])
end
return current
"""
        # FIX [C4]: Quota was incremented before the LLM call but never refunded
        # on failure. Users burned their entire daily quota during transient
        # outages. Now we refund on errors that produce no user-visible output.
        try:
            pipe = self.redis.pipeline()
            for timeframe in self.limits:
                key = self._get_key(user_id, timeframe)
                pipe.eval(decr_with_floor_lua, 1, key)
            await pipe.execute()
        except Exception as exc:
            # The transaction may already have executed. Replaying DECR could
            # refund another request, even with the zero floor.
            logger.warning("Quota refund outcome uncertain for user %s: %s", user_id, exc)

    async def get_usage(self, user_id: str) -> QuotaUsage:
        """
        Get current quota usage for a user (without incrementing).

        Reads the live counter values and TTLs from Redis so the UI can display
        the remaining request allowance and a "resets in" countdown per window.

        Args:
            user_id: The user's ID

        Returns:
            QuotaUsage with current counts and reset times
        """
        if not self.config.enabled or not self.redis:
            return QuotaUsage(
                minute={"used": 0, "limit": self.config.per_minute, "resets_in": 0},
                hour={"used": 0, "limit": self.config.per_hour, "resets_in": 0},
                day={"used": 0, "limit": self.config.per_day, "resets_in": 0},
            )

        usage_data = {}

        for timeframe, (limit, ttl) in self.limits.items():
            key = self._get_key(user_id, timeframe)

            current = await self.redis.get(key)
            current_count = int(current) if current else 0

            remaining_ttl = await self.redis.ttl(key)
            if remaining_ttl < 0:
                remaining_ttl = ttl

            usage_data[timeframe] = {
                "used": current_count,
                "limit": limit,
                "resets_in": remaining_ttl,
            }

        return QuotaUsage(
            minute=usage_data.get("minute", {}),
            hour=usage_data.get("hour", {}),
            day=usage_data.get("day", {}),
        )

    async def delete_user_usage(self, user_id: str) -> None:
        """Delete all short-lived quota counters for an erased account."""
        if not self.redis:
            return
        keys = [self._get_key(user_id, timeframe) for timeframe in self.limits]
        await self.redis.delete(*keys)


def create_user_quota_service(redis_client, app_config) -> UserQuotaService:
    """
    Factory function to create UserQuotaService from application config.

    Args:
        redis_client: Redis client instance (can be None)
        app_config: Application configuration class

    Returns:
        Configured UserQuotaService instance
    """
    config = UserQuotaConfig(
        enabled=getattr(app_config, "USER_QUOTA_ENABLED", True),
        per_minute=getattr(app_config, "USER_QUOTA_PER_MINUTE", 4),
        per_hour=getattr(app_config, "USER_QUOTA_PER_HOUR", 100),
        per_day=getattr(app_config, "USER_QUOTA_PER_DAY", 500),
        minute_ttl_seconds=getattr(app_config, "USER_QUOTA_MINUTE_TTL_SECONDS", 60),
        hour_ttl_seconds=getattr(app_config, "USER_QUOTA_HOUR_TTL_SECONDS", 3600),
        day_ttl_seconds=getattr(app_config, "USER_QUOTA_DAY_TTL_SECONDS", 86400),
    )
    return UserQuotaService(redis_client, config)
