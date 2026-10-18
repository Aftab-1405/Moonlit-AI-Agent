"""FastAPI application entry point: lifespan, middleware, error handlers, and router registration."""

import asyncio
import logging
from contextlib import asynccontextmanager
from time import perf_counter

import redis.asyncio as redis
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException

from api_contract.common import api_error_response, serialize_validation_errors
from composition import configure_runtime_ports
from config import ProductionConfig, get_config

# ENH [RL-HTTP]: Use the shared limiter instance so controllers can apply
# @limiter.limit decorators. Previously the limiter was created here but
# no routes had decorators — the limiter existed but never enforced.
from controller.rate_limiter import limiter
from core.account_activity import AccountActivityMiddleware
from core.audit import configure_audit_logging
from core.audit_middleware import PrivilegedActionAuditMiddleware
from core.http_boundary import RequestBodyLimitMiddleware, ResponseSecurityMiddleware
from core.logging import install_request_id_filter
from core.startup_diagnostics import (
    StartupProbeResult,
    log_development_runtime_modes,
    log_startup_probe,
    log_startup_summary,
    run_startup_probe,
)
from langgraph_orchestration.checkpointing import (
    init_checkpointer,
    shutdown_checkpointer,
)
from service.firestore.firestore_service import FirestoreService
from service.quota import create_rate_limiter, create_user_quota_service

AppConfig = get_config()
configure_runtime_ports()

logging.basicConfig(
    level=getattr(logging, AppConfig.LOG_LEVEL, logging.INFO),
    format=AppConfig.LOG_FORMAT,
    handlers=[logging.FileHandler(AppConfig.LOG_FILE), logging.StreamHandler()],
)
install_request_id_filter()
logger = logging.getLogger(__name__)
configure_audit_logging(
    AppConfig.AUDIT_LOG_FILE,
    max_bytes=AppConfig.AUDIT_LOG_MAX_BYTES,
    backup_count=AppConfig.AUDIT_LOG_BACKUP_COUNT,
)
logging.getLogger().setLevel(getattr(logging, AppConfig.LOG_LEVEL, logging.INFO))
third_party_log_level = getattr(logging, AppConfig.THIRD_PARTY_LOG_LEVEL, logging.WARNING)
for noisy_logger in AppConfig.NOISY_LOGGER_NAMES:
    logging.getLogger(noisy_logger).setLevel(third_party_log_level)

# ENH [RL-HTTP]: The limiter instance is now created in controller/rate_limiter.py
# so controllers can import it for @limiter.limit decorators.
from service.redis_service import get_redis_client, set_redis_client


