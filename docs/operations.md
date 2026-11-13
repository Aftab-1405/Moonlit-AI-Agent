# Operations

Use this guide to run local infrastructure, prepare a deployment, and investigate service failures. Application startup is in the [README](../README.md#local-quickstart); variable names and environment differences are in [configuration](configuration.md).

## Firebase provisioning

Use the same Firebase project for Authentication, the Web app configuration, and the backend service account. The frontend exposes Email/Password, Google, and GitHub sign-in. Enable the providers you intend to use, authorize the local/deployed frontend domains, and configure provider credentials and callback URLs. GitHub requires its OAuth client configuration in Firebase and the Firebase redirect URI in the GitHub app. See [Firebase's GitHub setup](https://firebase.google.com/docs/auth/web/github-auth). Confirm local domain authorization explicitly rather than assuming it is preconfigured.

Create the project's default Firestore database and grant the backend service account the required access. [firebase.json](../firebase.json) points to [firestore.indexes.json](../firestore.indexes.json), which defines composite indexes for conversations and summary-block retries, plus `expires_at` TTL policies for the `daily` and `events` collection groups. Backend startup does not deploy them.

With an authenticated [Firebase CLI](https://firebase.google.com/docs/cli), run from the repository root, replacing `YOUR_FIREBASE_PROJECT_ID` with the intended project ID:

```bash
firebase deploy --only firestore:indexes --project YOUR_FIREBASE_PROJECT_ID
```

Review the target project and configuration diff before deployment. Wait for indexes and TTL policies to become active and verify them in the console. Firebase's [index definition reference](https://firebase.google.com/docs/reference/firestore/indexes) describes the `fieldOverrides` TTL configuration.

[UsageRepository](../back-end/service/dashboard/usage_repository.py) writes expiration timestamps at UTC midnight 91 days after the event date. Those timestamps only schedule deletion when TTL is enabled; they do not delete documents themselves. [Firestore TTL deletion is asynchronous](https://firebase.google.com/docs/firestore/ttl), so this is not an exact deletion deadline or a replacement for account erasure.

## Local services

Docker must be running. On Linux with systemd, `sudo systemctl start docker` starts the daemon; Docker Desktop and other installations have their own lifecycle. Add `sudo` to Docker commands only if your local permissions require it.

The following development containers expose ports on loopback and retain data in named volumes. The `latest` tags match the previous development workflow; choose reviewed tags/digests for reproducible deployments.

```bash
docker run -d --name moonlit-qdrant --restart unless-stopped \
  -p 127.0.0.1:6333:6333 -p 127.0.0.1:6334:6334 \
  -v moonlit-qdrant-storage:/qdrant/storage qdrant/qdrant:latest

docker run -d --name moonlit-redis --restart unless-stopped \
  -p 127.0.0.1:6379:6379 -p 127.0.0.1:8001:8001 \
  -v moonlit-redis-data:/data redis/redis-stack:latest
```

Redis Stack supplies the JSON/search capabilities used by the Redis checkpoint integration; a bare Redis server should not be assumed equivalent. Development itself uses in-memory checkpoints even when Redis is configured for other application state.

Configure the backend to use these local services:

```dotenv
REDIS_URL=redis://localhost:6379
RATELIMIT_STORAGE_URL=redis://localhost:6379
VAMP_MEMORY_ENABLED=True
VAMP_QDRANT_URL=http://localhost:6333
```

For existing containers, use start/stop rather than recreating them. Inspect readiness with:

```bash
docker start moonlit-qdrant moonlit-redis
docker ps --filter name=moonlit-qdrant --filter name=moonlit-redis
docker exec moonlit-redis redis-cli ping
curl --fail http://localhost:6333/readyz
docker logs --tail 100 moonlit-qdrant
docker logs --tail 100 moonlit-redis
```

[Qdrant dashboard](http://localhost:6333/dashboard) and [RedisInsight](http://localhost:8001) are local diagnostic interfaces. `docker stop moonlit-qdrant moonlit-redis` stops the containers. Removing a container retains its named volume; removing a volume destroys its data. Do not reset Redis state while application workers can still write account data; see [erasure recovery](features/account-erasure.md#deployment-and-recovery).

## Deployment

The backend is a flat-source application with no package build step. From `back-end/`, install the locked production dependencies and start the documented process manager:

```bash
uv sync --locked --no-dev --no-build
APP_ENV=production uv run --locked --no-dev --no-build gunicorn main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:5000
```

This is a launch example, not a capacity recommendation or complete platform deployment. Match worker count and pool limits to measured load. No backend platform manifest is currently checked in. Frontend production assets come from `npm run build`; `npm run preview` is a local build preview, not the deployment architecture.

The browser calls relative authentication and `/api` paths. Production routing must forward those paths from the frontend origin to the backend, before the SPA fallback. Changing backend CORS alone does not redirect these requests. Preserve cookie/CSRF handling and verify the authentication handshake and SSE through that routing; the current client has no configurable API base URL.

Before deploying:

- Configure shared Redis for sessions, quotas, checkpoints, limits, and account-activity barriers. Use persistent, non-evicting storage for erasure barrier keys.
- Restrict Redis network access and application permissions, use TLS, and protect persisted data and backups. Session state can contain database credentials. See [session state and credentials](features/database-querying.md#session-state-and-credentials) for the storage and cleanup behavior.
- Configure explicit production CORS, secure cookies, a strong secret, least-privilege Firebase/AWS/database credentials, and actual Bedrock model access.
- Set `TRUSTED_PROXY_CIDRS` to the immediate trusted ingress networks. Do not trust all private networks or arbitrary forwarded headers.
- Preserve cookie and CSRF headers, SSE frames/heartbeats, connection cancellation, and appropriate proxy timeouts. Verify buffering/compression behavior through the deployed proxy.
- [front-end/vercel.json](../front-end/vercel.json) forwards `/firebase-config-and-csrf-token`, `/set_authenticated_user_session`, `/check_authenticated_user_session`, and `/logout_authenticated_user_session` to the backend before the SPA fallback. Keep these aligned with frontend endpoint constants and the backend controller. Verify JSON responses, session cookies, and CSRF through the deployed proxy. `/login` is the browser sign-in page, not a backend authentication endpoint.
- Validate the configured Firebase, Redis checkpoint integration, Qdrant, Bedrock, and all supported DBMS behaviors in staging. Source tests do not prove deployment IAM, TLS, private networking, retention, or recovery.
- Drain older workers before enabling account erasure; every writer must participate in the account-activity barrier.

Authentication routes are unversioned; product routes use `/api/v1`. Personal dashboard reads are `/api/v1/user/dashboard/overview` and `/api/v1/user/dashboard/usage`; account deletion is `DELETE /api/v1/user/account`. [api_router.py](../back-end/api_router.py) and debug OpenAPI own the complete endpoint inventory.

## Audit logging

[core/audit.py](../back-end/core/audit.py) owns structured audit emission. [audit_middleware.py](../back-end/core/audit_middleware.py) owns the selected HTTP action policy, including account deletion. Agent SQL records its own outcome. The route policy is intentionally selective; do not claim that every request emits an audit event.

The response/request correlation ID is shared with application logs. HTTP SQL audit records contain method/status metadata rather than SQL text. Agent SQL records statement type, row count, or a stable failure reason. Secrets, connection strings, raw SQL, bodies, database identity, and raw external exception text must not appear in the event payload. Actor identity is pseudonymized through the audit helper.

The application creates a dedicated JSON-lines file with mode `0600`, configured rotation, and a payload-free delivery-failure signal. Defaults are `audit.log`, 10 MiB per file, and 10 backups. A broken sink is best effort and does not fail the user's request.

Deployments must collect active and rotated files into a restricted, tamper-resistant sink and verify ingestion, delivery alerts, retention/deletion, encryption, disk capacity, backups, and time synchronization. Python's local rotating handler is not a multi-process collection system. Use deployment-managed rotation/collection or a suitable transport, and measure behavior with multiple workers. No compliance certification follows from the presence of these modules.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `uv` missing or wrong version | Install the project's pinned 0.12.5 release; reopen the shell or add its install directory to PATH; inspect `uv --version`. |
| Import/startup rejects configuration | Check required `APP_ENV`/`SECRET_KEY`, Firebase service-account fields, matching Web/Admin project IDs, and production CORS/Redis requirements. |
| Firebase login reports a disabled provider or unauthorized domain | Check the project's enabled Email/Password/Google/GitHub providers, authorized domains, OAuth credentials, and callback URLs. |
| Firestore queries need an index, or expired usage records accumulate | Deploy the checked-in index/TTL configuration to the correct project, then verify activation; TTL deletion is asynchronous. |
| Container name already exists | Inspect `docker ps -a`; start the existing container or deliberately replace it while preserving its volume. |
| Qdrant unavailable | Check `VAMP_QDRANT_URL`, API key, container logs, and `/readyz`; startup can continue with a memory warning. |
| Redis unavailable | Check the configured URLs, `redis-cli ping`, persistence/modules, connectivity, and logs. Development fallback is not multi-worker production behavior. |
| Port occupied | Inspect the listener, for example `ss -ltnp`; change the configured API port and matching Vite proxy together if needed. |
| Model selection/inference fails | Check `BEDROCK_MODELS`, region, SDK credentials/profile, model access, and IAM. A prewarmed client does not prove inference access. |
| Database host validation rejects a local or private host | Current connection entry points require globally routable addresses. Changing `BLOCKED_DB_HOSTS` does not remove the independent address checks. |
| Stream arrives in batches or disconnects | Verify proxy buffering/compression, timeouts, SSE framing, and cancellation through the actual deployment. |
| Account deletion returns 409 or remains pending | Follow the [account-erasure recovery procedure](features/account-erasure.md#deployment-and-recovery); never clear live admissions to force deletion. |

Do not paste logs containing credentials or real database contents into documentation. Capture sanitized errors, request IDs, environment class, relevant versions, and exact verification commands.
