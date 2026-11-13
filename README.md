# Moonlit

Moonlit is a streaming AI workspace for exploring relational databases with natural language. A React frontend connects to a FastAPI and LangGraph backend using Firebase session authentication and AWS Bedrock models.

## What you can do

- Connect PostgreSQL, MySQL, SQL Server, or Oracle; inspect databases, schemas, tables, and relationships.
- Ask questions, follow streamed model/tool activity, and revisit saved conversations.
- Run allowed read-only SQL, inspect saved results, and explore them with FINOS Perspective.
- Work with CodeMirror SQL tabs and React Flow diagrams in a resizable or fullscreen artifact panel.
- Manage settings, inspect personal usage, and delete your Moonlit account and its application data.

AWS Bedrock is the supported model provider. SQLite connections and database write workflows are outside the current scope. See [product scope and outstanding work](docs/product.md).

## Repository

```text
README.md             Project entry point and local quickstart
docs/                 Shared architecture, operations, and feature guides
back-end/             Python/FastAPI application, tests, and runtime skills
front-end/            React/Vite application, tests, and browser fixtures
```

The applications have separate dependency manifests and lockfiles. Run installation and application commands in the relevant directory; the root `package.json` does not orchestrate them.

## Local quickstart

You need Python 3.12+, uv 0.12.5, and Node.js 20.19+ or 22.12+ for Vite 7. You also need Firebase Authentication/Firestore credentials, AWS credentials with access to configured Bedrock models, and Qdrant when VAMP memory is enabled. Redis is optional for single-process development and required for staging/production.

### Configure services

Create `back-end/.env` using the [configuration guide](docs/configuration.md#first-run-configuration). The repository has no `.env.example`. Configure `APP_ENV`, a real `SECRET_KEY`, Firebase Admin and Web settings, AWS region/credentials, and `BEDROCK_MODELS` before launching the application.

Complete [Firebase provisioning](docs/operations.md#firebase-provisioning), then use the [local service instructions](docs/operations.md#local-services) for Qdrant and Redis. A real database is needed only for database workflows; current connection validation requires a globally routable host, so localhost/private-network databases are rejected. Do not put database credentials or provider secrets in documentation.

### Start the backend

Run from the repository root:

```bash
cd back-end
uv sync --locked
APP_ENV=development uv run --locked python main.py
```

The API defaults to `http://localhost:5000`. In debug environments, [Swagger UI](http://localhost:5000/docs), [ReDoc](http://localhost:5000/redoc), and [OpenAPI](http://localhost:5000/openapi.json) describe the HTTP routes and declared schemas. These endpoints are disabled in staging/production.

### Start the frontend

In a second terminal, run from the repository root:

```bash
cd front-end
npm ci
npm run dev
```

Open `http://localhost:5173` to sign in, or visit `/login` directly. Signed-in visitors continue to the chat workspace. Vite proxies the authentication and `/api` routes to the local API. Firebase Web configuration is obtained from the backend bootstrap endpoint; the browser must never receive Firebase Admin credentials.

## Validation

Use the [contributing guide](docs/contributing.md#validation) for backend tests/type checks, frontend tests/lint/build, and browser fixtures. It also explains focused checks and live-service limitations. Listed commands describe the workflow, not the current health of every gate.

## Documentation

| Need | Guide |
| --- | --- |
| Understand the application and data ownership | [Architecture](docs/architecture.md) |
| Develop, test, or update documentation | [Contributing](docs/contributing.md) |
| Configure the backend and its dependencies | [Configuration](docs/configuration.md) |
| Run services, deploy, or troubleshoot | [Operations](docs/operations.md) |
| Understand requirements and remaining decisions | [Product scope](docs/product.md) |
| Change frontend presentation consistently | [Design system](docs/design-system.md) |
| Understand streaming, history, skills, and evidence | [Conversations and agent execution](docs/features/conversations.md) |
| Understand SQL policy, result types, and analysis | [Database querying and results](docs/features/database-querying.md) |
| Understand account deletion and recovery | [Account erasure](docs/features/account-erasure.md) |
| Review security remediation and historical evidence | [Security findings](docs/security/findings.md) |

The Markdown files under `back-end/skills/*/SKILL.md` are application runtime assets. Keep them in place; they are not duplicate project documentation.

## Deployment limits

The repository does not contain a complete backend deployment manifest. Frontend Vercel rewrites forward the current authentication paths; verify session cookies and CSRF through the deployed proxy before release. Production-shaped verification of Firebase, Redis, Qdrant, Bedrock, remote databases, proxy streaming, and account-erasure recovery remains necessary. See [operations](docs/operations.md#deployment).

Full command idempotency, protected-action fencing, hard end-to-end budgets, and recoverable terminal finalization remain tracked work. Existing source controls and historical unit-test evidence do not establish production guarantees.