async def _run_startup_dependency_probes(
    redis_client: redis.Redis | None,
    *,
    timeout_seconds: float,
) -> list[StartupProbeResult]:
    """Verify startup dependencies without exposing connection details."""
    results: list[StartupProbeResult] = []

    if redis_client is None:
        redis_result = StartupProbeResult(
            name="Redis",
            status="not_checked",
            detail="client not configured; using in-memory application state",
            duration_ms=0,
        )
    else:

        async def ping_redis() -> None:
            if not await redis_client.ping():
                raise ConnectionError("Redis PING returned a false response")

        redis_result = await run_startup_probe(
            "Redis",
            ping_redis,
            timeout_seconds=timeout_seconds,
            success_detail="PING succeeded",
        )
    log_startup_probe(logger, redis_result)
    results.append(redis_result)

    def read_firestore() -> None:
        db = FirestoreService.get_db()
        next(db.collections(retry=None, timeout=timeout_seconds), None)

    firestore_result = await run_startup_probe(
        "Firestore",
        lambda: asyncio.to_thread(read_firestore),
        timeout_seconds=timeout_seconds,
        success_detail="read probe succeeded",
    )
    log_startup_probe(logger, firestore_result)
    results.append(firestore_result)
    return results


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize and tear down application state (Firebase, Redis, checkpointer, VAMP).

    Args:
        app: The FastAPI application instance.
    """

    startup_started_at = perf_counter()
    env = (AppConfig.APP_ENV or "development").lower()
    diagnostics_results: list[StartupProbeResult] = []

    logger.info(f"🚀 Starting application in {AppConfig.APP_ENV.upper()} mode")
    logger.info(f"   Debug: {AppConfig.DEBUG}, Testing: {AppConfig.TESTING}")
    if AppConfig.STARTUP_DIAGNOSTICS_ENABLED:
        logger.info("Startup diagnostics [%s]", env)
        if env == "development":
            log_development_runtime_modes(
                logger,
                host=AppConfig.UVICORN_HOST,
                http_rate_limit_enabled=AppConfig.RATELIMIT_ENABLED,
                llm_rate_limit_enabled=AppConfig.LLM_RATELIMIT_ENABLED,
                user_quota_enabled=AppConfig.USER_QUOTA_ENABLED,
            )

    if isinstance(AppConfig, type) and issubclass(AppConfig, ProductionConfig):
        ProductionConfig.validate_production_settings()

    try:
        AppConfig.validate_firebase_project_consistency()
    except ValueError as e:
        logger.error(f"Firebase configuration error: {e}")
        raise

    FirestoreService.initialize()

    redis_url = AppConfig.REDIS_URL
    is_prod_like = env in ("staging", "production")

    if is_prod_like:
        if not redis_url:
            logger.error("REDIS_URL is required for staging/production (multi-worker safe sessions)")
            raise RuntimeError("REDIS_URL must be set for staging/production")
        if AppConfig.RATELIMIT_ENABLED and str(AppConfig.RATELIMIT_STORAGE_URL).lower().startswith("memory"):
            logger.error("RATELIMIT_STORAGE_URL must not use memory storage in staging/production")
            raise RuntimeError("RATELIMIT_STORAGE_URL must be a shared backend (e.g., Redis) in staging/production")
    checkpoint_redis_url: str | None = None
    if redis_url:
        checkpoint_redis_url = redis_url
        client = redis.from_url(
            redis_url,
            decode_responses=True,
            socket_connect_timeout=AppConfig.REDIS_SOCKET_CONNECT_TIMEOUT_SECONDS,
            socket_timeout=AppConfig.REDIS_SOCKET_TIMEOUT_SECONDS,
            max_connections=AppConfig.REDIS_MAX_CONNECTIONS,
        )
        set_redis_client(client)
        logger.info("Redis client configured (reachability not yet verified)")
    else:
        logger.warning("⚠️ REDIS_URL not set, using in-memory application state")

    if AppConfig.STARTUP_DIAGNOSTICS_ENABLED:
        diagnostics_results.extend(
            await _run_startup_dependency_probes(
                get_redis_client(),
                timeout_seconds=AppConfig.STARTUP_DIAGNOSTICS_TIMEOUT_SECONDS,
            )
        )

    # LangGraph thread persistence: Redis in staging/production, in-memory in dev.
    await init_checkpointer(
        app_env=env,
        redis_url=checkpoint_redis_url if is_prod_like else None,
    )

    app.state.user_quota = create_user_quota_service(get_redis_client(), AppConfig)
    logger.info(f"User quota: {AppConfig.USER_QUOTA_PER_MINUTE}/min, enabled={AppConfig.USER_QUOTA_ENABLED}")

    # FIX [M19]: Bind the Redis client to the LLM rate limiter so its
    # sliding-window counters are shared across all uvicorn workers. The
    # limiter was constructed in create_app() before Redis was ready; now
    # that the Redis client exists we attach it. If Redis is unavailable
    # the limiter falls back to in-process per-worker counters (dev only).
    redis_client = get_redis_client()
    if redis_client is not None and app.state.llm_rate_limiter is not None:
        app.state.llm_rate_limiter.redis = redis_client
        logger.info("LLM rate limiter bound to shared Redis backend")
    else:
        logger.info(
            "LLM rate limiter using in-process per-worker counters (no Redis) — dev mode only; do not use in production"
        )

    from llm_provider.token_budget import eagerly_initialize_static_budgets

    logger.info("Initializing static token budgets...")
    eagerly_initialize_static_budgets()
    from llm_provider.model_factory import prewarm_chat_models

    logger.info("Prewarming Bedrock model clients...")
    bedrock_started_at = perf_counter()
    prewarm_result = await asyncio.to_thread(prewarm_chat_models)
    bedrock_duration_ms = (perf_counter() - bedrock_started_at) * 1000
    attempted = prewarm_result["attempted"]
    initialized = prewarm_result["initialized"]
    if initialized == attempted:
        bedrock_result = StartupProbeResult(
            name="Bedrock",
            status="not_checked",
            detail=f"{initialized}/{attempted} clients constructed; API access not tested",
            duration_ms=bedrock_duration_ms,
        )
    else:
        bedrock_result = StartupProbeResult(
            name="Bedrock",
            status="warning",
            detail=f"{initialized}/{attempted} clients constructed; API access not tested",
            duration_ms=bedrock_duration_ms,
        )
    if AppConfig.STARTUP_DIAGNOSTICS_ENABLED:
        log_startup_probe(logger, bedrock_result)
        diagnostics_results.append(bedrock_result)

    vamp_stop = asyncio.Event()
    vamp_task = None
    if AppConfig.VAMP_MEMORY_ENABLED:
        from vamp_memory.maintenance import run_vamp_maintenance
        from vamp_memory.vamp_memory_service import get_vamp_memory_service

        qdrant_started_at = perf_counter()
        try:
            # Warm and validate Qdrant before traffic arrives. Network work is
            # still asynchronous and a temporary outage remains recoverable.
            await get_vamp_memory_service().vector_store.ensure_ready()
        except Exception as exc:
            qdrant_result = StartupProbeResult(
                name="Qdrant",
                status="warning",
                detail=f"readiness probe failed ({type(exc).__name__})",
                duration_ms=(perf_counter() - qdrant_started_at) * 1000,
            )
        else:
            qdrant_result = StartupProbeResult(
                name="Qdrant",
                status="ok",
                detail=f"collection={AppConfig.VAMP_QDRANT_COLLECTION}",
                duration_ms=(perf_counter() - qdrant_started_at) * 1000,
            )
        if AppConfig.STARTUP_DIAGNOSTICS_ENABLED:
            log_startup_probe(logger, qdrant_result)
            diagnostics_results.append(qdrant_result)
        elif qdrant_result.status == "ok":
            logger.info("Qdrant vector store ready")
        else:
            logger.warning("VAMP vector store was not ready at startup (%s)", qdrant_result.detail)

        vamp_task = asyncio.create_task(
            run_vamp_maintenance(vamp_stop, AppConfig.VAMP_MAINTENANCE_INTERVAL_SECONDS),
            name="vamp-maintenance",
        )

    if AppConfig.STARTUP_DIAGNOSTICS_ENABLED:
        log_startup_summary(
            logger,
            diagnostics_results,
            total_duration_ms=(perf_counter() - startup_started_at) * 1000,
        )

    logger.info("✅ Application initialized successfully")

    yield

    if vamp_task is not None:
        vamp_stop.set()
        vamp_task.cancel()
        try:
            await vamp_task
        except asyncio.CancelledError:
            pass

    # FIX [M30]: Drain in-flight VAMP background index tasks so blocks don't
    # get stuck in `pending` mid-embed when the loop closes.
    # FIX [M26]: Close the QdrantClient HTTP connection pool so the worker
    # process exits without leaking sockets.
    if AppConfig.VAMP_MEMORY_ENABLED:
        from vamp_memory.vamp_memory_service import (
            _VAMP_MEMORY_SERVICE_SINGLETON,
            _VECTOR_STORE_SINGLETON,
        )

        if _VAMP_MEMORY_SERVICE_SINGLETON is not None:
            try:
                await _VAMP_MEMORY_SERVICE_SINGLETON.aclose()
            except Exception as exc:
                logger.warning("VAMP service shutdown error: %s", exc)
        if _VECTOR_STORE_SINGLETON is not None:
            try:
                await _VECTOR_STORE_SINGLETON.aclose()
            except Exception as exc:
                logger.warning("Qdrant client close error: %s", exc)

    await shutdown_checkpointer()
    client = get_redis_client()
    if client:
        await client.close()
        logger.info("Redis connection closed")


def create_app() -> FastAPI:
    """Build the FastAPI app: OpenAPI tags, middleware stack, rate limiter, routers."""
    openapi_tags = [
        {
            "name": "Authentication & Authorization",
            "description": "Endpoints to manage user session handshake, cookie validation, CSRF tokens, and logout operations.",
        },
        {
            "name": "Moonlit Conversation End Points",
            "description": "API routes for human-agent conversational chats, option fetches, message retrieval, and history management.",
        },
        {
            "name": "Database Operations End Points",
            "description": "API routes for establishing database connections, selecting schemas/tables, and executing SQL queries.",
        },
        {
            "name": "User Context & Settings",
            "description": "API routes for schema cache refreshing, settings persistence, and session active heartbeats.",
        },
        {
            "name": "User Quota",
            "description": "API routes for fetching rate-limiting and quota status metrics.",
        },
        {
            "name": "General",
            "description": "System-level health checking and status routes.",
        },
    ]

    app = FastAPI(
        title=AppConfig.APP_TITLE,
        description=AppConfig.APP_DESCRIPTION,
        version=AppConfig.APP_VERSION,
        lifespan=lifespan,
        docs_url="/docs" if AppConfig.DEBUG else None,
        redoc_url="/redoc" if AppConfig.DEBUG else None,
        openapi_url="/openapi.json" if AppConfig.DEBUG else None,
        openapi_tags=openapi_tags,
    )

    if AppConfig.CORS_ORIGINS:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=AppConfig.CORS_ORIGINS,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
        logger.info(f"CORS enabled for origins: {AppConfig.CORS_ORIGINS}")

    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        """Log every inbound request and its response, redacting sensitive headers/bodies."""
        should_log_request = request.url.path not in AppConfig.REQUEST_LOG_EXCLUDED_PATHS
        if should_log_request:
            logger.debug(f"Incoming request: {request.method} {request.url}")

            # Redact sensitive headers
            safe_headers = {
                k: ("***REDACTED***" if k.lower() in AppConfig.SENSITIVE_HEADER_NAMES else v)
                for k, v in request.headers.items()
            }
            logger.debug(f"Headers: {safe_headers}")

        if should_log_request and logger.isEnabledFor(logging.DEBUG):
            content_length = request.headers.get("content-length")
            if request.url.path in AppConfig.SENSITIVE_BODY_LOG_PATHS:
                logger.debug("Body: ***REDACTED***")
            elif content_length:
                logger.debug("Body: %s bytes", content_length)

        response = await call_next(request)
        if should_log_request:
            logger.debug(f"Response status: {response.status_code}")
        return response

    @app.middleware("http")
    async def csrf_middleware(request: Request, call_next):
        """Enforce double-submit CSRF tokens on every state-mutating request."""
        if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            if request.url.path not in AppConfig.CSRF_EXEMPT_PATHS:
                try:
                    from dependencies import verify_csrf_token

                    verify_csrf_token(request)
                except HTTPException as exc:
                    return api_error_response(
                        status_code=exc.status_code,
                        error="FORBIDDEN",
                        message=str(exc.detail),
                    )

        return await call_next(request)

    app.add_middleware(
        RequestBodyLimitMiddleware,
        max_body_bytes=AppConfig.REQUEST_BODY_MAX_BYTES,
    )

    app.add_middleware(PrivilegedActionAuditMiddleware)
    app.add_middleware(AccountActivityMiddleware)

    app.add_middleware(
        ResponseSecurityMiddleware,
        security_headers={
            "X-Content-Type-Options": AppConfig.SECURITY_HEADER_CONTENT_TYPE_OPTIONS,
            "X-Frame-Options": AppConfig.SECURITY_HEADER_FRAME_OPTIONS,
            "X-XSS-Protection": AppConfig.SECURITY_HEADER_XSS_PROTECTION,
            "Strict-Transport-Security": AppConfig.SECURITY_HEADER_HSTS,
            "Referrer-Policy": AppConfig.SECURITY_HEADER_REFERRER_POLICY,
            "Permissions-Policy": AppConfig.SECURITY_HEADER_PERMISSIONS_POLICY,
        },
        server_header=AppConfig.SERVER_HEADER_VALUE,
    )

    if AppConfig.RATELIMIT_ENABLED:
        app.state.limiter = limiter
        app.add_exception_handler(RateLimitExceeded, _rate_limit_exception_handler)
        logger.info(f"Rate limiting enabled: {AppConfig.RATELIMIT_DEFAULT}")

    # Configure LLM rate limiter (single-key rate limiting)
    # FIX [M19]: Pass the Redis client so the rate limiter can use a shared
    # sliding-window counter across all uvicorn workers. Without Redis each
    # worker would maintain its own counters and the effective limit would
    # be LLM_MAX_RPM_PER_KEY * num_workers — far above the Bedrock account's
    # actual quota. Redis may not be available yet at create_app() time
    # (Redis is initialised in the lifespan above), so we pass None here
    # and re-bind in lifespan once the client is ready.
    app.state.llm_rate_limiter = create_rate_limiter(AppConfig)
    logger.info(
        f"LLM provider: {AppConfig.LLM_PROVIDER}; "
        f"LLM rate limiter: "
        f"{app.state.llm_rate_limiter.configured_provider_count()} providers, "
        f"enabled={AppConfig.LLM_RATELIMIT_ENABLED}"
    )

    # UserQuotaService is initialized in lifespan() after Redis connects.
    app.state.user_quota = None

    _register_error_handlers(app)

    from api_router import combined_router as api_router
    from controller.auth_controller import router as auth_router

    app.include_router(auth_router)
    app.include_router(api_router, prefix="/api/v1")

    return app


def _register_error_handlers(app: FastAPI):
    """Register centralized error handlers for consistent JSON error envelopes.

    Args:
        app: The FastAPI application instance.
    """

    def error_code_for_status(status_code: int) -> str:
        return {
            status.HTTP_400_BAD_REQUEST: "BAD_REQUEST",
            status.HTTP_401_UNAUTHORIZED: "UNAUTHORIZED",
            status.HTTP_403_FORBIDDEN: "FORBIDDEN",
            status.HTTP_404_NOT_FOUND: "NOT_FOUND",
            status.HTTP_405_METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
            status.HTTP_422_UNPROCESSABLE_CONTENT: "VALIDATION_ERROR",
            status.HTTP_429_TOO_MANY_REQUESTS: "RATE_LIMITED",
            status.HTTP_500_INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
        }.get(status_code, "REQUEST_FAILED")

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        """Translate HTTPException into the standard ApiError JSON envelope."""
        detail = exc.detail
        error = error_code_for_status(exc.status_code)
        message = str(detail) if detail else error.replace("_", " ").title()
        details = {}

        if isinstance(detail, dict):
            error = str(detail.get("error") or detail.get("error_type") or error)
            message = str(detail.get("message") or detail.get("detail") or message)
            details = {
                key: value for key, value in detail.items() if key not in {"error", "error_type", "message", "detail"}
            }

        return api_error_response(
            status_code=exc.status_code,
            error=error.upper(),
            message=message,
            details=details,
            headers=exc.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        """Translate Pydantic validation errors into the standard ApiError JSON envelope."""
        return api_error_response(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            error="VALIDATION_ERROR",
            message="Request validation failed.",
            details={"errors": serialize_validation_errors(exc.errors())},
        )



async def _rate_limit_exception_handler(
    request: Request,
    exc: RateLimitExceeded,
):
    """Return the stable public error contract for SlowAPI rejections."""
    return api_error_response(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        error="RATE_LIMITED",
        message="Too many requests.",
    )


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=AppConfig.UVICORN_HOST,
        port=AppConfig.UVICORN_PORT,
        reload=AppConfig.DEBUG,
        log_level=AppConfig.UVICORN_DEBUG_LOG_LEVEL if AppConfig.DEBUG else AppConfig.UVICORN_LOG_LEVEL,
    )
