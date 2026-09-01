"""Environment-driven application configuration for MOONLIT."""

import logging
import os

from dotenv import load_dotenv

load_dotenv()


_SUPPORTED_APP_ENVS = {"development", "staging", "production", "testing"}


def _require_env(name: str) -> str:
    """Read an environment variable and fail fast when unset or blank."""
    value = os.getenv(name)
    if not value or not value.strip():
        raise ValueError(f"{name} environment variable is required")
    return value


class Config:
    """Base configuration: reads every setting from environment variables with safe defaults."""

    # Application Environment
    # Options: development, staging, production
    APP_ENV = _require_env("APP_ENV").strip().lower()
    DEBUG = APP_ENV == "development"
    TESTING = APP_ENV == "testing"

    # Application metadata
    APP_TITLE = os.getenv("APP_TITLE", "MOONLIT")
    APP_DESCRIPTION = os.getenv(
        "APP_DESCRIPTION", "AI Agent for relational databases"
    )
    APP_VERSION = os.getenv("APP_VERSION", "2.0.0")
    UVICORN_HOST = os.getenv("UVICORN_HOST", "0.0.0.0")
    UVICORN_PORT = int(os.getenv("UVICORN_PORT", 5000))
    UVICORN_DEBUG_LOG_LEVEL = os.getenv("UVICORN_DEBUG_LOG_LEVEL", "debug")
    UVICORN_LOG_LEVEL = os.getenv("UVICORN_LOG_LEVEL", "info")

    # Logging
    STARTUP_DIAGNOSTICS_ENABLED = (
        os.getenv("STARTUP_DIAGNOSTICS_ENABLED", "False").lower() == "true"
    )
    STARTUP_DIAGNOSTICS_TIMEOUT_SECONDS = float(
        os.getenv("STARTUP_DIAGNOSTICS_TIMEOUT_SECONDS", "5")
    )
    LOG_FILE = os.getenv("LOG_FILE", "backend.log")
    LOG_FORMAT = os.getenv(
        "LOG_FORMAT",
        "%(asctime)s - %(name)s - %(levelname)s - request_id=%(request_id)s - %(message)s",
    )
    THIRD_PARTY_LOG_LEVEL = os.getenv("THIRD_PARTY_LOG_LEVEL", "WARNING").upper()
    _noisy_logger_names_raw = os.getenv(
        "NOISY_LOGGER_NAMES",
        ",".join(
            (
                "boto3",
                "botocore",
                "urllib3",
                "s3transfer",
                "cachecontrol",
                "watchfiles",
                "watchfiles.main",
                "langchain_aws",
                "langchain_aws.chat_models.bedrock_converse",
                "langchain_core",
                "langgraph",
                # ENH [LOG]: Suppress noisy HTTP/connection debug logs
                "httpcore",
                "httpcore.connection",
                "httpcore.http11",
                "httpx",
                "huggingface_hub",
                "transformers",
                # ENH [LOG]: Suppress Qdrant client debug logs
                "qdrant_client",
            )
        ),
    )
    NOISY_LOGGER_NAMES = {
        logger_name.strip()
        for logger_name in _noisy_logger_names_raw.split(",")
        if logger_name.strip()
    }
    _request_log_excluded_paths_raw = os.getenv(
        "REQUEST_LOG_EXCLUDED_PATHS", "/api/v1/user/session/active"
    )
    REQUEST_LOG_EXCLUDED_PATHS = {
        path.strip()
        for path in _request_log_excluded_paths_raw.split(",")
        if path.strip()
    }
    _sensitive_header_names_raw = os.getenv(
        "SENSITIVE_HEADER_NAMES", "cookie,authorization,x-csrf-token"
    )
    SENSITIVE_HEADER_NAMES = {
        header.strip().lower()
        for header in _sensitive_header_names_raw.split(",")
        if header.strip()
    }
    _sensitive_body_paths_raw = os.getenv(
        "SENSITIVE_BODY_LOG_PATHS",
        "/api/v1/pass_user_prompt_to_llm,/api/v1/resume_agent",
    )
    SENSITIVE_BODY_LOG_PATHS = {
        path.strip() for path in _sensitive_body_paths_raw.split(",") if path.strip()
    }

    # HTTP security headers
    SECURITY_HEADER_CONTENT_TYPE_OPTIONS = os.getenv(
        "SECURITY_HEADER_CONTENT_TYPE_OPTIONS", "nosniff"
    )
    SECURITY_HEADER_FRAME_OPTIONS = os.getenv("SECURITY_HEADER_FRAME_OPTIONS", "DENY")
    SECURITY_HEADER_XSS_PROTECTION = os.getenv(
        "SECURITY_HEADER_XSS_PROTECTION", "1; mode=block"
    )
    SECURITY_HEADER_HSTS = os.getenv(
        "SECURITY_HEADER_HSTS", "max-age=31536000; includeSubDomains"
    )
    SECURITY_HEADER_REFERRER_POLICY = os.getenv(
        "SECURITY_HEADER_REFERRER_POLICY", "no-referrer-when-downgrade"
    )
    SECURITY_HEADER_PERMISSIONS_POLICY = os.getenv(
        "SECURITY_HEADER_PERMISSIONS_POLICY", "geolocation=()"
    )
    SERVER_HEADER_VALUE = os.getenv("SERVER_HEADER_VALUE", "Moonlit")

    # Secret key - should always be set in environment
    SECRET_KEY = os.getenv("SECRET_KEY")
    if not SECRET_KEY or SECRET_KEY == "your_secret_key_here":
        raise ValueError(
            "SECRET_KEY environment variable must be set to a real value (not the placeholder)"
        )

    # LLM API Configuration (Provider-based)
    # Providers: bedrock (via langchain-aws)
    LLM_PROVIDER = os.getenv("LLM_PROVIDER", "bedrock").strip().lower()

    # Provider API keys are resolved per selected provider in llm_provider.model_factory.

    # AWS Bedrock
    AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
    AWS_SESSION_TOKEN = os.getenv("AWS_SESSION_TOKEN")
    AWS_REGION = (
        os.getenv("AWS_DEFAULT_REGION")
    )
    BEDROCK_MODELS = [
        m.strip() for m in os.getenv("BEDROCK_MODELS", "").split(",") if m.strip()
    ]

    # Kimi token counting executes the model repository's custom tokenizer
    # code. Keep the default revision immutable so deployments never execute
    # a moving Hugging Face branch implicitly.
    KIMI_TOKENIZER_REPOSITORY = os.getenv(
        "KIMI_TOKENIZER_REPOSITORY", "moonshotai/Kimi-K2-Instruct"
    ).strip()
    KIMI_TOKENIZER_REVISION = os.getenv(
        "KIMI_TOKENIZER_REVISION",
        "fd1984e2b7a3350dbf7305fe73a4ede25c14de50",
    ).strip()

    # LLM Rate Limiting
    LLM_RATELIMIT_ENABLED = os.getenv("LLM_RATELIMIT_ENABLED", "True").lower() == "true"
    LLM_MAX_RPM_PER_KEY = int(os.getenv("LLM_MAX_RPM_PER_KEY", 25))
    LLM_MAX_CONCURRENT = int(os.getenv("LLM_MAX_CONCURRENT", 5))
    LLM_QUEUE_TIMEOUT = int(os.getenv("LLM_QUEUE_TIMEOUT", 60))
    # ENH [RL-ACCOUNT]: Global account-level RPM guard. Set to your Bedrock
    # account's total RPM limit to prevent account-level throttling when many
    # users each stay under their per-user limit but the aggregate exceeds
    # the account quota. 0 = disabled (Bedrock handles throttling itself).
    LLM_ACCOUNT_MAX_RPM = int(os.getenv("LLM_ACCOUNT_MAX_RPM", 0))

    # Per-User Quota (Redis-based)
    USER_QUOTA_ENABLED = os.getenv("USER_QUOTA_ENABLED", "True").lower() == "true"
    USER_QUOTA_PER_MINUTE = int(os.getenv("USER_QUOTA_PER_MINUTE", 4))
    USER_QUOTA_PER_HOUR = int(os.getenv("USER_QUOTA_PER_HOUR", 100))
    USER_QUOTA_PER_DAY = int(os.getenv("USER_QUOTA_PER_DAY", 500))

    # Firebase credentials from environment variables
    @staticmethod
    def get_firebase_credentials():
        """Build the Firebase service-account dict from FIREBASE_* env vars.

        Returns:
            The service-account credentials dict expected by ``firebase_admin.initialize_app``.

        Raises:
            ValueError: If any required FIREBASE_* env var is missing.
        """
        required_env_vars = [
            "FIREBASE_TYPE",
            "FIREBASE_PROJECT_ID",
            "FIREBASE_PRIVATE_KEY_ID",
            "FIREBASE_PRIVATE_KEY",
            "FIREBASE_CLIENT_EMAIL",
            "FIREBASE_CLIENT_ID",
            "FIREBASE_AUTH_URI",
            "FIREBASE_TOKEN_URI",
        ]

        # Check if all required environment variables are present
        missing_vars = [var for var in required_env_vars if not os.getenv(var)]
        if missing_vars:
            raise ValueError(
                f"Missing Firebase environment variables: {', '.join(missing_vars)}"
            )

        # Process the private key to handle newlines correctly
        private_key = os.getenv("FIREBASE_PRIVATE_KEY")
        if private_key:
            # Replace literal \n with actual newlines
            private_key = private_key.replace("\\n", "\n")

        return {
            "type": os.getenv("FIREBASE_TYPE"),
            "project_id": os.getenv("FIREBASE_PROJECT_ID"),
            "private_key_id": os.getenv("FIREBASE_PRIVATE_KEY_ID"),
            "private_key": private_key,
            "client_email": os.getenv("FIREBASE_CLIENT_EMAIL"),
            "client_id": os.getenv("FIREBASE_CLIENT_ID"),
            "auth_uri": os.getenv("FIREBASE_AUTH_URI"),
            "token_uri": os.getenv("FIREBASE_TOKEN_URI"),
        }

    # Validation method to check Firebase credentials at startup
    @staticmethod
    def validate_firebase_credentials():
        """Sanity-check the Firebase service-account credentials at startup.

        Returns:
            True if the credentials pass basic format validation; False if validation
            logs a warning and swallows the error. The caller decides whether to abort.
        """
        logger = logging.getLogger(__name__)
        try:
            credentials = Config.get_firebase_credentials()

            # Basic validation
            if not credentials["project_id"]:
                raise ValueError("Firebase project_id is empty")

            if not credentials["private_key"].startswith("-----BEGIN PRIVATE KEY-----"):
                raise ValueError("Firebase private_key format is invalid")

            if "@" not in credentials["client_email"]:
                raise ValueError("Firebase client_email format is invalid")

            logger.info("✅ Firebase credentials validation passed")
            return True

        except Exception as e:
            logger.error(f"❌ Firebase credentials validation failed: {e}")
            return False

    # Database pool sizing basis. Kept separate from actual app thread workers.
    DB_POOL_WORKER_BASIS = int(
        os.getenv("DB_POOL_WORKER_BASIS", os.getenv("MAX_WORKERS", 32))
    )

    # Logging Configuration (base default)
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

    # Firebase Web/Client SDK Configuration (for frontend)
    @staticmethod
    def get_firebase_web_config():
        """Return the Firebase Web SDK config dict (apiKey, authDomain, etc.) for the frontend."""
        return {
            "apiKey": os.getenv("FIREBASE_WEB_API_KEY", ""),
            "authDomain": os.getenv("FIREBASE_AUTH_DOMAIN", ""),
            "projectId": os.getenv("FIREBASE_WEB_PROJECT_ID", ""),
            "storageBucket": os.getenv("FIREBASE_STORAGE_BUCKET", ""),
            "messagingSenderId": os.getenv("FIREBASE_MESSAGING_SENDER_ID", ""),
            "appId": os.getenv("FIREBASE_APP_ID", ""),
        }

    # Validation method to ensure Firebase project consistency
    @staticmethod
    def validate_firebase_project_consistency():
        """Ensure Admin SDK and Client SDK reference the same Firebase project.

        Returns:
            True if both project IDs are present and equal; False if either is missing
            (logs a warning). Raises ValueError if they are present but disagree.
        """
        logger = logging.getLogger(__name__)
        admin_project_id = os.getenv("FIREBASE_PROJECT_ID", "")
        web_project_id = os.getenv("FIREBASE_WEB_PROJECT_ID", "")

        if not admin_project_id or not web_project_id:
            logger.warning("⚠️  Warning: Firebase project IDs not configured")
            return False

        if admin_project_id != web_project_id:
            raise ValueError(
                f"Firebase project ID mismatch!\n"
                f"  Admin SDK (FIREBASE_PROJECT_ID): {admin_project_id}\n"
                f"  Client SDK (FIREBASE_WEB_PROJECT_ID): {web_project_id}\n"
                f"Both must use the SAME Firebase project for authentication to work correctly."
            )

        logger.info(f"✅ Firebase project consistency validated: {admin_project_id}")
        return True

    # CORS Configuration
    _cors_origins_raw = os.getenv("CORS_ORIGINS")
    CORS_ORIGINS = [o.strip() for o in _cors_origins_raw.split(",") if o.strip()] if _cors_origins_raw else None

    # Rate Limiting Configuration
    RATELIMIT_ENABLED = os.getenv("RATELIMIT_ENABLED", "True").lower() == "true"
    RATELIMIT_STORAGE_URL = os.getenv("RATELIMIT_STORAGE_URL", "memory://")
    RATELIMIT_DEFAULT = os.getenv("RATELIMIT_DEFAULT", "200 per day, 50 per hour")
    _trusted_proxy_cidrs_raw = os.getenv(
        "TRUSTED_PROXY_CIDRS", "127.0.0.1/32,::1/128"
    )
    TRUSTED_PROXY_CIDRS = tuple(
        cidr.strip()
        for cidr in _trusted_proxy_cidrs_raw.split(",")
        if cidr.strip()
    )

    # SQL Query Security Configuration
    MAX_QUERY_RESULTS = int(os.getenv("MAX_QUERY_RESULTS", 10000))  # Max rows to return
    QUERY_TIMEOUT_SECONDS = int(os.getenv("QUERY_TIMEOUT_SECONDS", 30))  # Query timeout
    # FIX [L10]: unified query-length limit. Previously MAX_QUERY_LENGTH
    # (10000) disagreed with SQL_QUERY_MAX_LENGTH (100000) below, so a
    # 50k-char query passed the API layer and was rejected by the service
    # layer. We now alias MAX_QUERY_LENGTH to the same env var as
    # SQL_QUERY_MAX_LENGTH (the larger, user-facing limit) so every layer
    # enforces the same maximum.
    SQL_QUERY_MAX_LENGTH = int(os.getenv("SQL_QUERY_MAX_LENGTH", 100000))
    MAX_QUERY_LENGTH = SQL_QUERY_MAX_LENGTH  # Backwards-compatible alias

    # AI Context Configuration (Firestore-based schema context for AI agent)
    SCHEMA_CONTEXT_TTL_SECONDS = int(
        os.getenv("SCHEMA_CONTEXT_TTL_SECONDS", 86400)
    )  # 24 hour TTL (UI Cache)
    SCHEMA_CONTEXT_MAX_TABLES = int(
        os.getenv("SCHEMA_CONTEXT_MAX_TABLES", 1000)
    )  # Max tables to store (UI Cache)
    CONNECTION_CONTEXT_TTL_SECONDS = int(
        os.getenv("CONNECTION_CONTEXT_TTL_SECONDS", 300)
    )  # 5 min
    CONTEXT_METRICS_ENABLED = (
        os.getenv("CONTEXT_METRICS_ENABLED", "True").lower() == "true"
    )

    # VAMP long-context memory configuration
    VAMP_MEMORY_ENABLED = os.getenv("VAMP_MEMORY_ENABLED", "True").lower() == "true"
    VAMP_VECTOR_BACKEND = os.getenv("VAMP_VECTOR_BACKEND", "qdrant").strip().lower()
    VAMP_QDRANT_URL = os.getenv("VAMP_QDRANT_URL")
    VAMP_QDRANT_API_KEY = os.getenv("VAMP_QDRANT_API_KEY")
    VAMP_QDRANT_COLLECTION = os.getenv(
        "VAMP_QDRANT_COLLECTION", "moonlit_vamp_memory"
    )
    VAMP_EMBEDDING_MODEL = os.getenv(
        "VAMP_EMBEDDING_MODEL", "amazon.titan-embed-text-v2:0"
    )
    VAMP_EMBEDDING_DIMENSIONS = int(os.getenv("VAMP_EMBEDDING_DIMENSIONS", 1024))
    VAMP_SIMILARITY_THRESHOLD = float(os.getenv("VAMP_SIMILARITY_THRESHOLD", 0.35))
    VAMP_INDEX_CONCURRENCY = int(os.getenv("VAMP_INDEX_CONCURRENCY", 4))
    VAMP_MAINTENANCE_INTERVAL_SECONDS = int(
        os.getenv("VAMP_MAINTENANCE_INTERVAL_SECONDS", 30)
    )
    VAMP_MAINTENANCE_INITIAL_DELAY_SECONDS = int(
        os.getenv("VAMP_MAINTENANCE_INITIAL_DELAY_SECONDS", 5)
    )
    VAMP_MAINTENANCE_QUERY_TIMEOUT_SECONDS = float(
        os.getenv("VAMP_MAINTENANCE_QUERY_TIMEOUT_SECONDS", 15)
    )
    VAMP_MAINTENANCE_MAX_BACKOFF_SECONDS = int(
        os.getenv("VAMP_MAINTENANCE_MAX_BACKOFF_SECONDS", 300)
    )
    VAMP_CONTEXT_MIN_TOKENS = int(os.getenv("VAMP_CONTEXT_MIN_TOKENS", 2048))
    VAMP_CONTEXT_MAX_TOKENS = int(os.getenv("VAMP_CONTEXT_MAX_TOKENS", 12000))
    VAMP_CONTEXT_WINDOW_RATIO = float(os.getenv("VAMP_CONTEXT_WINDOW_RATIO", 0.05))
    VAMP_SUMMARY_CLAIM_TTL_SECONDS = int(
        os.getenv("VAMP_SUMMARY_CLAIM_TTL_SECONDS", 900)
    )
    VAMP_SUMMARY_INLINE_MAX_BYTES = int(
        os.getenv("VAMP_SUMMARY_INLINE_MAX_BYTES", 700_000)
    )
    VAMP_SUMMARY_CHUNK_BYTES = int(
        os.getenv("VAMP_SUMMARY_CHUNK_BYTES", 450_000)
    )

    # Interactive Firestore reads need enough time for a cold gRPC channel to
    # reconnect, while remaining bounded for HTTP request latency.
    FIRESTORE_INTERACTIVE_READ_TIMEOUT_SECONDS = float(
        os.getenv("FIRESTORE_INTERACTIVE_READ_TIMEOUT_SECONDS", 8)
    )
    FIRESTORE_REST_READ_FALLBACK_ENABLED = (
        os.getenv("FIRESTORE_REST_READ_FALLBACK_ENABLED", "True").lower()
        == "true"
    )

    # Adaptive step budgets
    AGENT_DEFAULT_STEPS = int(os.getenv("AGENT_DEFAULT_STEPS", 50))
    AGENT_TOOL_TASK_STEPS = int(os.getenv("AGENT_TOOL_TASK_STEPS", 100))
    AGENT_LONG_TASK_STEPS = int(os.getenv("AGENT_LONG_TASK_STEPS", 200))
    # Persist and compact long workflows in bounded graph segments. Reaching a
    # segment boundary is an internal checkpoint, not a user-visible failure.
    AGENT_STEP_SEGMENT_STEPS = int(os.getenv("AGENT_STEP_SEGMENT_STEPS", 50))
    AGENT_TOOL_CALLS_PER_RUN = int(os.getenv("AGENT_TOOL_CALLS_PER_RUN", 20))
    AGENT_NORMAL_WALL_CLOCK_SECONDS = int(
        os.getenv("AGENT_NORMAL_WALL_CLOCK_SECONDS", 180)
    )
    AGENT_TOOL_TASK_WALL_CLOCK_SECONDS = int(
        os.getenv("AGENT_TOOL_TASK_WALL_CLOCK_SECONDS", 600)
    )
    AGENT_LONG_TASK_WALL_CLOCK_SECONDS = int(
        os.getenv("AGENT_LONG_TASK_WALL_CLOCK_SECONDS", 1200)
    )
    # When True (default), the pure run-policy resolver may elevate normal
    # prompts to tool_task or long_task before any run mutation occurs.
    AGENT_AUTO_TASK_MODE = os.getenv("AGENT_AUTO_TASK_MODE", "true").lower() == "true"

    # Session/Cookie Configuration (base defaults)
    DEV_AUTH_BYPASS = os.getenv("DEV_AUTH_BYPASS", "False").lower() == "true"
    DEV_AUTH_USER_ID = os.getenv("DEV_AUTH_USER_ID", "local-dev-user")
    DEV_AUTH_EMAIL = os.getenv("DEV_AUTH_EMAIL", "local-dev@moonlit.local")
    DEV_AUTH_NAME = os.getenv("DEV_AUTH_NAME", "Local Dev")
    ADMIN_UID = os.getenv("ADMIN_UID", "").strip()
    SESSION_COOKIE_NAME = os.getenv("SESSION_COOKIE_NAME", "firebase_session")
    CSRF_COOKIE_NAME = os.getenv("CSRF_COOKIE_NAME", "csrf_token")
    CSRF_HEADER_NAME = os.getenv("CSRF_HEADER_NAME", "x-csrf-token")
    FIREBASE_SESSION_CHECK_REVOKED = (
        os.getenv("FIREBASE_SESSION_CHECK_REVOKED", "True").lower() == "true"
    )
    SESSION_COOKIE_SECURE = False  # Override in production
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "lax"
    SESSION_EXPIRE_SECONDS = int(os.getenv("SESSION_EXPIRE_SECONDS", 86400))  # 24 hours
    # Legacy grace period — kept for backward compatibility but no longer used
    # for implicit-close detection (use SESSION_IMPLICIT_CLOSE_GRACE_SECONDS
    # instead). Was previously 45s, which caused false-positive disconnects
    # when browsers throttled background-tab timers.
    SESSION_ACTIVITY_GRACE_SECONDS = int(
        os.getenv("SESSION_ACTIVITY_GRACE_SECONDS", 45)
    )
    # Implicit-close grace period: how long the heartbeat can be silent before
    # the backend treats the tab as closed. Default 5 minutes — generous enough
    # to survive browser timer throttling (Chrome throttles to 1/min after 5
    # min; mobile Safari suspends entirely) without false-positiving on users
    # who briefly switch tabs. The explicit close event (beforeunload →
    # /user/session/close) is the PRIMARY close signal; this is only a fallback
    # for crashes/force-quits where beforeunload doesn't fire.
    SESSION_IMPLICIT_CLOSE_GRACE_SECONDS = int(
        os.getenv("SESSION_IMPLICIT_CLOSE_GRACE_SECONDS", 300)
    )
    REDIS_URL = os.getenv("REDIS_URL")
    REDIS_SOCKET_CONNECT_TIMEOUT_SECONDS = float(
        os.getenv("REDIS_SOCKET_CONNECT_TIMEOUT_SECONDS", "2")
    )
    REDIS_SOCKET_TIMEOUT_SECONDS = float(os.getenv("REDIS_SOCKET_TIMEOUT_SECONDS", "5"))
    REDIS_MAX_CONNECTIONS = int(os.getenv("REDIS_MAX_CONNECTIONS", "64"))
    _csrf_exempt_paths_raw = os.getenv(
        "CSRF_EXEMPT_PATHS", "/api/v1/user/session/close"
    )
    CSRF_EXEMPT_PATHS = {
        path.strip() for path in _csrf_exempt_paths_raw.split(",") if path.strip()
    }

    # Token budget configuration
    MODEL_CONTEXT_WINDOWS_PATH = os.getenv(
        "MODEL_CONTEXT_WINDOWS_PATH", "config/model_context_windows.json"
    )
    UNKNOWN_MODEL_CONTEXT_WINDOW_TOKENS = int(
        os.getenv("UNKNOWN_MODEL_CONTEXT_WINDOW_TOKENS", 32768)
    )
    RESERVED_OUTPUT_TOKENS = int(os.getenv("RESERVED_OUTPUT_TOKENS", 4000))
    MIN_USABLE_INPUT_BUDGET_TOKENS = int(
        os.getenv("MIN_USABLE_INPUT_BUDGET_TOKENS", 1000)
    )


    # Per-user quota windows
    USER_QUOTA_MINUTE_TTL_SECONDS = int(
        os.getenv("USER_QUOTA_MINUTE_TTL_SECONDS", 60)
    )
    USER_QUOTA_HOUR_TTL_SECONDS = int(os.getenv("USER_QUOTA_HOUR_TTL_SECONDS", 3600))
    USER_QUOTA_DAY_TTL_SECONDS = int(os.getenv("USER_QUOTA_DAY_TTL_SECONDS", 86400))

    # Agent memory windows

    # Database connection defaults
    DEFAULT_MYSQL_PORT = int(os.getenv("DEFAULT_MYSQL_PORT", 3306))
    DEFAULT_POSTGRESQL_PORT = int(os.getenv("DEFAULT_POSTGRESQL_PORT", 5432))
    DEFAULT_SQLSERVER_PORT = int(os.getenv("DEFAULT_SQLSERVER_PORT", 1433))
    DEFAULT_ORACLE_PORT = int(os.getenv("DEFAULT_ORACLE_PORT", 1521))
    DEFAULT_SQLSERVER_HOST = os.getenv("DEFAULT_SQLSERVER_HOST", "localhost")
    DEFAULT_SQLSERVER_DATABASE = os.getenv("DEFAULT_SQLSERVER_DATABASE", "master")
    DEFAULT_ORACLE_HOST = os.getenv("DEFAULT_ORACLE_HOST", "localhost")
    DEFAULT_ORACLE_SERVICE = os.getenv("DEFAULT_ORACLE_SERVICE", "ORCL")
    DEFAULT_POSTGRESQL_DATABASE = os.getenv("DEFAULT_POSTGRESQL_DATABASE", "postgres")
    DEFAULT_MYSQL_HOST = os.getenv("DEFAULT_MYSQL_HOST", "localhost")
    DEFAULT_DB_POOL_MIN_CONNECTIONS = int(os.getenv("DEFAULT_DB_POOL_MIN_CONNECTIONS", 1))
    DEFAULT_DB_POOL_MAX_CONNECTIONS = int(os.getenv("DEFAULT_DB_POOL_MAX_CONNECTIONS", 32))
    ORACLE_POOL_MIN_CONNECTIONS = int(os.getenv("ORACLE_POOL_MIN_CONNECTIONS", 2))
    ORACLE_POOL_INCREMENT = int(os.getenv("ORACLE_POOL_INCREMENT", 1))
    ORACLE_POOL_TIMEOUT_SECONDS = int(os.getenv("ORACLE_POOL_TIMEOUT_SECONDS", 60))
    MYSQL_TCP_FALLBACK_HOST = os.getenv("MYSQL_TCP_FALLBACK_HOST", "127.0.0.1")
    DB_CONNECT_TIMEOUT_SECONDS = int(os.getenv("DB_CONNECT_TIMEOUT_SECONDS", 5))
    DB_LOGIN_TIMEOUT_SECONDS = int(os.getenv("DB_LOGIN_TIMEOUT_SECONDS", 5))
    MYSQL_REMOTE_POOL_SIZE = int(os.getenv("MYSQL_REMOTE_POOL_SIZE", 5))
    MYSQL_CHARSET = os.getenv("MYSQL_CHARSET", "utf8mb4")
    MYSQL_COLLATION = os.getenv("MYSQL_COLLATION", "utf8mb4_unicode_ci")
    MYSQL_SQL_MODE = os.getenv(
        "MYSQL_SQL_MODE",
        "STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO",
    )
    _blocked_db_hosts_raw = os.getenv(
        "BLOCKED_DB_HOSTS", "localhost,127.0.0.1,::1,0.0.0.0"
    )
    BLOCKED_DB_HOSTS = {
        host.strip().lower() for host in _blocked_db_hosts_raw.split(",") if host.strip()
    }

    # API request validation limits
    REQUEST_BODY_MAX_BYTES = int(os.getenv("REQUEST_BODY_MAX_BYTES", 262_144))
    FIREBASE_ID_TOKEN_MAX_LENGTH = int(os.getenv("FIREBASE_ID_TOKEN_MAX_LENGTH", 8_192))
    CHAT_PROMPT_MAX_LENGTH = int(os.getenv("CHAT_PROMPT_MAX_LENGTH", 50000))
    CONVERSATION_ID_MAX_LENGTH = int(os.getenv("CONVERSATION_ID_MAX_LENGTH", 100))
    LLM_PROVIDER_MAX_LENGTH = int(os.getenv("LLM_PROVIDER_MAX_LENGTH", 50))
    LLM_MODEL_MAX_LENGTH = int(os.getenv("LLM_MODEL_MAX_LENGTH", 150))
    DEFAULT_REQUEST_MAX_ROWS = int(os.getenv("DEFAULT_REQUEST_MAX_ROWS", 1000))
    REQUEST_MAX_ROWS_LIMIT = int(os.getenv("REQUEST_MAX_ROWS_LIMIT", 100000))
    CONVERSATION_TITLE_MAX_LENGTH = int(os.getenv("CONVERSATION_TITLE_MAX_LENGTH", 80))
    DB_IDENTIFIER_MAX_LENGTH = int(os.getenv("DB_IDENTIFIER_MAX_LENGTH", 255))
    DB_CONNECTION_STRING_MAX_LENGTH = int(
        os.getenv("DB_CONNECTION_STRING_MAX_LENGTH", 2000)
    )
    # FIX [L10]: SQL_QUERY_MAX_LENGTH is defined once in the SQL Query
    # Security Configuration block above (and aliased as MAX_QUERY_LENGTH).
    # The duplicate definition that used to live here has been removed so
    # there is a single source of truth.
    QUERY_TIMEOUT_DEFAULT_SECONDS = int(os.getenv("QUERY_TIMEOUT_DEFAULT_SECONDS", 30))
    QUERY_TIMEOUT_MIN_SECONDS = int(os.getenv("QUERY_TIMEOUT_MIN_SECONDS", 1))
    QUERY_TIMEOUT_MAX_SECONDS = int(os.getenv("QUERY_TIMEOUT_MAX_SECONDS", 300))
    USER_SETTINGS_QUERY_TIMEOUT_MIN_SECONDS = int(
        os.getenv("USER_SETTINGS_QUERY_TIMEOUT_MIN_SECONDS", 10)
    )
    USER_SETTINGS_NULL_DISPLAY_MAX_LENGTH = int(
        os.getenv("USER_SETTINGS_NULL_DISPLAY_MAX_LENGTH", 32)
    )
    USER_SETTINGS_DEFAULT_THEME = os.getenv("USER_SETTINGS_DEFAULT_THEME", "dark")
    USER_SETTINGS_DEFAULT_CONFIRM_BEFORE_RUN = (
        os.getenv("USER_SETTINGS_DEFAULT_CONFIRM_BEFORE_RUN", "False").lower()
        == "true"
    )
    USER_SETTINGS_DEFAULT_QUERY_TIMEOUT = int(
        os.getenv("USER_SETTINGS_DEFAULT_QUERY_TIMEOUT", 30)
    )
    USER_SETTINGS_DEFAULT_MAX_ROWS = int(os.getenv("USER_SETTINGS_DEFAULT_MAX_ROWS", 1000))
    USER_SETTINGS_DEFAULT_NULL_DISPLAY = os.getenv("USER_SETTINGS_DEFAULT_NULL_DISPLAY", "NULL")
    USER_SETTINGS_DEFAULT_REMEMBER_CONNECTION = (
        os.getenv("USER_SETTINGS_DEFAULT_REMEMBER_CONNECTION", "False").lower()
        == "true"
    )
    USER_SETTINGS_DEFAULT_DB_TYPE = os.getenv(
        "USER_SETTINGS_DEFAULT_DB_TYPE", "postgresql"
    )
    USER_SETTINGS_DEFAULT_CONNECTION_PERSISTENCE = int(
        os.getenv("USER_SETTINGS_DEFAULT_CONNECTION_PERSISTENCE", 0)
    )
    USER_SETTINGS_DEFAULT_ENABLE_REASONING = (
        os.getenv("USER_SETTINGS_DEFAULT_ENABLE_REASONING", "True").lower()
        == "true"
    )
    USER_SETTINGS_DEFAULT_REASONING_EFFORT = os.getenv(
        "USER_SETTINGS_DEFAULT_REASONING_EFFORT", "medium"
    )
    USER_SETTINGS_DEFAULT_RESPONSE_STYLE = os.getenv(
        "USER_SETTINGS_DEFAULT_RESPONSE_STYLE", "balanced"
    )
    USER_SETTINGS_DEFAULT_LLM_PROVIDER = (
        os.getenv("USER_SETTINGS_DEFAULT_LLM_PROVIDER") or None
    )
    USER_SETTINGS_DEFAULT_LLM_MODEL = (
        os.getenv("USER_SETTINGS_DEFAULT_LLM_MODEL") or None
    )
    SESSION_INSTANCE_ID_MAX_LENGTH = int(
        os.getenv("SESSION_INSTANCE_ID_MAX_LENGTH", 200)
    )


