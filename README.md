# Moonlit

> **Agentic AI Platform for Natural Language Database Operations**

![Python](https://img.shields.io/badge/Python-3.11+-blue?logo=python&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)
![LangGraph](https://img.shields.io/badge/LangGraph-1.1+-FF6B35?logo=langchain&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-Auth%20%2B%20Firestore-FFCA28?logo=firebase&logoColor=black)

**Live Demo:** https://moonlit-ai-agent.vercel.app/

---

> **Important — Deployed Version Constraints**
>
> The live deployment runs on **free tiers** of all services (Render, Upstash, Cerebras, Gemini). As a result:
> - **Responses may be slow or occasionally fail** — free-tier LLM APIs have strict rate limits and can return errors under load.
> - **The backend cold-starts** after a period of inactivity on Render's free tier, adding a 30–60 second delay on the first request.
> - **Only Cerebras and Gemini** LLM providers are active in the deployed version. Anthropic and OpenAI are supported in the codebase but not configured in production.

---

## What is Moonlit?

Moonlit is a web-based AI agent that lets you interact with relational databases using plain English. Instead of writing SQL manually, you describe what you need — and the agent reasons, plans, and executes the right queries on your behalf.

It is not a simple chatbot that wraps an LLM. Moonlit runs a **LangGraph ReAct agent** that autonomously selects tools, inspects your database schema, executes queries, and iterates until your request is fully answered — all within a streaming chat interface.

---

## The Problem It Solves

Working with relational databases requires SQL fluency, schema knowledge, and context about relationships between tables. This creates friction for:

- Developers who know what they want but not the exact query
- Analysts who understand data but aren't SQL experts
- Teams working across multiple database systems with different syntax

Moonlit removes that friction. You connect your database, describe your goal, and the agent handles the rest — from exploring the schema to running the right query to visualizing the result.

---

## Features

### AI Agent
| Feature | Description |
|---------|-------------|
| **ReAct Agent Loop** | Autonomously reasons → selects tools → acts → observes → repeats until complete |
| **Multi-Provider LLM** | Supports Gemini, Cerebras, Anthropic (Claude), and OpenAI — switchable per-session |
| **Web Search Tool** | Agent can search the web via Tavily for external docs or context |
| **Reasoning Mode** | Extended thinking/reasoning budget for complex multi-step problems |
| **Conversation Memory** | Full conversation history persisted in Firestore, resumed across sessions |
| **Agent Checkpointing** | LangGraph thread state stored in Redis — agent resumes where it left off |
| **Streaming Responses** | AI responses and tool events streamed in real-time via SSE |

### Database Operations
| Feature | Description |
|---------|-------------|
| **Multi-Database Support** | PostgreSQL, MySQL, SQL Server, Oracle |
| **Schema Discovery** | Agent explores tables, columns, indexes, foreign keys, and constraints |
| **Safe Query Execution** | Only SELECT statements allowed — no write access |
| **Connection Pooling** | Thread-safe singleton manager with automatic cleanup |
| **Remote Databases Only** | Connects to databases accessible over a network (host + port). Databases running on your local machine are not reachable because the backend is hosted on Render — it has no access to your localhost. |
| **Result Limits** | Configurable max rows returned (default 5,000 in production) |

### Interface
| Feature | Description |
|---------|-------------|
| **Model Selector** | Switch LLM provider and model from within the chat input |
| **SQL Editor** | Monaco-powered SQL editor with syntax highlighting |
| **Result Visualization** | Chart.js charts and formatted data tables for query results |
| **Mermaid Diagrams** | AI can render ER diagrams and flowcharts inline |
| **Markdown Rendering** | Full markdown + code block support in AI responses |
| **Dark / Light Theme** | User-selectable with custom colour palettes |
| **Conversation Sidebar** | Browse, resume, and delete past conversations |

### Security & Reliability
| Feature | Description |
|---------|-------------|
| **Firebase Authentication** | Cryptographic ID token verification on every request |
| **Session Storage** | HttpOnly, Secure, SameSite cookies backed by Redis |
| **Two-Layer Rate Limiting** | Per-user quotas (Redis) + global LLM concurrency limiter |
| **Query Timeout** | Configurable execution timeout (default 15s in production) |
| **CORS Allowlist** | Explicit origin list required in production — no wildcards |

---

## Architecture

```
moonlit/
├── back-end/                        # FastAPI + LangGraph server
│   ├── api/routes/                  # REST endpoints (auth, db, chat, quota)
│   ├── agent/                       # LangGraph ReAct agent
│   │   ├── graph.py                 # Agent graph definition
│   │   ├── tools.py                 # 8 agent tools
│   │   ├── prompt_builder.py        # Dynamic system prompt construction
│   │   └── agent.py                 # Streaming agent runner
│   ├── auth/                        # Firebase token verification + session management
│   ├── database/
│   │   └── adapters/                # MySQL, PostgreSQL, SQL Server, Oracle adapters
│   ├── services/
│   │   ├── llm/                     # Multi-provider LLM factory + model registry
│   │   └── rate_limiting/           # Per-user quota + global LLM semaphore
│   ├── config.py                    # Environment-based configuration (dev/staging/prod)
│   └── main.py                      # App entry point + lifespan management
│
└── front-end/                       # React 19 SPA (Vite)
    └── src/
        ├── api/                     # Centralized API layer
        ├── components/              # UI components (Chat, SQL editor, charts, sidebar)
        ├── contexts/                # Auth, Database, Theme React contexts
        ├── pages/                   # Landing, Auth, Chat
        └── hooks/                   # Custom React hooks
```

**Deployment:**
- Frontend → Vercel (static SPA with API proxy rewrites)
- Backend → Render (Python web service)
- Sessions + Rate Limiting → Upstash Redis
- Auth + Conversation History → Firebase (Auth + Firestore)

---

## AI Tools

The LangGraph agent autonomously selects from these tools during a conversation:

| Tool | Description |
|------|-------------|
| `get_connection_status` | Check if a database is connected and retrieve connection details |
| `get_database_list` | List all databases available on the connected server |
| `get_database_schema` | Get all tables and columns for the current database |
| `get_table_columns` | Get detailed column info (names, types) for a specific table |
| `execute_query` | Run a SELECT query and return results |
| `get_table_indexes` | Get indexes on a table (name, columns, uniqueness) |
| `get_foreign_keys` | Get foreign key relationships for a table or all tables |
| `web_search` | Search the web (via Tavily) for external context or documentation |

Tools that read schema or connection state are **cached within a conversation turn** to avoid redundant calls.

---

## Tech Stack

### Backend
| Layer | Technology |
|-------|-----------|
| Framework | FastAPI 0.115+ |
| Agent | LangGraph 1.1+ (ReAct agent, Redis checkpointing) |
| LLM Providers | Gemini, Cerebras, Anthropic, OpenAI |
| Authentication | Firebase Admin SDK |
| Session Storage | Upstash Redis (redis-py) |
| Rate Limiting | Custom async semaphore + slowapi |
| Databases | psycopg2, mysql-connector-python, oracledb, pyodbc |
| ASGI Server | Uvicorn + Gunicorn |

### Frontend
| Layer | Technology |
|-------|-----------|
| Build Tool | Vite 7 |
| Framework | React 19 |
| UI Library | Material UI 7 |
| SQL Editor | Monaco Editor |
| Charts | Chart.js |
| Diagrams | Mermaid |
| Auth | Firebase Web SDK |
| Markdown | react-markdown + remark-gfm |

---

## Quick Start (Local Development)

### Prerequisites
- Python 3.11+
- Node.js 18+
- A Firebase project (Auth + Firestore enabled)
- An API key for at least one LLM provider (Gemini, Cerebras, Anthropic, or OpenAI)
- Upstash Redis account (for staging/production; in-memory used in development)

### 1. Clone the Repository

```bash
git clone <repository-url>
cd moonlit
```

### 2. Backend

```bash
cd back-end

# Install dependencies
pip install pipenv
pipenv install

# Configure environment
cp .env.example .env
# Edit .env with your credentials (see Configuration section below)

# Start development server
pipenv run uvicorn main:app --host 0.0.0.0 --port 5000 --reload
```

### 3. Frontend

```bash
cd front-end

# Install dependencies
npm install

# Start development server
npm run dev
```

### 4. Access

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:5000 |
| API Docs (dev only) | http://localhost:5000/docs |

---

## Configuration

Create a `.env` file in `back-end/`. All variables marked **required** must be set.

```env
# ── Application ────────────────────────────────────────────────────────────────
APP_ENV=development              # development | staging | production
SECRET_KEY=your-secret-key       # Required. Must be >=32 chars in production.

# ── LLM Provider ───────────────────────────────────────────────────────────────
LLM_PROVIDER=gemini              # gemini | cerebras | anthropic | openai
GEMINI_API_KEYS=key1,key2        # Comma-separated for round-robin load balancing
# CEREBRAS_API_KEYS=key1,key2
# ANTHROPIC_API_KEYS=key1,key2
# OPENAI_API_KEYS=key1,key2

# ── Rate Limiting ───────────────────────────────────────────────────────────────
LLM_RATELIMIT_ENABLED=true
LLM_MAX_RPM_PER_KEY=25           # Requests per minute per API key
LLM_MAX_CONCURRENT=5             # Max simultaneous LLM calls globally
USER_QUOTA_ENABLED=true
USER_QUOTA_PER_MINUTE=4
USER_QUOTA_PER_HOUR=100
USER_QUOTA_PER_DAY=500

# ── Firebase Admin SDK (required) ──────────────────────────────────────────────
FIREBASE_TYPE=service_account
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY_ID=your-key-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
FIREBASE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=123456789
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token

# ── Firebase Web SDK (required) ────────────────────────────────────────────────
FIREBASE_WEB_API_KEY=your-web-api-key
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_WEB_PROJECT_ID=your-project-id
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789
FIREBASE_APP_ID=1:123456789:web:abcdef

# ── Redis (required for staging/production) ─────────────────────────────────────
UPSTASH_REDIS_URL=redis://default:PASSWORD@HOST:6379
RATELIMIT_STORAGE_URL=redis://default:PASSWORD@HOST:6379   # Must NOT be memory:// in production

# ── CORS (required in production) ──────────────────────────────────────────────
CORS_ORIGINS=https://your-app.vercel.app

# ── Optional ────────────────────────────────────────────────────────────────────
MAX_QUERY_RESULTS=5000           # Max rows returned per query (prod default: 5000)
QUERY_TIMEOUT_SECONDS=15         # Query execution timeout (prod default: 15s)
MAX_WORKERS=32                   # Thread pool size for blocking DB operations
```

---

## Deployment

### Backend (Render)

1. Create a new **Web Service** on Render and connect your GitHub repository.
2. Set the **Root Directory** to `back-end`.
3. Set the **Build Command** to `pip install -r requirements.txt`.
4. Set the **Start Command** to:
   ```
   gunicorn -w 4 -k uvicorn.workers.UvicornWorker --timeout 120 main:app
   ```
5. Add all required environment variables from the Configuration section above.
6. Ensure `APP_ENV=production` and `RATELIMIT_STORAGE_URL` points to Redis (not `memory://`).

### Frontend (Vercel)

1. Connect your GitHub repository to Vercel.
2. Set the **Root Directory** to `front-end`.
3. Vercel auto-detects Vite — no build command changes needed.
4. The `vercel.json` proxy rewrites handle all backend API calls transparently.

### Production Checklist

- [ ] `APP_ENV=production`
- [ ] `SECRET_KEY` is at least 32 characters
- [ ] `CORS_ORIGINS` set to your Vercel domain (no wildcards)
- [ ] `UPSTASH_REDIS_URL` configured
- [ ] `RATELIMIT_STORAGE_URL` uses Redis, not `memory://`
- [ ] All Firebase Admin + Web SDK credentials set
- [ ] At least one LLM provider API key configured

---

## API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/set_session` | Verify Firebase ID token and create session |
| GET | `/check_session` | Verify active session |
| POST | `/logout` | Clear session |
| GET | `/firebase-config` | Serve Firebase web client config |

### Database
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/connect_db` | Connect to a database |
| POST | `/api/v1/disconnect_db` | Disconnect from the current database |
| GET | `/api/v1/db_status` | Get current connection status |
| GET | `/api/v1/get_databases` | List available databases on connected server |
| POST | `/api/v1/switch_remote_database` | Switch active database |

### Conversations
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/pass_user_prompt_to_llm` | Send a message to the agent (streaming SSE) |
| GET | `/api/v1/get_conversations` | Get all conversations for current user |
| GET | `/api/v1/get_conversation/{id}` | Get a specific conversation |
| POST | `/api/v1/new_conversation` | Create a new conversation |
| DELETE | `/api/v1/delete_conversation/{id}` | Delete a conversation |

### Queries & Quota
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/run_sql_query` | Execute a raw SQL SELECT query |
| GET | `/api/v1/quota/status` | Get current user's rate limit usage |

---

## Limitations

These are the current known constraints of the platform:

| Limitation | Detail |
|------------|--------|
| **Read-only queries** | The agent can only execute SELECT statements. No INSERT, UPDATE, DELETE, or DDL. |
| **Concurrent LLM cap** | A global semaphore limits the system to 5 simultaneous LLM calls. Additional requests queue with a 60-second timeout. |
| **Per-user rate limits** | Default: 4 requests/min, 100/hr, 500/day. Users who exceed these receive a `429 Too Many Requests` response. |
| **Agent step limit** | Each conversation turn is limited to 25 agent steps (tool calls) before the agent stops. |
| **Query result cap** | Production returns a maximum of 5,000 rows per query to prevent memory exhaustion. |
| **Query timeout** | Queries are cancelled after 15 seconds in production. |
| **No SQLite support** | SQLite is not supported as a connectable database in the current adapter set. |
| **No schema writes** | The platform has no ability to create, alter, or drop tables or columns. |
| **Small-scale deployment** | With default settings, the application comfortably supports 10–30 concurrent active users. Beyond that, LLM queue timeouts may occur. |
| **Remote databases only** | The backend runs on Render's servers and cannot reach a database on your local machine. Your database must be publicly accessible over a network (e.g. a cloud-hosted DB or one with a public host/port). |
| **Cold starts on Render** | On the free Render tier, the backend service spins down after inactivity and takes 30–60 seconds to cold start. |
| **Free-tier LLM reliability** | The deployed version uses free-tier Cerebras and Gemini APIs. Responses may be slow, incomplete, or fail under heavy load. |

---

## Security

- **Read-only query guard** — Only SELECT statements are accepted; all others are rejected before execution
- **Query timeout** — Long-running queries are forcibly cancelled
- **Firebase token verification** — Every authenticated request validates a cryptographic ID token
- **HttpOnly session cookies** — Sessions are not accessible to JavaScript
- **CORS allowlist** — No wildcard origins permitted in staging or production
- **Rate limiting** — Two-layer protection prevents abuse at both per-user and global levels
- **No credentials in responses** — Database connection details are never echoed back to the client

---

## Documentation

- [Rate Limiting Architecture](back-end/docs/RATE_LIMITING.md)
- [Upstash Redis Integration](back-end/docs/upstash-redis-integration.md)

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request against `main`

---

## Acknowledgements

- [LangGraph](https://github.com/langchain-ai/langgraph) — Agent framework and state management
- [FastAPI](https://fastapi.tiangolo.com/) — Backend web framework
- [Firebase](https://firebase.google.com/) — Authentication and Firestore persistence
- [Upstash](https://upstash.com/) — Serverless Redis for sessions and rate limiting
- [Material UI](https://mui.com/) — React component library
- [Vercel](https://vercel.com/) — Frontend hosting
- [Render](https://render.com/) — Backend hosting
