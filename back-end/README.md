# MOONLIT Backend

> **AI Agent for relational databases.**
> FastAPI + LangGraph + Bedrock, with multi-database support (PostgreSQL, MySQL, SQL Server, Oracle), Firebase session-cookie auth, per-user Redis quota, and a Qdrant-backed long-context vector memory subsystem (VAMP).

- **Version:** 2.0.0
- **Python:** ≥ 3.12
- **Package name:** `moonlit-backend`
- **Config class selection:** `APP_ENV` env var → `development` / `staging` / `production` / `testing`

> This README was regenerated from the actual current codebase. No prior README existed.

---

## Table of contents

1. [Project structure](#project-structure)
2. [How to run](#how-to-run)
3. [HTTP endpoints](#http-endpoints)
4. [Environment variables](#environment-variables)
5. [Dependencies](#dependencies)
6. [Testing](#testing)
7. [Linting & type checking](#linting--type-checking)
8. [Operational notes](#operational-notes)

---

## Project structure

```
back-end/
├── main.py                            # FastAPI app entry point: lifespan, middleware, error handlers
├── api_router.py                      # Combined API router (aggregates all domain routers)
├── composition.py                     # Runtime port configuration (DI wiring)
├── config.py                          # Environment-driven Config + Dev/Staging/Prod/Testing subclasses
├── dependencies.py                    # FastAPI deps: get_current_user, CSRF, session state, db_config
├── pyproject.toml                     # Project metadata + ruff/pytest/mypy config
├── requirements.txt                   # Pinned dependency list
│
├── api_contract/                      # Pydantic request/response models + protocols (API surface)
│   ├── common.py                      # ApiSuccess / ApiError envelopes
│   ├── context.py                     # User-settings + session request schemas
│   ├── conversations.py               # ChatRequest, AgentResumeRequest, RenameConversationRequest
│   ├── conversations_protocols.py     # Conversation feature protocols
│   ├── database.py                    # ConnectDBRequest, RunQueryRequest, SwitchDatabaseRequest
│   ├── database_protocols.py          # Database feature protocols
│   ├── database_schemas.py            # ConnectDatabaseData, TableSchemaData, etc.
│   ├── orchestration_protocols.py     # Agent orchestration protocols
│   ├── query_schemas.py               # QueryResultData, RunSqlQueryData
│   ├── runtime_ports.py               # Port registry + typed accessors
│   └── streaming.py                   # SSE event models (TokenEvent, ToolStartEvent, DoneEvent, …)
│
├── controller/                        # FastAPI routers (HTTP layer)
│   ├── auth_controller.py             # /set_authenticated_user_session, /logout, /check, /firebase-config
│   ├── context_controller.py          # /user/context, /user/settings, /user/session/*, /context/metrics*
│   ├── conversations_controller.py    # /pass_user_prompt_to_llm, /resume_agent, /llm/options, /get_conversation, …
│   ├── database_controller.py         # /connect_db, /disconnect_db, /sync_connection_state, /run_sql_query, …
│   ├── database_schema_controller.py  # /get_schemas, /select_schema, /get_tables, /get_table_schema
│   ├── quota_controller.py            # /quota/status (router prefix=/quota)
│   └── rate_limiter.py                # Shared slowapi `limiter` instance + proxy-aware key function
│
├── core/                              # Cross-cutting infrastructure
│   ├── audit.py                       # Single-line JSON audit log emitter (SOX fields, PII redaction)
│   ├── errors.py                      # DB error classification + error-message sanitization
│   ├── logging.py                     # Request-ID contextvar + log filter
│   └── security.py                    # PII redaction, constant-time compare, SQL identifier validation
│
├── langgraph_orchestration/           # LangGraph ReAct agent + streaming pipeline
│   ├── checkpointing.py               # LangGraph checkpointer (Redis in prod, in-memory in dev)
│   ├── conversation_access.py         # Conversation-state access for orchestration
│   ├── conversation_streamer.py       # Concrete agent streamer impl
│   ├── historical_context.py          # Historical-context retrieval port
│   ├── prompt_builder.py              # System-prompt builders (main + summarization)
│   ├── react_graph.py                 # The ReAct graph definition
│   ├── result_analysis.py             # Tool-result post-processing (row-count safety)
│   ├── stream_budget.py               # Pre-call token budget calculation
│   ├── stream_context.py              # Initial stream-context loader
│   ├── stream_conversation.py         # The streaming pipeline (1787 lines — compaction, leases, continuations)
│   ├── stream_events.py               # SSE event translation + tag strippers (context tags, thinking tags)
│   ├── stream_lifecycle.py            # TaskRunLease — per-stream task-mode + interrupt lifecycle
│   ├── stream_protocol.py             # sse_encode / sse_error / sse_done
│   ├── summarization_context.py       # Summarization sub-agent context
│   ├── task_mode_detector.py          # Auto-classify normal/tool/long task modes
│   ├── tool_executor.py               # Tool dispatch + arg validation
│   ├── tool_schemas.py                # Pydantic schemas for agent tool args/results
│   ├── tools.py                       # Tool implementations exposed to the agent
│
├── llm_provider/                      # Bedrock client, model factory, token budgets, rate limiter
│   ├── bedrock_client.py              # boto3 client + langchain-aws chat model factory + prewarm
│   ├── model_capabilities.py          # Load + query per-model capability catalog
│   ├── model_capabilities.json        # Static capability map per model id
│   ├── model_factory.py               # Prewarm + instantiate langchain-aws chat models
│   ├── rate_limiter.py                # Per-provider per-user sliding-window RPM limiter
│   └── token_budget.py                # EXACT pre-call token counting via model-native tokenizers
│
├── service/                           # Domain services
│   ├── redis_service.py               # get_redis_client / set_redis_client singleton
│   ├── context/
│   │   ├── context_repository.py      # Firestore-backed user context store
│   │   └── context_service.py         # ContextService + ContextMetrics
│   ├── conversations/
│   │   ├── agent_streaming.py         # Agent streamer port access
│   │   ├── conversation_compaction_service.py   # check_and_summarize (lease-based claim model)
│   │   ├── conversation_repository.py            # Firestore conversation + message storage
│   │   ├── conversation_service.py               # Facade for controller
│   │   ├── conversation_streaming_service.py     # SSE headers + quota-error helpers
│   │   ├── orchestration_access.py               # Conversation state read/summarize ports
│   │   ├── summary_memory.py                     # Summary-memory port access
│   │   └── vector_memory_cleanup.py              # Qdrant pointer cleanup
│   ├── database/
│   │   ├── ai_tool_executor.py                   # Tool execution for the agent (read-only queries)
│   │   ├── connection_handlers.py                # Per-DBMS connection factories + SSRF validation
│   │   ├── connection_manager.py                 # Pool lifecycle + in-flight tracking
│   │   ├── connection_service.py                 # High-level connect/select-database service
│   │   ├── context_sync.py                       # Adapter between DB layer and user-context feature
│   │   ├── database_service.py                   # High-level DB operations facade
│   │   ├── mysql_utils.py                        # MySQL connection-string parser + kwargs builder
│   │   ├── operations.py                         # Query execution + row serialization
│   │   ├── security.py                           # SQL guard / blocked-hosts / SSRF protection
│   │   └── adapters/
│   │       ├── base_adapter.py                   # Abstract BaseDatabaseAdapter
│   │       ├── mysql_adapter.py
│   │       ├── oracle_adapter.py
│   │       ├── postgresql_adapter.py
│   │       └── sqlserver_adapter.py
│   ├── firestore/
│   │   └── firestore_service.py                 # Firebase Admin init + Firestore helpers (chunked storage)
│   ├── llm/
│   │   └── llm_options_service.py               # Provider/model option list for /llm/options
│   ├── quota/
│   │   └── user_quota_service.py                # Redis sliding-window per-user quota (3-tier: min/hr/day)
│   └── user_settings/
│       └── user_settings_service.py             # Firestore-backed user preferences
│
├── skills/                            # Agent skill prompts (markdown) + registry
│   ├── skill_registry.py              # Loads SKILL.md files at startup
│   ├── database-querying/SKILL.md
│   ├── query-history/SKILL.md
│   ├── react-flow-diagram/SKILL.md
│   └── web-research/SKILL.md
│
├── tests/                             # pytest suite (asyncio_mode=auto)
│   ├── conftest.py
│   ├── test_api_contract.py
│   ├── test_core_audit.py
│   ├── test_core_errors.py
│   ├── test_core_logging.py
│   ├── test_core_security.py
│   ├── test_database_adapters.py
│   ├── test_dependencies.py
│   ├── test_lua_merge_regression.py
│   ├── test_rate_limiter.py
│   └── test_stream_events.py
│
└── vamp_memory/                       # VAMP long-context vector memory subsystem
    ├── bedrock_embedding_provider.py  # Titan embedding provider
    ├── budget_selection.py            # adaptive_k + dedupe-select-budget-then-sort
    ├── conversation_ports.py          # Conversation ports backed by VAMP memory
    ├── historical_context_builder.py  # Format VAMP hits into prompt context
    ├── maintenance.py                 # Background VAMP maintenance loop
    ├── orchestration_provider.py      # Historical-context provider backed by VAMP
    ├── protocols.py                   # VAMP protocol interfaces
    ├── qdrant_vector_store.py         # Qdrant collection sync + search
    ├── summary_block_repository.py    # Firestore summary-block storage (chunked)
    └── vamp_memory_service.py         # VampMemoryService singleton
```

---

## How to run

### Prerequisites

- Python ≥ 3.12
- A Redis instance (required in staging/production; optional in dev — falls back to in-memory state)
- A Firebase service account (Admin SDK)
- AWS Bedrock access (the only supported LLM provider)
- A Qdrant cluster (required when `VAMP_MEMORY_ENABLED=True`, which is the default)

### Install

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

> The project ships a flat source tree, not an installed package — `pip install -r requirements.txt` is the canonical install path. `pyproject.toml` carries only project metadata + tooling config (ruff / pytest / mypy); there is no `[build-system]` and no `[project.dependencies]` block.

### Required environment variables before first run

Place these in a `.env` file at the project root — it's auto-loaded by `python-dotenv` at `config.py` import time.

| Variable | Why required |
|---|---|
| `SECRET_KEY` | **Always required** — `config.py` raises `ValueError` at import time if missing or set to the placeholder `"your_secret_key_here"`. Must be ≥ 32 chars in production. |
| `APP_ENV` | Selects the config class (`development` / `staging` / `production` / `testing`). Defaults to `development`. |
| `FIREBASE_TYPE`, `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_CLIENT_ID`, `FIREBASE_AUTH_URI`, `FIREBASE_TOKEN_URI` | All 8 required — `FirestoreService.initialize()` in lifespan validates and refuses to start without them. |
| `FIREBASE_WEB_PROJECT_ID` | Must equal `FIREBASE_PROJECT_ID` — validated at startup by `Config.validate_firebase_project_consistency()`. |
| `ADMIN_UID` | Firebase UID authorized for context metrics, metrics streaming, and metrics reset. The server starts when absent, but these routes fail closed with HTTP 403. |
| `CORS_ORIGINS` | Comma-separated allowed origins. **Required in production** (`ProductionConfig.validate_production_settings()` raises if missing or contains `*`). |
| `REDIS_URL` | **Required in staging/production** — lifespan raises `RuntimeError("REDIS_URL must be set for staging/production")`. Optional in dev (falls back to in-memory state). |
| `RATELIMIT_STORAGE_URL` | Must NOT be `memory://` in staging/production — lifespan raises `RuntimeError`. Use a Redis URL. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION` | Required when `LLM_PROVIDER=bedrock` (the only supported provider). Optional `AWS_SESSION_TOKEN` for temporary credentials. |
| `VAMP_QDRANT_URL` | Required when `VAMP_MEMORY_ENABLED=True` (default). `vector_store.ensure_ready()` runs in lifespan and warns if Qdrant is unreachable. |
| `FIREBASE_WEB_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID` | Firebase Web SDK config — served to the frontend at `/firebase-config-and-csrf-token`. Can be empty strings for local-only dev. |

Optional but recommended: `BEDROCK_MODELS` (comma-separated model IDs to prewarm at startup).

### Dev run (auto-reload, docs enabled)

```bash
APP_ENV=development python main.py
```

When `DEBUG=True` (`APP_ENV=development` or `testing`):
- `/docs` (Swagger UI), `/redoc`, and `/openapi.json` are served.
- Rate limiting and per-user quota are disabled by default (overridable via env).

When `DEBUG=False` (staging/production):
- Docs and OpenAPI routes are disabled.
- Rate limiting and per-user quota are enabled by default.

Equivalent uvicorn CLI:

```bash
APP_ENV=development uvicorn main:app --reload --host 0.0.0.0 --port 5000
```

### Production run (multiple workers)

> Multi-worker deployments **require shared Redis** for both `REDIS_URL` (sessions + quota + LangGraph checkpointer) and `RATELIMIT_STORAGE_URL` (slowapi). In-memory storage would fragment quota and rate-limit counters across workers.

```bash
APP_ENV=production gunicorn main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:5000
```

---

## HTTP endpoints

**37 total endpoints** across 6 OpenAPI tags. The auth router is mounted at the root (no `/api/v1` prefix); all other routers are mounted at `/api/v1`.

### Authentication & Authorization — no `/api/v1` prefix

| Method | Path | Summary |
|---|---|---|
| POST | `/set_authenticated_user_session` | Verify a Firebase ID token and establish a secure session cookie for the authenticated user. |
| GET | `/check_authenticated_user_session` | Validate whether the client request contains a valid, active session cookie. |
| POST | `/logout_authenticated_user_session` | Terminate the active session. |
| GET | `/firebase-config-and-csrf-token` | Serve Firebase web client configuration and issue a CSRF token. |

### General

| Method | Path | Summary |
|---|---|---|
| GET | `/api/v1/` | Health check — confirms the API is running. |

### Moonlit Conversation End Points

| Method | Path | Summary |
|---|---|---|
| POST | `/api/v1/pass_user_prompt_to_llm` | Handle incoming user prompts and stream the agentic/LLM response as SSE. |
| POST | `/api/v1/resume_agent` | Resume an active LangGraph conversation paused by a human-in-the-loop interrupt. |
| GET | `/api/v1/llm/options` | Retrieve available provider/model options and defaults for the current deployment. |
| GET | `/api/v1/get_conversation/{conversation_id}` | Get message history and status for a specific conversation. |
| GET | `/api/v1/get_execution_result/{conversation_id}/{execution_id}` | Get full query execution results (columns and rows) for an inline table. |
| GET | `/api/v1/get_all_user_conversations` | Retrieve all conversation metadata (id, title, timestamp) for the authenticated user. |
| DELETE | `/api/v1/delete_conversation/{conversation_id}` | Delete a conversation and all its associated messages. |
| PATCH | `/api/v1/rename_conversation/{conversation_id}` | Rename a conversation with a new custom title. |

### Database Operations End Points

| Method | Path | Summary |
|---|---|---|
| POST | `/api/v1/connect_db` | Connect to a remote database via connection string or host/port credentials. |
| POST | `/api/v1/disconnect_db` | Disconnect from the current database. |
| GET | `/api/v1/sync_connection_state` | Synchronize the active database connection state with the consumer. |
| GET | `/api/v1/get_databases` | Get list of available databases. |
| POST | `/api/v1/switch_remote_database` | Switch to a different database on remote server. |
| POST | `/api/v1/select_database` | Select a database on existing connection. |
| POST | `/api/v1/run_sql_query` | Execute a SQL query. |
| GET | `/api/v1/get_schemas` | Get all schemas in connected PostgreSQL database. |
| POST | `/api/v1/select_schema` | Select a PostgreSQL schema. |
| GET | `/api/v1/get_tables` | Get all tables in the current database/schema. |
| POST | `/api/v1/get_table_schema` | Get schema information for a specific table. |

### User Context & Settings

| Method | Path | Summary |
|---|---|---|
| GET | `/api/v1/user/context` | Get full user context including connection state and cached schemas. |
| POST | `/api/v1/user/context/refresh` | Refresh schema cache for current database. |
| DELETE | `/api/v1/user/context/schema/{database}` | Delete stored schema context for a specific database. |
| DELETE | `/api/v1/user/context/schemas` | Delete all stored schema contexts for user. |
| DELETE | `/api/v1/user/context/queries` | Clear query history for user. |
| GET | `/api/v1/context/metrics` | Get context hit/miss metrics for monitoring effectiveness. |
| GET | `/api/v1/context/metrics/stream` | Stream per-user context metrics whenever the Firestore context document changes. |
| POST | `/api/v1/context/metrics/reset` | Reset context metrics counters (for testing/monitoring). |
| GET | `/api/v1/user/settings` | Get per-user preferences (Firestore) and mirror persistence into the session. |
| POST | `/api/v1/user/settings` | Save per-user preferences to Firestore and mirror persistence into the session. |
| POST | `/api/v1/user/session/close` | Mark session as closed to enforce connection persistence window. |
| POST | `/api/v1/user/session/active` | Heartbeat to mark session as active. |

### User Quota

| Method | Path | Summary |
|---|---|---|
| GET | `/api/v1/quota/status` | Return the authenticated user's current rate-limit quota usage across all timeframes. |

---

## Environment variables

All values are sourced from `os.getenv(...)` calls in `config.py`. ~140 unique env vars total. Defaults shown are the **base `Config` class** defaults; per-environment subclasses (`DevelopmentConfig`, `StagingConfig`, `ProductionConfig`, `TestingConfig`) override some of them.

### Application / Environment

| Variable | Default | Description |
|---|---|---|
| `APP_ENV` | `development` | Selects the config class: `development` / `staging` / `production` / `testing`. Drives `DEBUG` and `TESTING` derived flags. |
| `APP_TITLE` | `MOONLIT` | FastAPI app title (OpenAPI title). |
| `APP_DESCRIPTION` | `AI Agent for relational databases` | FastAPI app description (OpenAPI description). |
| `APP_VERSION` | `2.0.0` | FastAPI app version. |
| `UVICORN_HOST` | `0.0.0.0` | Bind host for `uvicorn.run` in `main.py __main__`. |
| `UVICORN_PORT` | `5000` | Bind port. |
| `UVICORN_DEBUG_LOG_LEVEL` | `debug` | Uvicorn log level when `DEBUG=True`. |
| `UVICORN_LOG_LEVEL` | `info` | Uvicorn log level when `DEBUG=False`. |
| `DB_POOL_WORKER_BASIS` | `MAX_WORKERS` env or `32` | Sizing basis for DB connection pools. |
| `MAX_WORKERS` | `32` | Fallback when `DB_POOL_WORKER_BASIS` is unset. |

### Logging

| Variable | Default | Description |
|---|---|---|
| `LOG_LEVEL` | `INFO` (dev/staging), `WARNING` (prod), `DEBUG` (testing) | Root logger level. |
| `LOG_FILE` | `backend.log` | Path appended to by the `FileHandler` configured in `main.py`. |
| `LOG_FORMAT` | `%(asctime)s - %(name)s - %(levelname)s - request_id=%(request_id)s - %(message)s` | Python logging format string. Root handlers receive the request-correlation filter after logging is configured. |
| `THIRD_PARTY_LOG_LEVEL` | `WARNING` | Log level applied to every "noisy" third-party logger. |
| `NOISY_LOGGER_NAMES` | (long default — see `config.py`) | Comma-separated logger names silenced to `THIRD_PARTY_LOG_LEVEL`. |
| `REQUEST_LOG_EXCLUDED_PATHS` | `/api/v1/user/session/active` | Comma-separated paths whose request/response log lines are skipped. |
| `SENSITIVE_HEADER_NAMES` | `cookie,authorization,x-csrf-token` | Comma-separated header names redacted in request logs. |
| `SENSITIVE_BODY_LOG_PATHS` | `/api/v1/pass_user_prompt_to_llm,/api/v1/resume_agent` | Comma-separated paths whose request bodies are redacted in logs. |

### Security / Cookies / CSRF

| Variable | Default | Description |
|---|---|---|
| `SECRET_KEY` | (none) | **Required**. HMAC secret for signing session state. Must be ≥ 32 chars in production. |
| `SESSION_COOKIE_NAME` | `firebase_session` | Name of the Firebase session cookie. |
| `CSRF_COOKIE_NAME` | `csrf_token` | Name of the CSRF cookie (double-submit pattern). |
| `CSRF_HEADER_NAME` | `x-csrf-token` | Header name compared against the CSRF cookie. |
| `CSRF_EXEMPT_PATHS` | `/api/v1/user/session/close` | Comma-separated paths exempt from CSRF enforcement. |
| `SESSION_EXPIRE_SECONDS` | `86400` (12h staging) | Max age of the session cookie in seconds (capped at 24h by Firebase). |
| `SESSION_ACTIVITY_GRACE_SECONDS` | `45` | Legacy grace period (kept for backward compat; superseded by `SESSION_IMPLICIT_CLOSE_GRACE_SECONDS`). |
| `SESSION_IMPLICIT_CLOSE_GRACE_SECONDS` | `300` | Heartbeat silence tolerance before treating the tab as closed (5 min survives browser throttling). |
| `FIREBASE_SESSION_CHECK_REVOKED` | `True` | If true, `verify_session_cookie` is called with `check_revoked=True`. |
| `SECURITY_HEADER_CONTENT_TYPE_OPTIONS` | `nosniff` | Value of `X-Content-Type-Options` response header. |
| `SECURITY_HEADER_FRAME_OPTIONS` | `DENY` | Value of `X-Frame-Options` response header. |
| `SECURITY_HEADER_XSS_PROTECTION` | `1; mode=block` | Value of `X-XSS-Protection` response header. |
| `SECURITY_HEADER_HSTS` | `max-age=31536000; includeSubDomains` | Value of `Strict-Transport-Security` response header. |
| `SECURITY_HEADER_REFERRER_POLICY` | `no-referrer-when-downgrade` | Value of `Referrer-Policy` response header. |
| `SECURITY_HEADER_PERMISSIONS_POLICY` | `geolocation=()` | Value of `Permissions-Policy` response header. |
| `SERVER_HEADER_VALUE` | `Moonlit` | Masked value for the `Server` response header (info-disclosure guard). |
| `DEV_AUTH_BYPASS` | `False` | If true, skip Firebase auth and use a local dev user. |
| `DEV_AUTH_USER_ID` | `local-dev-user` | UID for the local dev user when `DEV_AUTH_BYPASS=True`. |
| `DEV_AUTH_EMAIL` | `local-dev@moonlit.local` | Email for the local dev user. |
| `DEV_AUTH_NAME` | `Local Dev` | Display name for the local dev user. |
| `ADMIN_UID` | (unset) | Server-owned Firebase UID allowed to access administrative telemetry. Missing or blank configuration denies all admin telemetry requests with HTTP 403. |

Every HTTP response is finalized by a pure-ASGI outer boundary. It replaces
the configured security headers and `Server`, removes `X-Powered-By`, and
returns a safe `X-Request-ID`. A valid inbound ID matching
`[A-Za-z0-9_-]{1,64}` is echoed; missing, duplicate, or unsafe values are
replaced with a generated opaque ID. The same ID is bound to application logs
for the duration of the request and cleared afterward.

CSRF, request-size, validation, authentication, rate-limit, framework HTTP,
and unhandled failures use the common JSON error envelope:

```json
{
  "status": "error",
  "error": "STABLE_MACHINE_CODE",
  "message": "Safe human-readable message.",
  "details": {}
}
```

Unhandled exceptions return `500 INTERNAL_SERVER_ERROR` without exposing the
exception message. The response boundary forwards ASGI response frames as they
arrive and does not buffer streaming responses.

### CORS

| Variable | Default | Description |
|---|---|---|
| `CORS_ORIGINS` | (unset) | Comma-separated allowed origin list. When unset, `CORSMiddleware` is not added. **Required in production** — `ProductionConfig.validate_production_settings` raises if missing or contains `*`. |

### Firebase Admin SDK (server-side)

All 8 are required — `Config.get_firebase_credentials()` raises `ValueError: Missing Firebase environment variables: ...` when `FirestoreService.initialize()` runs in lifespan.

| Variable | Description |
|---|---|
| `FIREBASE_TYPE` | Service-account `type` field. |
| `FIREBASE_PROJECT_ID` | Service-account `project_id`; must equal `FIREBASE_WEB_PROJECT_ID`. |
| `FIREBASE_PRIVATE_KEY_ID` | Service-account `private_key_id`. |
| `FIREBASE_PRIVATE_KEY` | Service-account `private_key` (literal `\n` converted to real newlines). |
| `FIREBASE_CLIENT_EMAIL` | Service-account `client_email`. |
| `FIREBASE_CLIENT_ID` | Service-account `client_id`. |
| `FIREBASE_AUTH_URI` | Service-account `auth_uri`. |
| `FIREBASE_TOKEN_URI` | Service-account `token_uri`. |

### Firebase Web/Client SDK (served to frontend at `/firebase-config-and-csrf-token`)

| Variable | Description |
|---|---|
| `FIREBASE_WEB_API_KEY` | Web SDK `apiKey`. |
| `FIREBASE_AUTH_DOMAIN` | Web SDK `authDomain`. |
| `FIREBASE_WEB_PROJECT_ID` | Web SDK `projectId` — must equal `FIREBASE_PROJECT_ID`. |
| `FIREBASE_STORAGE_BUCKET` | Web SDK `storageBucket`. |
| `FIREBASE_MESSAGING_SENDER_ID` | Web SDK `messagingSenderId`. |
| `FIREBASE_APP_ID` | Web SDK `appId`. |

### Redis / Sessions

| Variable | Default | Description |
|---|---|---|
| `REDIS_URL` | (none) | Redis URL for session state, per-user quota counters, LangGraph checkpointer. **Required in staging/production.** Optional in dev (falls back to in-memory state). |

### LLM / Bedrock

| Variable | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | `bedrock` | Selected LLM provider (only `bedrock` currently supported). |
| `AWS_ACCESS_KEY_ID` | (none) | AWS access key for Bedrock. Required when `LLM_PROVIDER=bedrock`. |
| `AWS_SECRET_ACCESS_KEY` | (none) | AWS secret key for Bedrock. |
| `AWS_SESSION_TOKEN` | (none) | Optional AWS session token for temporary credentials. |
| `AWS_DEFAULT_REGION` | (none) | AWS region for Bedrock. |
| `BEDROCK_MODELS` | `""` | Comma-separated Bedrock model IDs to prewarm at startup. |

### LLM Rate Limiting (per-provider, per-user)

| Variable | Default | Description |
|---|---|---|
| `LLM_RATELIMIT_ENABLED` | `True` (`False` in dev) | Master toggle for per-provider RPM limiter. |
| `LLM_MAX_RPM_PER_KEY` | `25` (20 staging, 25 prod) | Max requests per minute per provider per user. |
| `LLM_MAX_CONCURRENT` | `5` (3 staging, 5 prod) | Max concurrent in-flight LLM calls per provider per user. |
| `LLM_QUEUE_TIMEOUT` | `60` (45 prod) | Seconds a queued request waits for a concurrency slot. |
| `LLM_ACCOUNT_MAX_RPM` | `0` (disabled) | Global account-level RPM guard. 0 = disabled (Bedrock handles throttling). |

### Per-User Quota (Redis-backed, 3-tier)

| Variable | Default | Description |
|---|---|---|
| `USER_QUOTA_ENABLED` | `True` (`False` in dev/testing) | Master toggle for the per-user Redis quota. |
| `USER_QUOTA_PER_MINUTE` | `4` | Max user-initiated requests per minute. |
| `USER_QUOTA_PER_HOUR` | `100` | Max user-initiated requests per hour. |
| `USER_QUOTA_PER_DAY` | `500` | Max user-initiated requests per day. |
| `USER_QUOTA_MINUTE_TTL_SECONDS` | `60` | TTL of the per-minute Redis counter. |
| `USER_QUOTA_HOUR_TTL_SECONDS` | `3600` | TTL of the per-hour Redis counter. |
| `USER_QUOTA_DAY_TTL_SECONDS` | `86400` | TTL of the per-day Redis counter. |

### HTTP Rate Limiting (slowapi, IP-level)

| Variable | Default | Description |
|---|---|---|
| `RATELIMIT_ENABLED` | `True` (`False` in testing) | Master toggle for the slowapi IP-level limiter. |
| `RATELIMIT_STORAGE_URL` | `memory://` | Storage backend URL. **Must NOT be `memory://` in staging/production** — lifespan raises `RuntimeError`. |
| `RATELIMIT_DEFAULT` | `200 per day, 50 per hour` (relaxed in dev/staging) | Default per-IP rate-limit string. |
| `TRUSTED_PROXY_CIDRS` | `127.0.0.1/32,::1/128` | Comma-separated immediate ingress proxy networks whose forwarding headers may be trusted. Keep loopback-only for direct Uvicorn; set exact proxy CIDRs for a future deployment. Invalid entries fail startup. |

### SQL Query Security

| Variable | Default | Description |
|---|---|---|
| `MAX_QUERY_RESULTS` | `10000` (5000 prod, 100 testing) | Max rows a single query can return. |
| `QUERY_TIMEOUT_SECONDS` | `30` (15 prod, 5 testing) | Hard timeout for SQL query execution. |
| `SQL_QUERY_MAX_LENGTH` | `100000` | Max char length of a SQL query (aliased as `MAX_QUERY_LENGTH`). |
| `QUERY_TIMEOUT_DEFAULT_SECONDS` | `30` | Default per-request query timeout. |
| `QUERY_TIMEOUT_MIN_SECONDS` | `1` | Minimum allowed per-request query timeout. |
| `QUERY_TIMEOUT_MAX_SECONDS` | `300` | Maximum allowed per-request query timeout. |
| `USER_SETTINGS_QUERY_TIMEOUT_MIN_SECONDS` | `10` | Floor for the user-configurable query timeout. |

### API Request Validation Limits

| Variable | Default | Description |
|---|---|---|
| `REQUEST_BODY_MAX_BYTES` | `262144` | Maximum raw HTTP request body size in bytes. Bodies above this limit are rejected before route parsing. |
| `FIREBASE_ID_TOKEN_MAX_LENGTH` | `8192` | Maximum character length accepted for the Firebase ID token used to establish a session. |
| `CHAT_PROMPT_MAX_LENGTH` | `50000` | Max char length of a chat prompt. |
| `CONVERSATION_ID_MAX_LENGTH` | `100` | Max char length of a `conversation_id`. |
| `CONVERSATION_TITLE_MAX_LENGTH` | `80` | Max char length of a conversation title. |
| `LLM_PROVIDER_MAX_LENGTH` | `50` | Max char length of a provider name. |
| `LLM_MODEL_MAX_LENGTH` | `150` | Max char length of a model name. |
| `DEFAULT_REQUEST_MAX_ROWS` | `1000` | Default `max_rows` for query requests. |
| `REQUEST_MAX_ROWS_LIMIT` | `100000` | Hard ceiling on client-requested `max_rows`. |
| `DB_IDENTIFIER_MAX_LENGTH` | `255` | Max char length of a database/schema/table identifier. |
| `DB_CONNECTION_STRING_MAX_LENGTH` | `2000` | Max char length of a database connection string. |
| `SESSION_INSTANCE_ID_MAX_LENGTH` | `200` | Max char length of a session instance id (heartbeat). |

### Database Connection Defaults

| Variable | Default | Description |
|---|---|---|
| `DEFAULT_MYSQL_HOST` | `localhost` | Default MySQL host. |
| `DEFAULT_MYSQL_PORT` | `3306` | Default MySQL port. |
| `DEFAULT_POSTGRESQL_DATABASE` | `postgres` | Default PostgreSQL database name. |
| `DEFAULT_POSTGRESQL_PORT` | `5432` | Default PostgreSQL port. |
| `DEFAULT_SQLSERVER_HOST` | `localhost` | Default SQL Server host. |
| `DEFAULT_SQLSERVER_DATABASE` | `master` | Default SQL Server database name. |
| `DEFAULT_SQLSERVER_PORT` | `1433` | Default SQL Server port. |
| `DEFAULT_ORACLE_HOST` | `localhost` | Default Oracle host. |
| `DEFAULT_ORACLE_SERVICE` | `ORCL` | Default Oracle service name. |
| `DEFAULT_ORACLE_PORT` | `1521` | Default Oracle port. |
| `DEFAULT_DB_POOL_MIN_CONNECTIONS` | `1` | Min connections per DB pool. |
| `DEFAULT_DB_POOL_MAX_CONNECTIONS` | `32` | Max connections per DB pool. |
| `ORACLE_POOL_MIN_CONNECTIONS` | `2` | Oracle session-pool min. |
| `ORACLE_POOL_INCREMENT` | `1` | Oracle session-pool increment. |
| `ORACLE_POOL_TIMEOUT_SECONDS` | `60` | Oracle session-pool wait timeout. |
| `MYSQL_TCP_FALLBACK_HOST` | `127.0.0.1` | Host used when MySQL named-pipe fails over to TCP. |
| `MYSQL_REMOTE_POOL_SIZE` | `5` | Connection pool size for remote MySQL. |
| `MYSQL_CHARSET` | `utf8mb4` | Character set for MySQL connections. |
| `MYSQL_COLLATION` | `utf8mb4_unicode_ci` | Collation for MySQL connections. |
| `MYSQL_SQL_MODE` | `STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO` | `sql_mode` set on MySQL connections. |
| `BLOCKED_DB_HOSTS` | `localhost,127.0.0.1,::1,0.0.0.0` | Comma-separated hostnames/IPs blocked from being used as remote DB hosts (SSRF guard). |
| `DB_CONNECT_TIMEOUT_SECONDS` | `5` | TCP connect timeout for new DB connections. |
| `DB_LOGIN_TIMEOUT_SECONDS` | `5` | Login (auth handshake) timeout for new DB connections. |

### AI Context (Schema Cache)

| Variable | Default | Description |
|---|---|---|
| `SCHEMA_CONTEXT_TTL_SECONDS` | `86400` | TTL of cached schema context (Firestore-side UI cache). |
| `SCHEMA_CONTEXT_MAX_TABLES` | `1000` | Max tables stored per database in schema context. |
| `CONNECTION_CONTEXT_TTL_SECONDS` | `300` | TTL of per-connection context state. |
| `CONTEXT_METRICS_ENABLED` | `True` | Master toggle for hit/miss metrics tracking. |

### Token Budgets

| Variable | Default | Description |
|---|---|---|
| `MODEL_CONTEXT_WINDOWS_PATH` | `config/model_context_windows.json` | Path to JSON mapping model IDs to context-window sizes. |
| `UNKNOWN_MODEL_CONTEXT_WINDOW_TOKENS` | `32768` | Fallback context-window size for unknown models. |
| `RESERVED_OUTPUT_TOKENS` | `4000` | Tokens reserved for the LLM response in budget calculations. |
| `MIN_USABLE_INPUT_BUDGET_TOKENS` | `1000` | Floor for the input-token budget after subtracting reserved output. |

### VAMP Long-Context Memory

| Variable | Default | Description |
|---|---|---|
| `VAMP_MEMORY_ENABLED` | `True` | Master toggle for the VAMP long-context memory subsystem. |
| `VAMP_VECTOR_BACKEND` | `qdrant` | Vector store backend (only `qdrant` currently supported). |
| `VAMP_QDRANT_URL` | (none) | Qdrant cluster URL. Required when `VAMP_MEMORY_ENABLED=True`. |
| `VAMP_QDRANT_API_KEY` | (none) | Qdrant API key (required if cluster is secured). |
| `VAMP_QDRANT_COLLECTION` | `moonlit_vamp_memory` | Qdrant collection name for VAMP vectors. |
| `VAMP_EMBEDDING_MODEL` | `amazon.titan-embed-text-v2:0` | Bedrock embedding model ID. |
| `VAMP_EMBEDDING_DIMENSIONS` | `1024` | Vector dimensions matching the embedding model. |
| `VAMP_SIMILARITY_THRESHOLD` | `0.35` | Minimum cosine similarity for a VAMP retrieval to count as a hit. |
| `VAMP_INDEX_CONCURRENCY` | `4` | Max concurrent embedding/index operations. |
| `VAMP_MAINTENANCE_INTERVAL_SECONDS` | `30` | Interval between VAMP background maintenance sweeps. |
| `VAMP_MAINTENANCE_INITIAL_DELAY_SECONDS` | `5` | Initial delay before the first maintenance sweep. |
| `VAMP_MAINTENANCE_QUERY_TIMEOUT_SECONDS` | `15` | Per-query timeout for maintenance Firestore/Qdrant reads. |
| `VAMP_MAINTENANCE_MAX_BACKOFF_SECONDS` | `300` | Max backoff between maintenance retries. |
| `VAMP_CONTEXT_MIN_TOKENS` | `2048` | Min conversation length (tokens) before VAMP retrieval kicks in. |
| `VAMP_CONTEXT_MAX_TOKENS` | `12000` | Max tokens of VAMP-retrieved context injected into the prompt. |
| `VAMP_CONTEXT_WINDOW_RATIO` | `0.05` | Fraction of the model context window reserved for VAMP context. |
| `VAMP_SUMMARY_CLAIM_TTL_SECONDS` | `900` | TTL of the Firestore summary-claim lease (prevents duplicate summarization). |
| `VAMP_SUMMARY_INLINE_MAX_BYTES` | `700_000` | Max Firestore-doc size before summary payload is chunked. |
| `VAMP_SUMMARY_CHUNK_BYTES` | `450_000` | Chunk size used when splitting summary payloads across docs. |

### Firestore Tuning

| Variable | Default | Description |
|---|---|---|
| `FIRESTORE_INTERACTIVE_READ_TIMEOUT_SECONDS` | `8` | Per-read timeout for interactive Firestore reads. |
| `FIRESTORE_REST_READ_FALLBACK_ENABLED` | `True` | If true, fall back to the Firestore REST API when gRPC fails. |

### Agent Step Budgets

| Variable | Default | Description |
|---|---|---|
| `AGENT_DEFAULT_STEPS` | `50` | Max LangGraph steps for a normal task. |
| `AGENT_TOOL_TASK_STEPS` | `100` | Max steps when task mode = `tool`. |
| `AGENT_LONG_TASK_STEPS` | `200` | Max steps when task mode = `long`. |
| `AGENT_TOTAL_STEP_BUDGET` | `500` | Hard ceiling across all task modes. |
| `AGENT_STEP_SEGMENT_STEPS` | `50` | Step interval at which the graph is checkpointed/compacted. |
| `AGENT_AUTO_TASK_MODE` | `true` | If true, the backend auto-detects long/tool tasks from the prompt. |

### User Settings Defaults

| Variable | Default | Description |
|---|---|---|
| `USER_SETTINGS_DEFAULT_THEME` | `dark` | Default UI theme for new users. |
| `USER_SETTINGS_DEFAULT_CONFIRM_BEFORE_RUN` | `False` | Whether the UI asks for confirmation before running SQL. |
| `USER_SETTINGS_DEFAULT_QUERY_TIMEOUT` | `30` | Default per-user query timeout (seconds). |
| `USER_SETTINGS_DEFAULT_MAX_ROWS` | `1000` | Default per-user `max_rows`. |
| `USER_SETTINGS_DEFAULT_NULL_DISPLAY` | `NULL` | Default string shown for SQL NULL values. |
| `USER_SETTINGS_NULL_DISPLAY_MAX_LENGTH` | `32` | Max char length of the null-display string. |
| `USER_SETTINGS_DEFAULT_REMEMBER_CONNECTION` | `False` | Whether the UI remembers the DB connection across sessions. |
| `USER_SETTINGS_DEFAULT_CONNECTION_PERSISTENCE` | `0` | Default minutes to persist the DB connection after tab close (0 = no persistence). |
| `USER_SETTINGS_DEFAULT_ENABLE_REASONING` | `True` | Default for the "enable reasoning" UI toggle. |
| `USER_SETTINGS_DEFAULT_REASONING_EFFORT` | `medium` | Default reasoning effort (`low` / `medium` / `high`). |
| `USER_SETTINGS_DEFAULT_RESPONSE_STYLE` | `balanced` | Default response style (`concise` / `balanced` / `detailed`). |
| `USER_SETTINGS_DEFAULT_LLM_PROVIDER` | `None` | Default LLM provider override (None = use server default). |
| `USER_SETTINGS_DEFAULT_LLM_MODEL` | `None` | Default LLM model override (None = use server default). |

---

## Dependencies

Categorized from `requirements.txt`. The tokenizer stack is **all required** — the old chars/3 fallback has been removed; the indicator and summarization trigger now both rely on model-native token counts.

### Core (FastAPI stack)

- `fastapi>=0.109.0,<1.0.0`
- `uvicorn[standard]>=0.27.0,<1.0.0`
- `python-multipart>=0.0.6` — form-data support
- `python-dotenv>=1.0.0,<2.0.0` — `.env` loading
- `pydantic>=2.0.0,<3.0.0`

### Security

- `slowapi>=0.1.9,<1.0.0` — FastAPI rate limiting (IP-level)
- `pyjwt>=2.8.0,<3.0.0` — JWT tokens

### Database drivers (multi-database)

- `mysql-connector-python>=8.1.0,<9.0.0` — MySQL
- `psycopg2-binary>=2.9.0,<3.0.0` — PostgreSQL
- `pymssql>=2.3.0,<3.0.0` — SQL Server
- `oracledb>=2.0.0` — Oracle
- (SQLite is built into Python's stdlib — no extra dep)

### Firebase

- `firebase-admin>=6.2.0,<7.0.0`
- `google-cloud-firestore>=2.16.0,<3.0.0`
- `google-auth>=2.29.0,<3.0.0`

### Redis

- `redis>=5.0.0,<6.0.0`

### LLM / LangGraph ecosystem

- `langgraph>=1.1.0`
- `langgraph-checkpoint>=2.0.0`
- `langgraph-checkpoint-redis>=0.1.0`
- `langchain-core>=0.3.0`
- `langchain-aws>=0.2.0`
- `langchain-tavily>=0.1.0`
- `boto3>=1.35.0`
- `qdrant-client>=1.12.0,<2.0.0`

### Tokenizers (model-native exact token counting)

- `tiktoken>=0.7.0` — GPT-OSS 120B/20B, GPT-4o (`o200k_base` encoding)
- `mistral-common>=1.5.0` — Mistral Devstral 2 123B, Mistral Large (tekken tokenizer)
- `sentencepiece>=0.2.0` — required by mistral-common's tekken tokenizer
- `transformers>=4.46.0` — Moonshot Kimi K2/K2.5 (also works for other HF models)
- `tokenizers>=0.22.0` — Rust BPE engine required by `transformers`
- `huggingface-hub>=0.26.0` — downloads tokenizer files from HuggingFace Hub
- `safetensors>=0.4.0` — required by `transformers` (model weight format)
- `typer>=0.12.0` — required by `transformers` (CLI dependency)

### Other

- `sqlglot>=20.0.0` — SQL parsing/analysis
- `cachetools>=5.3.0` — caching utilities
- `requests>=2.28.0,<3.0.0` — HTTP client used by Firebase/GCP libs

---

## Testing

```bash
pytest
```

Configured via `[tool.pytest.ini_options]` in `pyproject.toml`:

- `asyncio_mode = "auto"`
- `testpaths = ["tests"]`
- `addopts = "-ra --strict-markers --tb=short"`
- Markers:
  - `slow` — marks tests as slow (deselect with `-m "not slow"`)
  - `integration` — marks tests that require external services (Firestore, Qdrant, Bedrock)

Test suite: 11 files in `tests/` (`conftest.py` + 10 `test_*.py`), covering:
- API contract schemas (size caps, validation)
- Core audit / errors / logging / security
- Database adapters (quote_identifier, parse_connection_string, identifier rejection)
- FastAPI dependencies (CSRF constant-time check, merge-state atomicity)
- Lua merge regression (Upstash `cjson.decode` fix)
- HTTP rate limiter (trusted-proxy / XFF / X-Real-IP)
- Stream events (context-tag stripper + think-tag parser)

---

## Linting & type checking

Configured in `pyproject.toml`:

- **ruff** — line-length 120, target py312. `E402` (import order) and `E501` (line length) are intentionally relaxed — see in-file comments in `pyproject.toml` for rationale.
  ```bash
  ruff check .
  ruff format .
  ```
- **mypy** — Python 3.12, `ignore_missing_imports = true`.
  ```bash
  mypy .
  ```

---

## Operational notes

1. **`SECRET_KEY` validation is at import time** — the app refuses to *start* (not just refuses to serve requests) without it. Set it in `.env` before first run.
2. **Multi-worker production deployments require shared Redis** — both `REDIS_URL` (for sessions + quota + LangGraph checkpointer) and `RATELIMIT_STORAGE_URL` (for slowapi) must point at a shared Redis backend. In-memory storage would fragment quota and rate-limit counters across workers.
3. **The auth router is mounted at the root** (no `/api/v1` prefix). All four auth endpoints (`/set_authenticated_user_session`, `/check_authenticated_user_session`, `/logout_authenticated_user_session`, `/firebase-config-and-csrf-token`) are therefore at the root. Every other endpoint is under `/api/v1/...`.
4. **`DEV_AUTH_BYPASS=True` is dev-only** — when enabled, requests without a session cookie authenticate as a local dev user. FIX [M17] restricts the bypass to ONLY the no-cookie case: a presented-but-invalid cookie returns 401/503, never silently dev-auths.
5. **`backend.log`** is the default `LOG_FILE` target and will be created at the project root. Consider gitignoring it.
6. **The `skills/` directory contains 4 `SKILL.md` files** (agent skill prompts) loaded at runtime by `skills/skill_registry.py`. They're runtime data, not Python modules.
7. **`pyproject.toml` has no `[build-system]`** and no `[project.dependencies]` block — it's purely a config file for ruff/pytest/mypy + project metadata. The canonical install path is `pip install -r requirements.txt`, not `pip install .`.