class DevelopmentConfig(Config):
    """Development configuration: debug on, relaxed security, verbose logging."""

    DEBUG = True
    TESTING = False
    # ENH [LOG]: Changed from DEBUG to INFO. DEBUG level produced excessive
    # noise from httpcore/httpx/uvicorn on every request. Set LOG_LEVEL=DEBUG
    # in .env if you need to debug a specific issue.
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
    STARTUP_DIAGNOSTICS_ENABLED = (
        os.getenv("STARTUP_DIAGNOSTICS_ENABLED", "True").lower() == "true"
    )

    # Development-friendly settings
    SESSION_COOKIE_SECURE = False  # Allow HTTP for localhost
    SESSION_COOKIE_SAMESITE = "lax"

    # Relaxed rate limits for testing
    RATELIMIT_DEFAULT = os.getenv("RATELIMIT_DEFAULT", "1000 per day, 200 per hour")

    # LLM rate limiting disabled for dev - key rotation still works
    LLM_RATELIMIT_ENABLED = (
        os.getenv("LLM_RATELIMIT_ENABLED", "False").lower() == "true"
    )
    USER_QUOTA_ENABLED = os.getenv("USER_QUOTA_ENABLED", "False").lower() == "true"
    DEV_AUTH_BYPASS = os.getenv("DEV_AUTH_BYPASS", "False").lower() == "true"


