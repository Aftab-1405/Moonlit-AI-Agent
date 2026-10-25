"""Bedrock boto3 + LangChain client construction.

Retry budget
------------
FIX [M22]: Two independent retry layers used to multiply: boto3's
``Config(retries={"max_attempts": 10})`` on the ``bedrock-runtime`` client
AND LangChain's ``ChatBedrockConverse(max_retries=10)``. Worst case was
10 × 10 = 100 attempts on a transient 5xx — over 10 minutes wall-clock
holding the rate-limiter semaphore and the user's HTTP connection open.
The two are now bounded at boto3 ``max_attempts=2`` × LangChain
``max_retries=3`` = ~6 total attempts.

Credential rotation
-------------------
FIX [M23]: When ``AWS_ACCESS_KEY_ID`` is not set in the environment we
do NOT pass explicit ``aws_access_key_id`` / ``aws_secret_access_key`` /
``aws_session_token`` kwargs to ``ChatBedrockConverse`` or
``boto3.client``. This lets boto3's default credential chain (env vars,
``~/.aws/credentials``, EC2/ECS task role, SSO) resolve and ROTATE
credentials automatically. The previous code passed explicit credentials
captured at process start into an ``@lru_cache``-d ChatBedrockConverse
instance — temporary credentials from ``aws sso login`` expired ~1h later
and every subsequent LLM call failed with ``ExpiredTokenException``.

FIX [AUDIT-2-C]: ``@lru_cache``-d boto3 clients and ChatBedrockConverse
instances still held stale credentials even after FIX [M23], because
``lru_cache`` never invalidates by time. Replaced with
``cachetools.TTLCache`` (TTL = ``BEDROCK_CLIENT_TTL_SECONDS``, default
50 minutes — well below the typical 1h SSO credential lifetime) so the
cached client is rebuilt and boto3's credential chain is re-evaluated
before the credentials expire.
"""

import logging
import os
import threading

import boto3
from cachetools import TTLCache
from langchain_aws import ChatBedrockConverse

from config import get_config
from llm_provider.model_capabilities import model_capability

logger = logging.getLogger(__name__)
Config = get_config()

#: TTL for cached boto3 / LangChain clients. Defaults to 50 minutes,
#: safely below the typical 1h SSO / EC2 IMDS credential lifetime. May
#: be overridden via the ``BEDROCK_CLIENT_TTL_SECONDS`` env var.
_BEDROCK_CLIENT_TTL_SECONDS: int = int(os.getenv("BEDROCK_CLIENT_TTL_SECONDS", "3000"))

#: TTL caches keyed by region (control client) or model+temperature
#: (ChatBedrockConverse). The ``maxsize`` is intentionally small — there
#: are only a handful of distinct regions/models in use at any time.
_bedrock_control_cache: TTLCache = TTLCache(maxsize=4, ttl=_BEDROCK_CLIENT_TTL_SECONDS)
_bedrock_runtime_cache: TTLCache = TTLCache(maxsize=4, ttl=_BEDROCK_CLIENT_TTL_SECONDS)
_inference_profiles_cache: TTLCache = TTLCache(maxsize=4, ttl=_BEDROCK_CLIENT_TTL_SECONDS)

#: Locks guarding cache writes (TTLCache is not thread-safe for
#: concurrent misses on the same key).
_control_lock = threading.Lock()
_runtime_lock = threading.Lock()
_profiles_lock = threading.Lock()

_GEOGRAPHY_PREFIXES = ("us.", "eu.", "apac.", "ap.")


def _retry_config():
    """Botocore Config with a bounded retry budget (FIX [M22]).

    Combined with ``ChatBedrockConverse(max_retries=3)`` the worst-case
    total attempt count is ~6 instead of the previous 100. ``mode=adaptive``
    adds client-side throttling on top of the retry budget so a Bedrock
    account-level throttle surfaces as a backoff rather than a hard error.

    Returns:
        A ``botocore.config.Config`` instance.
    """
    from botocore.config import Config as BotocoreConfig

    return BotocoreConfig(
        retries={
            # FIX [M22]: was 10. Bounded to 2 so total attempts with
            # LangChain's max_retries=3 stay around 6.
            "max_attempts": 2,
            "mode": "adaptive",
        }
    )


def _strip_geography_prefix(model: str) -> str:
    """Strip a leading geography prefix (``us.``/``eu.``/``apac.``/``ap.``) from ``model``."""
    for prefix in _GEOGRAPHY_PREFIXES:
        if model.startswith(prefix):
            return model[len(prefix) :]
    return model


def _model_suffix_from_arn(value: str) -> str:
    """Return the model-suffix segment after the last ``/`` in an ARN (identity when no slash)."""
    return value.rsplit("/", 1)[-1] if "/" in value else value


