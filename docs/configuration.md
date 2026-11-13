# Backend configuration

Configure the backend through environment variables and an untracked `back-end/.env`. [config.py](../back-end/config.py) loads dotenv at import time; launch commands from `back-end/` as documented. The frontend receives Firebase Web configuration from the API and must never receive Admin credentials.

## First-run configuration

Set these values before the [local quickstart](../README.md#local-quickstart):

| Setting | Requirement |
| --- | --- |
| `APP_ENV` | Required; one of `development`, `staging`, `production`, `testing`. Blank or unknown values fail startup. |
| `SECRET_KEY` | Required, not the placeholder; at least 32 characters in production. Generate a random secret and keep it outside version control. |
| Firebase Admin | Supply `FIREBASE_TYPE`, `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_CLIENT_ID`, `FIREBASE_AUTH_URI`, and `FIREBASE_TOKEN_URI` from a service account. Firestore initialization requires all eight. |
| Firebase Web | Supply `FIREBASE_WEB_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_WEB_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, and `FIREBASE_APP_ID` for browser authentication. Use the same project ID as Admin. A mismatch fails startup; a missing Web project ID currently warns, but leaves a working browser setup incomplete. |
| Firebase services | Enable the intended sign-in providers, authorize the frontend domain, and provision Firestore with the checked-in indexes and TTL policies. Credentials alone do not configure these services; follow [Firebase provisioning](operations.md#firebase-provisioning). |
| AWS | Configure `AWS_DEFAULT_REGION` and usable credentials. Environment keys are optional when the SDK credential chain supplies credentials (for example a profile or workload role). |
| `BEDROCK_MODELS` | Configure the comma-separated model allowlist; an empty list cannot authorize a chat model. Model access and IAM permissions must also exist in AWS. |
| VAMP/Qdrant | With `VAMP_MEMORY_ENABLED=True` (default), configure `VAMP_QDRANT_URL` and an API key if required by the server. To run without vector memory in development, explicitly disable VAMP. |
| Redis | Set `REDIS_URL` for staging/production, and shared `RATELIMIT_STORAGE_URL` when HTTP limiting is enabled. Development can use in-memory state. |
| `ADMIN_UID` | Optional for ordinary users; admin telemetry returns 403 unless it matches an authenticated UID. |
| `CORS_ORIGINS` | Explicit comma-separated origins are required in production; wildcards are rejected. |

There is no committed `.env.example`. Never copy private keys or database connection strings into documentation. Literal `\n` sequences in the Firebase private-key variable are converted into newlines by the configuration loader.

## Environment behavior

| Environment | Debug/OpenAPI | Cookies | Limits/checkpoint behavior |
| --- | --- | --- | --- |
| Development | Enabled | HTTP allowed; SameSite lax | LLM/user quotas disabled by default; HTTP limiter remains enabled by default; in-memory checkpoints |
| Staging | Disabled | Secure; SameSite strict | Shared Redis required; default 12-hour sessions; staging rate defaults |
| Production | Disabled | Secure, HTTP-only; SameSite strict | Shared Redis required; explicit CORS/secret validation; tighter query defaults |
| Testing | Enabled | HTTP allowed | HTTP/provider/user limits disabled; one-hour sessions; in-memory checkpoints |

`DEBUG`, `TESTING`, and cookie secure/HTTP-only/SameSite flags are selected by configuration classes, not environment variables with matching names. `DEV_AUTH_BYPASS` enables a local identity only when `DEBUG` is true and the request has no session cookie. Required authentication rejects presented empty, expired, invalid, or revoked cookies with 401. Optional authentication treats only 401 as anonymous and preserves infrastructure failures (503) and account-erasure denials (409). Keep bypass disabled when exercising ordinary login. Firebase initialization is still required. See the [verified fix](security/findings.md#debug-authentication-bypass).

Production startup validation is not deployment certification. Qdrant readiness failures are logged and memory maintenance can retry; Bedrock prewarming constructs clients without proving inference access. See [operations](operations.md).

## Environment reference

The tables below describe settings declared in [config.py](../back-end/config.py). Defaults refer to the base class unless an environment override is shown. Additional module-specific settings are listed at the end. A configured budget is not proof that every execution path enforces it; see [outstanding work](product.md#engineering-backlog).

### Application / Environment

| Variable | Default | Description |
|---|---|---|
| `APP_ENV` | Required; no default | Selects the config class: `development` / `staging` / `production` / `testing`. Drives `DEBUG` and `TESTING` derived flags. |
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
| `STARTUP_DIAGNOSTICS_ENABLED` | `True` in development; `False` otherwise | Run bounded Redis and Firestore connectivity probes and emit a sanitized startup summary. |
| `STARTUP_DIAGNOSTICS_TIMEOUT_SECONDS` | `5` | Maximum duration of the live Redis and Firestore startup probes. |
| `LOG_FILE` | `backend.log` | Path appended to by the `FileHandler` configured in `main.py`. |
| `AUDIT_LOG_FILE` | `audit.log` | Dedicated JSON-lines security audit path. The file and rotated successors are created with mode `0600`. |
| `AUDIT_LOG_MAX_BYTES` | `10485760` | Rotate the active audit file after it reaches 10 MiB. Must be greater than zero. |
| `AUDIT_LOG_BACKUP_COUNT` | `10` | Number of rotated audit files retained locally. Must be zero or greater. |
| `LOG_FORMAT` | `%(asctime)s - %(name)s - %(levelname)s - request_id=%(request_id)s - %(message)s` | Python logging format string. Root handlers receive the request-correlation filter after logging is configured. |
| `THIRD_PARTY_LOG_LEVEL` | `WARNING` | Log level applied to every "noisy" third-party logger. |
| `NOISY_LOGGER_NAMES` | (long default — see `config.py`) | Comma-separated logger names silenced to `THIRD_PARTY_LOG_LEVEL`. |
| `REQUEST_LOG_EXCLUDED_PATHS` | `/api/v1/user/session/active` | Comma-separated paths whose request/response log lines are skipped. |
| `SENSITIVE_HEADER_NAMES` | `cookie,authorization,x-csrf-token` | Comma-separated header names redacted in request logs. |
| `SENSITIVE_BODY_LOG_PATHS` | `/api/v1/pass_user_prompt_to_llm,/api/v1/resume_agent` | Comma-separated paths marked redacted in debug request logs. On other paths the middleware records the declared body size, when available. |

See [audit logging](operations.md#audit-logging) for privacy, rotation, shipping, and retention requirements.

### Security / Cookies / CSRF

| Variable | Default | Description |
|---|---|---|
| `SECRET_KEY` | (none) | **Required** application secret; also the audit actor-pseudonym fallback key. Must be at least 32 characters in production. |
| `SESSION_COOKIE_NAME` | `firebase_session` | Name of the Firebase session cookie. |
| `CSRF_COOKIE_NAME` | `csrf_token` | Backend CSRF-cookie name. The frontend currently hardcodes this default; changing it requires matching frontend changes. |
| `CSRF_HEADER_NAME` | `x-csrf-token` | Backend CSRF-header name. The frontend currently hardcodes this default; changing it requires matching frontend changes. |
| `CSRF_EXEMPT_PATHS` | `/api/v1/user/session/close` | Comma-separated paths exempt from CSRF enforcement. |
| `SESSION_EXPIRE_SECONDS` | `86400` (12h staging) | Configured session lifetime in seconds; testing fixes this to 3600. |
| `SESSION_IMPLICIT_CLOSE_GRACE_SECONDS` | `300` | Heartbeat silence tolerance before treating the tab as closed (5 min survives browser throttling). |
| `REDIS_SOCKET_CONNECT_TIMEOUT_SECONDS` | `2` | Redis socket connect timeout in seconds (used by session-state Redis client). |
| `REDIS_SOCKET_TIMEOUT_SECONDS` | `5` | Redis socket timeout/read deadline in seconds (used by session-state Redis client). |
| `REDIS_MAX_CONNECTIONS` | `64` | Redis client connection-pool cap for session state (redis asyncio). |
| `FIREBASE_SESSION_CHECK_REVOKED` | `True` | Controls revocation checks for the ID token at session creation and for the additional session-cookie check at account erasure. The ordinary protected-route session verifier always checks revocation. |
| `SECURITY_HEADER_CONTENT_TYPE_OPTIONS` | `nosniff` | Value of `X-Content-Type-Options` response header. |
| `SECURITY_HEADER_FRAME_OPTIONS` | `DENY` | Value of `X-Frame-Options` response header. |
| `SECURITY_HEADER_XSS_PROTECTION` | `1; mode=block` | Value of `X-XSS-Protection` response header. |
| `SECURITY_HEADER_HSTS` | `max-age=31536000; includeSubDomains` | Value of `Strict-Transport-Security` response header. |
| `SECURITY_HEADER_REFERRER_POLICY` | `no-referrer-when-downgrade` | Value of `Referrer-Policy` response header. |
| `SECURITY_HEADER_PERMISSIONS_POLICY` | `geolocation=()` | Value of `Permissions-Policy` response header. |
| `SERVER_HEADER_VALUE` | `Moonlit` | Masked value for the `Server` response header (info-disclosure guard). |
| `DEV_AUTH_BYPASS` | `False` | Debug-mode local identity for requests without a session cookie. A presented empty or rejected cookie cannot use the fallback. |
| `DEV_AUTH_USER_ID` | `local-dev-user` | UID for the local dev user when `DEV_AUTH_BYPASS=True`. |
| `DEV_AUTH_EMAIL` | `local-dev@moonlit.local` | Email for the local dev user. |
| `DEV_AUTH_NAME` | `Local Dev` | Display name for the local dev user. |
| `ADMIN_UID` | (unset) | Server-owned Firebase UID allowed to access administrative telemetry. Missing or blank configuration denies all admin telemetry requests with HTTP 403. |

See the [HTTP response contract](architecture.md#http-response-contract) for request IDs, security headers, and error envelopes.

The browser API client and chat-session lifecycle hook both use the default CSRF names directly. Keep backend names aligned with [client.js](../front-end/src/api/client.js) and [useChatPageSessionLifecycle.js](../front-end/src/hooks/chat-page/useChatPageSessionLifecycle.js), including any proxy/header configuration.

The legacy `SESSION_ACTIVITY_GRACE_SECONDS` variable has been retired. Set `SESSION_IMPLICIT_CLOSE_GRACE_SECONDS` to tune fallback close detection. The browser's Connection persistence preference controls how long the cached connection can be reused after the recorded close time.

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
| `AWS_ACCESS_KEY_ID` | (none) | Optional explicit access key; otherwise use the AWS SDK credential chain. |
| `AWS_SECRET_ACCESS_KEY` | (none) | Secret paired with an explicitly configured access key. |
| `AWS_SESSION_TOKEN` | (none) | Optional AWS session token for temporary credentials. |
| `AWS_DEFAULT_REGION` | (none) | AWS region used by the application; configure it for the intended Bedrock deployment. |
| `BEDROCK_MODELS` | `""` | Comma-separated authorized model IDs, also used for startup prewarming. Configure at least one usable model. |
| `KIMI_TOKENIZER_REPOSITORY` | `moonshotai/Kimi-K2-Instruct` | Hugging Face repository used for Kimi token counting. |
| `KIMI_TOKENIZER_REVISION` | pinned commit | Immutable Hugging Face revision whose custom tokenizer code may execute. Do not point this at a moving branch in production. |

### LLM Rate Limiting (per-provider, per-user)

| Variable | Default | Description |
|---|---|---|
| `LLM_RATELIMIT_ENABLED` | `True` (`False` in dev/testing) | Master toggle for per-provider RPM limiter. |
| `LLM_MAX_RPM_PER_KEY` | `25` (20 staging, 25 prod) | Max requests per minute per provider per user. |
| `LLM_MAX_CONCURRENT` | `5` (3 staging, 5 prod) | Max concurrent in-flight LLM calls per provider per user. |
| `LLM_QUEUE_TIMEOUT` | `60` (45 prod) | Seconds a queued request waits for a concurrency slot. |
| `LLM_ACCOUNT_MAX_RPM` | `0` (disabled) | Shared RPM ceiling per provider across users. Applies through the Redis limiter when set above zero. |

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
| `RATELIMIT_STORAGE_URL` | `memory://` | Storage backend URL. **Must use shared storage in staging/production when HTTP rate limiting is enabled**; lifespan rejects memory storage in that case. |
| `TRUSTED_PROXY_CIDRS` | `127.0.0.1/32,::1/128` | Comma-separated immediate ingress proxy networks whose forwarding headers may be trusted. Keep loopback-only for direct Uvicorn; set exact proxy CIDRs for a future deployment. Invalid entries fail startup. |

HTTP limits are declared on individual routes. The retired `RATELIMIT_DEFAULT` variable only affected startup logging.

### SQL Query Security

| Variable | Default | Description |
|---|---|---|
| `MAX_QUERY_RESULTS` | `10000` (5000 prod, 100 testing) | Configured result-row policy; effective request/adapter limits are described in the database guide. |
| `QUERY_TIMEOUT_SECONDS` | `30` (15 prod, 5 testing) | Configured SQL timeout policy; driver enforcement/cancellation support varies by DBMS. |
| `SQL_QUERY_MAX_LENGTH` | `100000` | Max char length of a SQL query (aliased as `MAX_QUERY_LENGTH`). |
| `QUERY_TIMEOUT_DEFAULT_SECONDS` | `30` | Default per-request query timeout. |
| `QUERY_TIMEOUT_MIN_SECONDS` | `1` | Minimum allowed per-request query timeout. |
| `QUERY_TIMEOUT_MAX_SECONDS` | `300` | Maximum allowed per-request query timeout. |
| `USER_SETTINGS_QUERY_TIMEOUT_MIN_SECONDS` | `10` | Floor for the user-configurable query timeout. |

See [SQL policy and deployment controls](features/database-querying.md#connections-and-policy) for dialect checks, permitted functions, and database authorization requirements.

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
| `ORACLE_POOL_TIMEOUT_SECONDS` | `60` | Idle connection timeout passed to `oracledb.create_pool(timeout=...)`; not a pool-acquisition or query deadline. |
| `MYSQL_TCP_FALLBACK_HOST` | `127.0.0.1` | Host used when MySQL named-pipe fails over to TCP. |
| `MYSQL_REMOTE_POOL_SIZE` | `5` | Connection pool size for remote MySQL. |
| `MYSQL_CHARSET` | `utf8mb4` | Character set for MySQL connections. |
| `MYSQL_COLLATION` | `utf8mb4_unicode_ci` | Collation for MySQL connections. |
| `MYSQL_SQL_MODE` | `STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO` | `sql_mode` set on MySQL connections. |
| `BLOCKED_DB_HOSTS` | `localhost,127.0.0.1,::1,0.0.0.0` | Additional hostname/IP denylist. Connection handlers separately require resolved addresses to be globally routable; removing an entry does not enable private/loopback targets. |
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
| `MODEL_CONTEXT_WINDOWS_PATH` | `config/model_context_windows.json` | Optional JSON override for the [bundled model capabilities](../back-end/llm_provider/model_capabilities.json). Relative paths resolve from `back-end/`. The [loader](../back-end/llm_provider/model_capabilities.py) merges matching model fields and caches the catalog for the process lifetime. |
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
| `VAMP_CONTEXT_MIN_TOKENS` | `2048` | Floor of the requested retrieved-context budget, capped by `VAMP_CONTEXT_MAX_TOKENS`; not a conversation-length threshold. |
| `VAMP_CONTEXT_MAX_TOKENS` | `12000` | Ceiling of the requested retrieved-context budget; end-to-end enforcement remains a verification target. |
| `VAMP_CONTEXT_WINDOW_RATIO` | `0.05` | Fraction of the model context window reserved for VAMP context. |
| `VAMP_SUMMARY_CLAIM_TTL_SECONDS` | `900` | TTL of the Firestore summary-claim lease (prevents duplicate summarization). |
| `VAMP_SUMMARY_INLINE_MAX_BYTES` | `700_000` | Inline serialized summary-text and memory-bullets threshold; larger structured payloads use chunk documents. Excludes document metadata. |
| `VAMP_SUMMARY_CHUNK_BYTES` | `450_000` | Chunk size used when splitting summary payloads across docs. |

### Firestore Tuning

| Variable | Default | Description |
|---|---|---|
| `FIRESTORE_INTERACTIVE_READ_TIMEOUT_SECONDS` | `8` | Per-read timeout for interactive Firestore reads. |
| `FIRESTORE_REST_READ_FALLBACK_ENABLED` | `True` | Enable REST fallback for transient conversation-document gRPC read failures. Once activated, subsequent conversation reads in that process use REST; other Firestore operations do not use this fallback. |

### Agent Step Budgets

| Variable | Default | Description |
|---|---|---|
| `AGENT_DEFAULT_STEPS` | `50` | Max LangGraph steps for a normal task. |
| `AGENT_TOOL_TASK_STEPS` | `100` | Max LangGraph steps for a `tool_task` run. |
| `AGENT_LONG_TASK_STEPS` | `200` | Max LangGraph steps for a `long_task` run. |
| `AGENT_STEP_SEGMENT_STEPS` | `50` | Maximum configured graph steps per segment, capped by the resolved run's graph budget. |
| `AGENT_TOOL_CALLS_PER_RUN` | `20` | Tool-call ceiling carried by every resolved run policy. |
| `AGENT_NORMAL_WALL_CLOCK_SECONDS` | `180` | Wall-clock ceiling carried by a normal run policy. |
| `AGENT_TOOL_TASK_WALL_CLOCK_SECONDS` | `600` | Wall-clock ceiling carried by a `tool_task` run policy. |
| `AGENT_LONG_TASK_WALL_CLOCK_SECONDS` | `1200` | Wall-clock ceiling carried by a `long_task` run policy. |
| `AGENT_AUTO_TASK_MODE` | `true` | If true, the backend auto-detects long/tool tasks from the prompt. |

### User Settings Defaults

| Variable | Default | Description |
|---|---|---|
| `USER_SETTINGS_DEFAULT_DB_TYPE` | `postgresql` | Default database type for user preferences. |
| `USER_SETTINGS_DEFAULT_THEME` | `dark` | Default for the legacy settings API `theme` field. Current browser Appearance starts in System mode and is stored locally. |
| `USER_SETTINGS_DEFAULT_CONFIRM_BEFORE_RUN` | `False` | Whether the UI asks for confirmation before running SQL. |
| `USER_SETTINGS_DEFAULT_QUERY_TIMEOUT` | `30` | Default per-user query timeout (seconds). |
| `USER_SETTINGS_DEFAULT_MAX_ROWS` | `1000` | Default per-user `max_rows`. |
| `USER_SETTINGS_DEFAULT_NULL_DISPLAY` | `NULL` | Default string shown for SQL NULL values. |
| `USER_SETTINGS_NULL_DISPLAY_MAX_LENGTH` | `32` | Max char length of the null-display string. |
| `USER_SETTINGS_DEFAULT_REMEMBER_CONNECTION` | `False` | Whether the UI saves connection form metadata in the current browser for reuse. See [session state and credentials](features/database-querying.md#session-state-and-credentials). |
| `USER_SETTINGS_DEFAULT_CONNECTION_PERSISTENCE` | `0` | Default minutes to persist the DB connection after tab close (0 = no persistence). |
| `USER_SETTINGS_DEFAULT_ENABLE_REASONING` | `True` | Default for the "enable reasoning" UI toggle. |
| `USER_SETTINGS_DEFAULT_REASONING_EFFORT` | `medium` | Default reasoning effort (`low` / `medium` / `high`). |
| `USER_SETTINGS_DEFAULT_RESPONSE_STYLE` | `balanced` | Default response style (`concise` / `balanced` / `detailed`). |
| `USER_SETTINGS_DEFAULT_LLM_PROVIDER` | `None` | Default LLM provider override (None = use server default). |
| `USER_SETTINGS_DEFAULT_LLM_MODEL` | `None` | Default LLM model override (None = use server default). |


## Settings outside config.py

These settings are read by their owning modules rather than the central configuration class:

| Variable | Default | Owner and behavior |
| --- | --- | --- |
| `BEDROCK_CLIENT_TTL_SECONDS` | `3000` | [bedrock_client.py](../back-end/llm_provider/bedrock_client.py); lifetime of cached clients/profile lookups before rebuilding through the SDK credential chain. |
| `AUDIT_ACTOR_PSEUDONYM_KEY` | `SECRET_KEY` fallback | [core/audit.py](../back-end/core/audit.py); key used to pseudonymize actors in audit records. Coordinate key management with audit-correlation requirements. |
| `TAVILY_API_KEY` | Unset | Required by the Tavily SDK for [web search](../back-end/langgraph_orchestration/tools.py); optional for workflows that do not use web research. Keep it in backend configuration. |
| `HF_TOKEN` | Unset | Optional Hugging Face credentials for tokenizer access; never include them in diagnostics. |
| `TRANSFORMERS_NO_ADVISORY_WARNINGS` | `1` if unset | [token_budget.py](../back-end/llm_provider/token_budget.py) initializes this SDK setting. |
| `HF_HUB_DISABLE_TELEMETRY` | `1` if unset | Tokenizer SDK telemetry default. |
| `HF_HUB_DISABLE_PROGRESS_BARS` | `1` if unset | Tokenizer SDK progress-output default. |
| `HF_HUB_DISABLE_PROGRESS_BARS` | `1` if unset | Tokenizer SDK progress-output default. |

Model-native tokenizers are part of the dependency set. Kimi custom tokenizer code is pinned to an immutable revision; do not replace it with a moving branch without reviewing the code and supply-chain impact. Exact dependency versions belong in the lockfiles, not copied package lists here.
