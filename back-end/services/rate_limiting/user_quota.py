"""
User Quota Service - Per-user rate limiting using Redis.

Tracks per-user request counts across multiple timeframes (minute, hour, day)
to ensure fair usage distribution.
"""

import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class UserQuotaConfig:
    """Configuration for per-user quota."""

    enabled: bool
    per_minute: int
    per_hour: int
    per_day: int


@dataclass
class QuotaUsage:
    """Current quota usage for a user."""

    minute: dict  # {"used": int, "limit": int, "resets_in": int}
    hour: dict
    day: dict

    def to_dict(self) -> dict:
        return {"minute": self.minute, "hour": self.hour, "day": self.day}


class UserQuotaService:
    """
    Per-user quota tracking using Redis.

    Uses Redis keys with TTL for automatic expiration:
    - quota:{user_id}:minute (TTL 60s)
    - quota:{user_id}:hour (TTL 3600s)
    - quota:{user_id}:day (TTL 86400s)
    """

    def __init__(self, redis_client, config: UserQuotaConfig):
        self.redis = redis_client
        self.config = config

        self.limits = {
            "minute": (config.per_minute, 60),
            "hour": (config.per_hour, 3600),
            "day": (config.per_day, 86400),
        }

        if config.enabled:
            logger.info(
                f"👤 UserQuotaService initialized: "
                f"{config.per_minute}/min, {config.per_hour}/hr, {config.per_day}/day"
            )

    def _get_key(self, user_id: str, timeframe: str) -> str:
        """Generate Redis key for user quota."""
        return f"quota:{user_id}:{timeframe}"

    async def check_and_increment(self, user_id: str) -> tuple[bool, QuotaUsage]:
        """
        Check if user is within quota and increment counters.

        Args:
            user_id: The user's ID

        Returns:
            tuple: (allowed: bool, usage: QuotaUsage)
            - allowed=True: Request can proceed
            - allowed=False: Quota exceeded
        """
        if not self.config.enabled:
            # Quota disabled - always allow
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

        # Check all timeframes
        for timeframe, (limit, ttl) in self.limits.items():
            key = self._get_key(user_id, timeframe)

            # Get current count
            current = await self.redis.get(key)
            current_count = int(current) if current else 0

            # Get TTL for reset time
            remaining_ttl = await self.redis.ttl(key)
            if remaining_ttl < 0:
                remaining_ttl = ttl

            usage_data[timeframe] = {
                "used": current_count,
                "limit": limit,
                "resets_in": remaining_ttl,
            }

            # Check if exceeded
            if current_count >= limit:
                exceeded_timeframe = timeframe

        usage = QuotaUsage(
            minute=usage_data.get("minute", {}),
            hour=usage_data.get("hour", {}),
            day=usage_data.get("day", {}),
        )

        if exceeded_timeframe:
            logger.warning(f"User {user_id} exceeded {exceeded_timeframe} quota")
            return False, usage

        # Increment all counters (atomic pipeline)
        pipe = self.redis.pipeline()
        for timeframe, (limit, ttl) in self.limits.items():
            key = self._get_key(user_id, timeframe)
            pipe.incr(key)
            pipe.expire(key, ttl)
        await pipe.execute()

        # Update usage with incremented values
        usage.minute["used"] += 1
        usage.hour["used"] += 1
        usage.day["used"] += 1

        logger.debug(
            f"User {user_id} quota: {usage.minute['used']}/min, {usage.hour['used']}/hr"
        )
        return True, usage

    async def get_usage(self, user_id: str) -> QuotaUsage:
        """
        Get current quota usage for a user (without incrementing).

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
    )
    return UserQuotaService(redis_client, config)