def _model_match_key(model: str) -> str:
    """Build a normalized comparison key for matching model IDs against inference profiles."""
    return _model_suffix_from_arn(_strip_geography_prefix(str(model or "").strip()))


def get_bedrock_control_client(region_name: str | None = None):
    """Get a boto3 Bedrock control-plane client for model/profile discovery.

    FIX [M23]: When ``AWS_ACCESS_KEY_ID`` is not set in the environment we
    skip the explicit credential kwargs so boto3's default credential chain
    (env vars, ``~/.aws/credentials``, EC2/ECS task role, SSO) handles
    resolution AND rotation. Previously temporary SSO credentials were
    baked into the ``@lru_cache``-d client and expired ~1h later.

    FIX [AUDIT-2-C]: cached via ``cachetools.TTLCache`` (TTL =
    ``BEDROCK_CLIENT_TTL_SECONDS``, default 50 min) so the client is
    rebuilt before temporary credentials expire.

    Args:
        region_name: Optional AWS region override. Defaults to
            ``Config.AWS_REGION``.

    Returns:
        A ``boto3.client("bedrock")`` instance.
    """
    creds = get_aws_credentials()
    region = region_name or creds.pop("region_name")
    creds.pop("region_name", None)
    cache_key = region or "default"
    with _control_lock:
        cached = _bedrock_control_cache.get(cache_key)
        if cached is not None:
            return cached
    # FIX [M23]: Don't pass explicit None credentials to boto3 — let the
    # default credential chain resolve them when AWS_ACCESS_KEY_ID is unset.
    if not os.environ.get("AWS_ACCESS_KEY_ID"):
        # Strip credential keys so boto3 falls through to its default chain.
        for k in ("aws_access_key_id", "aws_secret_access_key", "aws_session_token"):
            creds.pop(k, None)
    client = boto3.client("bedrock", region_name=region, config=_retry_config(), **creds)
    with _control_lock:
        _bedrock_control_cache[cache_key] = client
    return client


def _list_inference_profiles(region: str) -> tuple[dict, ...]:
    """List Bedrock inference profiles available in the configured region.

    FIX [AUDIT-2-C]: cached via ``cachetools.TTLCache`` so the profile
    list is refreshed at most once per ``BEDROCK_CLIENT_TTL_SECONDS``
    interval. Previously ``@lru_cache`` returned a stale list when AWS
    added or removed profiles.

    Args:
        region: AWS region to query.

    Returns:
        Tuple of inference-profile summary dicts.
    """
    with _profiles_lock:
        cached = _inference_profiles_cache.get(region)
        if cached is not None:
            return cached
    client = get_bedrock_control_client(region)
    profiles: list[dict] = []
    kwargs: dict[str, str] = {}

    while True:
        response = client.list_inference_profiles(**kwargs)
        profiles.extend(response.get("inferenceProfileSummaries", []))
        next_token = response.get("nextToken")
        if not next_token:
            break
        kwargs["nextToken"] = next_token

    result = tuple(profiles)
    with _profiles_lock:
        _inference_profiles_cache[region] = result
    return result


def _profile_matches_model(profile: dict, requested_model: str) -> bool:
    """Return whether ``profile`` exposes an ID/name/ARN or member model matching ``requested_model``."""
    requested_key = _model_match_key(requested_model)
    if not requested_key:
        return False

    direct_values = (
        profile.get("inferenceProfileId"),
        profile.get("inferenceProfileName"),
        profile.get("inferenceProfileArn"),
    )
    for value in direct_values:
        if value and _model_match_key(str(value)) == requested_key:
            return True

    for model in profile.get("models") or []:
        model_arn = model.get("modelArn") if isinstance(model, dict) else str(model)
        if isinstance(model_arn, str) and _model_match_key(model_arn) == requested_key:
            return True

    return False


def _find_inference_profile_id(model: str) -> str | None:
    """Discover the Bedrock inference-profile ID for ``model`` in the configured region (``None`` if not found)."""
    region = Config.AWS_REGION
    if not region:
        return None

    try:
        for profile in _list_inference_profiles(region):
            if _profile_matches_model(profile, model):
                return profile.get("inferenceProfileId") or profile.get("inferenceProfileArn")
    except Exception as exc:
        logger.warning(
            "Could not discover Bedrock inference profiles for region=%s: %s",
            region,
            exc,
        )
    return None


def _resolve_model_id(model: str) -> str:
    """Resolve a configured Bedrock model ID without hardcoded model mappings."""
    model = str(model or "").strip()
    if not model or model.startswith("arn:"):
        return model

    if model_capability(model, "discover_inference_profile", True) is False:
        return model

    resolved = _find_inference_profile_id(model)
    if resolved:
        if resolved != model:
            logger.info(
                "Resolved Bedrock model '%s' to inference profile '%s' for region '%s'.",
                model,
                resolved,
                Config.AWS_REGION,
            )
        return resolved

    return model


