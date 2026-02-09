"""FastAPI application entry point"""

import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import redis.asyncio as redis

from config import get_config, ProductionConfig
from services.firestore_service import FirestoreService
from services.rate_limiting import create_rate_limiter, create_user_quota_service


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Get environment-specific configuration
AppConfig = get_config()

# Rate limiter - uses storage from config (memory:// for dev, redis:// for prod)
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=AppConfig.RATELIMIT_STORAGE_URL
)

# Redis client for sessions (initialized in lifespan)
redis_client: redis.Redis | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle management."""
    global redis_client
    
    logger.info(f"🚀 Starting application in {AppConfig.APP_ENV.upper()} mode")
    logger.info(f"   Debug: {AppConfig.DEBUG}, Testing: {AppConfig.TESTING}")
    
    # Production-specific validation
    if isinstance(AppConfig, type) and issubclass(AppConfig, ProductionConfig):
        ProductionConfig.validate_production_settings()
    
    # Validate Firebase configuration consistency
    try:
        AppConfig.validate_firebase_project_consistency()
    except ValueError as e:
        logger.error(f"Firebase configuration error: {e}")
        raise
    
    # Initialize Firebase/Firestore
    FirestoreService.initialize()
    
    # Initialize Redis for sessions
    redis_url = os.getenv('UPSTASH_REDIS_URL')
    env = (AppConfig.APP_ENV or 'development').lower()
    is_prod_like = env in ('staging', 'production')
    
    if is_prod_like:
        if not redis_url:
            logger.error("UPSTASH_REDIS_URL is required for staging/production (multi-worker safe sessions)")
            raise RuntimeError("UPSTASH_REDIS_URL must be set for staging/production")
        if AppConfig.RATELIMIT_ENABLED and str(AppConfig.RATELIMIT_STORAGE_URL).lower().startswith('memory'):
            logger.error("RATELIMIT_STORAGE_URL must not use memory storage in staging/production")
            raise RuntimeError("RATELIMIT_STORAGE_URL must be a shared backend (e.g., Redis) in staging/production")
    if redis_url:
        # Convert redis:// to rediss:// for TLS (Upstash requires TLS)
        if redis_url.startswith('redis://'):
            redis_url = redis_url.replace('redis://', 'rediss://', 1)
        
        redis_client = redis.from_url(redis_url, decode_responses=True)
        logger.info("✅ Redis session storage enabled (Upstash)")
    else:
        logger.warning("⚠️ UPSTASH_REDIS_URL not set, using in-memory sessions (not recommended for production)")
    
    # Initialize per-user quota service (needs Redis)
    app.state.user_quota = create_user_quota_service(redis_client, AppConfig)
    logger.info(
        f"User quota: {AppConfig.USER_QUOTA_PER_MINUTE}/min, "
        f"enabled={AppConfig.USER_QUOTA_ENABLED}"
    )
    
    logger.info("✅ Application initialized successfully")
    
    yield
    
    # Shutdown
    if redis_client:
        await redis_client.close()
        logger.info("Redis connection closed")


def create_app() -> FastAPI:
    """Application factory pattern."""
    app = FastAPI(
        title="Moonlit API",
        description="AI-powered database assistant API",
        version="2.0.0",
        lifespan=lifespan,
        docs_url="/docs" if AppConfig.DEBUG else None,
        redoc_url="/redoc" if AppConfig.DEBUG else None,
    )
    
    # Configure CORS
    if AppConfig.CORS_ORIGINS:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=AppConfig.CORS_ORIGINS,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
        logger.info(f"CORS enabled for origins: {AppConfig.CORS_ORIGINS}")
    
    # Configure rate limiting
    if AppConfig.RATELIMIT_ENABLED:
        app.state.limiter = limiter
        app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
        logger.info(f"Rate limiting enabled: {AppConfig.RATELIMIT_DEFAULT}")
    
    # Configure LLM rate limiter (multi-key load balancing)
    app.state.llm_rate_limiter = create_rate_limiter(AppConfig)
    logger.info(
        f"LLM provider: {AppConfig.LLM_PROVIDER}; "
        f"LLM rate limiter: {len(AppConfig.LLM_API_KEYS)} keys, "
        f"enabled={AppConfig.LLM_RATELIMIT_ENABLED}"
    )
    
    # Note: UserQuotaService is initialized in lifespan() after Redis connects
    app.state.user_quota = None  # Placeholder, set in lifespan
    
    # Register error handlers
    _register_error_handlers(app)
    
    # Register routers
    from auth.routes import router as auth_router
    from api.routes import combined_router as api_router
    
    app.include_router(auth_router)
    app.include_router(api_router, prefix="/api/v1")
    
    return app


def _register_error_handlers(app: FastAPI):
    """Register centralized error handlers for consistent JSON responses."""
    
    @app.exception_handler(status.HTTP_400_BAD_REQUEST)
    async def bad_request_handler(request: Request, exc: Exception):
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                'status': 'error',
                'message': 'Bad request',
                'error_type': 'bad_request'
            }
        )
    
    @app.exception_handler(status.HTTP_404_NOT_FOUND)
    async def not_found_handler(request: Request, exc: Exception):
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={
                'status': 'error',
                'message': 'Resource not found',
                'error_type': 'not_found'
            }
        )
    
    @app.exception_handler(status.HTTP_405_METHOD_NOT_ALLOWED)
    async def method_not_allowed_handler(request: Request, exc: Exception):
        return JSONResponse(
            status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
            content={
                'status': 'error',
                'message': 'Method not allowed',
                'error_type': 'method_not_allowed'
            }
        )
    
    @app.exception_handler(status.HTTP_500_INTERNAL_SERVER_ERROR)
    async def internal_error_handler(request: Request, exc: Exception):
        logger.exception(f"Internal server error: {exc}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                'status': 'error',
                'message': 'Internal server error',
                'error_type': 'internal_error'
            }
        )


def get_redis_client() -> redis.Redis | None:
    """Get the Redis client instance."""
    return redis_client


# Application instance
app = create_app()


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=5000,
        reload=AppConfig.DEBUG,
        log_level="debug" if AppConfig.DEBUG else "info"
    )