class StagingConfig(Config):
    """Staging configuration: mirrors production with relaxed rate limits for QA."""

    DEBUG = False
    TESTING = False
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

    # Production-like security
    SESSION_COOKIE_SECURE = True  # Require HTTPS
    SESSION_COOKIE_SAMESITE = "strict"

    # Slightly relaxed rate limits for QA testing
    RATELIMIT_DEFAULT = os.getenv("RATELIMIT_DEFAULT", "500 per day, 100 per hour")

    # LLM rate limiting - enabled by default for staging, can override via .env
    LLM_RATELIMIT_ENABLED = os.getenv("LLM_RATELIMIT_ENABLED", "True").lower() == "true"
    LLM_MAX_RPM_PER_KEY = int(os.getenv("LLM_MAX_RPM_PER_KEY", 20))
    LLM_MAX_CONCURRENT = int(os.getenv("LLM_MAX_CONCURRENT", 3))

    # Shorter session for staging tests
    SESSION_EXPIRE_SECONDS = int(os.getenv("SESSION_EXPIRE_SECONDS", 43200))  # 12 hours
    SESSION_ACTIVITY_GRACE_SECONDS = int(
        os.getenv("SESSION_ACTIVITY_GRACE_SECONDS", 45)
    )


class ProductionConfig(Config):
    """Production configuration: strict security, minimal logging, mandatory CORS."""

    DEBUG = False
    TESTING = False
    LOG_LEVEL = os.getenv("LOG_LEVEL", "WARNING")

    # Strict security settings
    SESSION_COOKIE_SECURE = True  # HTTPS only
    SESSION_COOKIE_HTTPONLY = True  # No JS access
    SESSION_COOKIE_SAMESITE = "strict"  # Strict same-site policy

    # Production rate limiting
    RATELIMIT_ENABLED = os.getenv("RATELIMIT_ENABLED", "True").lower() == "true"
    RATELIMIT_DEFAULT = os.getenv("RATELIMIT_DEFAULT", "200 per day, 50 per hour")

    # LLM rate limiting - enabled by default for production, can override via .env
    LLM_RATELIMIT_ENABLED = os.getenv("LLM_RATELIMIT_ENABLED", "True").lower() == "true"
    LLM_MAX_RPM_PER_KEY = int(os.getenv("LLM_MAX_RPM_PER_KEY", 25))
    LLM_MAX_CONCURRENT = int(os.getenv("LLM_MAX_CONCURRENT", 5))
    LLM_QUEUE_TIMEOUT = int(os.getenv("LLM_QUEUE_TIMEOUT", 45))

    # Tighter query limits for production
    MAX_QUERY_RESULTS = int(os.getenv("MAX_QUERY_RESULTS", 5000))
    QUERY_TIMEOUT_SECONDS = int(os.getenv("QUERY_TIMEOUT_SECONDS", 15))
    SESSION_ACTIVITY_GRACE_SECONDS = int(
        os.getenv("SESSION_ACTIVITY_GRACE_SECONDS", 45)
    )

    @classmethod
    def validate_production_settings(cls):
        """Validate production security requirements (SECRET_KEY length, explicit CORS, HTTPS cookies)."""
        logger = logging.getLogger(__name__)

        # Secret key strength
        secret_key = os.getenv("SECRET_KEY", "")
        if len(secret_key) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters for production")

        # CORS must be explicitly set (no wildcards)
        if not cls.CORS_ORIGINS:
            raise ValueError("CORS_ORIGINS must be explicitly set in production")
        if "*" in str(cls.CORS_ORIGINS):
            raise ValueError("CORS_ORIGINS cannot contain '*' in production")

        # Verify HTTPS-only cookie
        if not cls.SESSION_COOKIE_SECURE:
            logger.warning("⚠️ SESSION_COOKIE_SECURE is False in production!")

        logger.info("✅ Production settings validated")
        return True