def get_aws_credentials() -> dict:
    """Resolve AWS credentials from centralized application configuration."""
    return {
        "aws_access_key_id": Config.AWS_ACCESS_KEY_ID,
        "aws_secret_access_key": Config.AWS_SECRET_ACCESS_KEY,
        "aws_session_token": Config.AWS_SESSION_TOKEN,
        "region_name": Config.AWS_REGION,
    }


def get_bedrock_client():
    """Get a boto3 Bedrock runtime client with resolved credentials.

    FIX [M23]: When ``AWS_ACCESS_KEY_ID`` is not set in the environment we
    skip the explicit credential kwargs so boto3's default credential chain
    (env vars, ``~/.aws/credentials``, EC2/ECS task role, SSO) handles
    resolution AND rotation. Previously temporary SSO credentials were
    baked into the ``@lru_cache``-d client and expired ~1h later.

    FIX [AUDIT-2-C]: cached via ``cachetools.TTLCache`` (TTL =
    ``BEDROCK_CLIENT_TTL_SECONDS``, default 50 min) so the client is
    rebuilt before temporary credentials expire.

    Returns:
        A ``boto3.client("bedrock-runtime")`` instance.
    """
    cache_key = "default"
    with _runtime_lock:
        cached = _bedrock_runtime_cache.get(cache_key)
        if cached is not None:
            return cached
    creds = get_aws_credentials()
    # Remove region_name from kwargs and pass it to client explicitly
    region = creds.pop("region_name")
    # FIX [M23]: Strip explicit credential kwargs when AWS_ACCESS_KEY_ID is
    # not set in the environment; boto3's default credential chain then
    # resolves (and rotates) credentials automatically.
    if not os.environ.get("AWS_ACCESS_KEY_ID"):
        for k in ("aws_access_key_id", "aws_secret_access_key", "aws_session_token"):
            creds.pop(k, None)
    client = boto3.client("bedrock-runtime", region_name=region, config=_retry_config(), **creds)
    with _runtime_lock:
        _bedrock_runtime_cache[cache_key] = client
    return client


def init_chat_bedrock(model: str, temperature: float, **kwargs) -> ChatBedrockConverse:
    """Initialize LangChain's ChatBedrockConverse with credentials and region.

    FIX [M22]: ``max_retries=3`` (was 10) bounds LangChain's retry layer.
    Combined with boto3's ``max_attempts=2`` (also reduced from 10) the
    worst-case total attempt count on a transient 5xx is ~6 instead of
    the previous 100. This prevents the rate-limiter semaphore and the
    user's HTTP connection from being held open for >10 minutes during a
    Bedrock outage.

    FIX [M23]: When ``AWS_ACCESS_KEY_ID`` is not set in the environment we
    skip the explicit ``aws_access_key_id`` / ``aws_secret_access_key`` /
    ``aws_session_token`` kwargs so boto3's default credential chain
    handles resolution and rotation. Previously temporary SSO credentials
    were baked into the ``@lru_cache``-d ChatBedrockConverse instance and
    expired ~1h later.
    """
    resolved_model = _resolve_model_id(model)
    creds = get_aws_credentials()
    region = creds["region_name"]
    supports_streaming = bool(model_capability(model, "supports_streaming", False))
    supports_tool_streaming = bool(model_capability(model, "supports_tool_streaming", False))
    if supports_tool_streaming:
        disable_streaming: bool | str = False
    elif supports_streaming:
        disable_streaming = "tool_calling"
    else:
        disable_streaming = True

    # FIX [M23]: Build kwargs lazily; only pass explicit credentials when
    # AWS_ACCESS_KEY_ID is set in the environment. Otherwise let boto3's
    # default credential chain (env vars, ~/.aws/credentials, EC2/ECS/SSO)
    # resolve and rotate credentials automatically.
    chat_kwargs: dict = {
        "model": resolved_model,
        "base_model": resolved_model,
        "temperature": temperature,
        "region_name": region,
        "config": _retry_config(),
        # FIX [M22]: was 10. Combined with boto3 max_attempts=2 the worst-case
        # total attempt count is ~6.
        "max_retries": 3,
        "client": get_bedrock_client(),
        "bedrock_client": get_bedrock_control_client(region),
        "disable_streaming": disable_streaming,
        **kwargs,
    }
    if os.environ.get("AWS_ACCESS_KEY_ID"):
        chat_kwargs.update(
            aws_access_key_id=creds["aws_access_key_id"],
            aws_secret_access_key=creds["aws_secret_access_key"],
            aws_session_token=creds["aws_session_token"],
        )
    return ChatBedrockConverse(**chat_kwargs)