class TestingConfig(Config):
    """Testing configuration: fast timeouts, rate-limits disabled, relaxed security."""

    DEBUG = True
    TESTING = True
    LOG_LEVEL = os.getenv("LOG_LEVEL", "DEBUG")

    # Test-friendly settings
    SESSION_COOKIE_SECURE = False  # Tests often run without HTTPS
    SESSION_EXPIRE_SECONDS = 3600  # 1 hour - short for tests
    SESSION_ACTIVITY_GRACE_SECONDS = int(
        os.getenv("SESSION_ACTIVITY_GRACE_SECONDS", 45)
    )

    # Fast timeouts for test speed
    QUERY_TIMEOUT_SECONDS = 5
    MAX_QUERY_RESULTS = 100  # Small result sets for tests

    # Disable rate limiting in tests
    RATELIMIT_ENABLED = False
    TRUSTED_PROXY_CIDRS = ("127.0.0.1/32", "::1/128")
    LLM_RATELIMIT_ENABLED = False
    USER_QUOTA_ENABLED = False


# Configuration selection based on environment
config = {
    "development": DevelopmentConfig,
    "staging": StagingConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
    "default": DevelopmentConfig,
}


def get_config():
    """Return the configuration class selected by ``APP_ENV`` (development/staging/production/testing)."""
    env = _require_env("APP_ENV").strip().lower()
    if env not in _SUPPORTED_APP_ENVS:
        raise ValueError(
            f"Unsupported APP_ENV='{env}'. Allowed values: {', '.join(sorted(_SUPPORTED_APP_ENVS))}"
        )

    return config[env]
