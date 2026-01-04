# Moonlit

> **Web-based Agentic AI Platform** for autonomous database operations on local and remote relational databases.

![Python](https://img.shields.io/badge/Python-3.11+-blue?logo=python&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)
---

## Overview

Moonlit is an **agentic AI platform** that empowers database users to work with relational databases through natural language. Unlike simple chatbots, Moonlit operates as an **autonomous agent** that:

1. **Reasons** about your request and database context
2. **Plans** multi-step workflows to accomplish complex tasks
3. **Executes** tool calls (schema introspection, query execution, constraint analysis)
4. **Iterates** based on results until the task is complete

### What Makes It Agentic?

| Traditional Assistant | Moonlit Agent |
|----------------------|----------------|
| Single-turn responses | Multi-turn reasoning loops |
| User drives every step | Agent autonomously orchestrates tools |
| Static prompt/response | Dynamic tool selection based on context |
| Manual SQL writing | Agent writes, validates, executes SQL |

### Capabilities

- **Autonomous Query Generation** — Describe what you need; agent figures out the SQL
- **Schema Discovery** — Agent explores tables, columns, relationships, constraints
- **Multi-Database Support** — PostgreSQL, MySQL, SQLite, Oracle, SQL Server (local & remote)
- **Result Visualization** — Charts, diagrams, and formatted tables
- **Conversation History** — Chat threads stored in Firestore, accessible across sessions
- **Rate Limiting** — Per-user quotas and global API rate limiting

---

## Architecture

```
moonlit/
├── back-end/                   # FastAPI server
│   ├── api/                    # REST routes and request schemas
│   │   └── routes/             # Domain-specific routers
│   ├── auth/                   # Firebase authentication
│   ├── database/               # Connection management & adapters
│   │   └── adapters/           # DBMS-specific adapters
│   ├── services/               # Business logic
│   │   ├── llm/                # LLM orchestration & tools
│   │   └── rate_limiting/      # Global LLM & per-user quota
│   ├── main.py                 # Application entry point
│   └── config.py               # Environment-based configuration
│
└── front-end/                  # React SPA (Vite)
    └── src/
        ├── api/                # Centralized API layer
        ├── components/         # UI components
        ├── contexts/           # React contexts (Auth, Database, Theme)
        ├── pages/              # Route pages (Chat, Auth, Landing)
        └── hooks/              # Custom React hooks
```

---

## Features

### Backend
| Feature | Description |
|---------|-------------|
| **FastAPI** | Async Python framework with automatic OpenAPI docs |
| **Multi-Database Support** | PostgreSQL, MySQL, SQLite, Oracle, SQL Server via adapter pattern |
| **Connection Pooling** | Thread-safe singleton manager with automatic cleanup |
| **LLM Integration** | Cerebras SDK with multi-key load balancing |
| **AI Tools** | Schema introspection, query execution, constraint analysis |
| **Authentication** | Firebase Admin SDK with ID token verification |
| **Session Storage** | Redis (Upstash) for persistent sessions |
| **Rate Limiting** | Two-layer: per-user quotas (Redis) + global LLM limiter |
| **Query Security** | Read-only guard, result limits, timeout protection |

### Frontend
| Feature | Description |
|---------|-------------|
| **Material UI** | Modern component library with custom theming |
| **Monaco Editor** | Full-featured SQL editor with syntax highlighting |
| **Markdown Rendering** | AI responses with code blocks, tables, mermaid diagrams |
| **Chart Visualization** | Chart.js integration for data visualization |
| **Quota Display** | Real-time rate limit indicator with polling |
| **Conversation History** | Persistent chat threads with Firestore |
| **Starfield Animation** | Ambient background effect when user is idle |
| **Dark/Light Themes** | User-selectable appearance modes |

---

## Prerequisites

- **Python 3.11+**
- **Node.js 18+**
- **Redis** (Upstash for production)
- **Firebase Project** (for authentication)
- **Cerebras API Key(s)** (for LLM)

---

## Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd moonlit
```

### 2. Backend Setup

```bash
cd back-end

# Install dependencies
pip install pipenv
pipenv install

# Configure environment
cp .env.example .env  # Edit with your credentials

# Run development server
pipenv run uvicorn main:app --host 0.0.0.0 --port 5000 --reload
```

### 3. Frontend Setup

```bash
cd front-end

# Install dependencies
npm install

# Run development server
npm run dev
```

### 4. Access Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5000
- **API Docs**: http://localhost:5000/docs (development only)

---

## Configuration

### Environment Variables

Create a `.env` file in `back-end/`:

```env
# Application
APP_ENV=development  # development, staging, production, testing
SECRET_KEY=your-secure-secret-key

# LLM (Cerebras) - Multi-key support
LLM_API_KEYS=key1,key2  # Comma-separated for load balancing
LLM_MODEL=gpt-oss-120b

# Rate Limiting
LLM_RATELIMIT_ENABLED=true
LLM_MAX_RPM_PER_KEY=25
LLM_MAX_CONCURRENT=5
USER_QUOTA_ENABLED=true
USER_QUOTA_PER_MINUTE=4
USER_QUOTA_PER_HOUR=100
USER_QUOTA_PER_DAY=500

# Firebase Admin SDK
FIREBASE_TYPE=service_account
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY_ID=your-key-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
FIREBASE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=123456789

# Firebase Web SDK
FIREBASE_WEB_API_KEY=your-web-api-key
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com

# Redis (Upstash)
UPSTASH_REDIS_URL=redis://default:PASSWORD@HOST:6379

# CORS
CORS_ORIGINS=http://localhost:5173
```

---

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/set_session` | Verify Firebase token, create session |
| GET | `/check_session` | Check session status |
| POST | `/logout` | Clear user session |
| GET | `/firebase-config` | Get Firebase web config |

### Database Operations
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/connect_db` | Connect to database |
| POST | `/api/v1/disconnect_db` | Disconnect from database |
| GET | `/api/v1/db_status` | Get connection status |
| GET | `/api/v1/get_databases` | List available databases |
| POST | `/api/v1/switch_remote_database` | Switch to different database |

### Conversations
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/pass_user_prompt_to_llm` | Send message to AI (streaming) |
| GET | `/api/v1/get_conversations` | Get user's conversations |
| GET | `/api/v1/get_conversation/{id}` | Get specific conversation |
| POST | `/api/v1/new_conversation` | Create new conversation |
| DELETE | `/api/v1/delete_conversation/{id}` | Delete conversation |

### Queries
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/run_sql_query` | Execute SQL query |

### Quota
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/quota/status` | Get user's rate limit status |

---

## Rate Limiting

Moonlit implements a **two-layer rate limiting** strategy:

### Layer 1: Per-User Quota (Redis)
- Tracks individual user requests across minute/hour/day
- Configurable limits (default: 4/min, 100/hr, 500/day)
- Automatic TTL expiration

### Layer 2: Global LLM Limiter (Memory)
- Multi-key Cerebras API load balancing
- Round-robin key selection
- Per-key RPM tracking
- Semaphore-based concurrency control

See [RATE_LIMITING.md](back-end/docs/RATE_LIMITING.md) for details.

---

## AI Tools

The LLM can invoke these tools during conversations:

| Tool | Description |
|------|-------------|
| `get_connection_status` | Check database connection state |
| `get_database_list` | List available databases |
| `get_database_schema` | Get tables and columns |
| `get_table_schema` | Get detailed table structure |
| `execute_query` | Run SELECT queries safely |
| `get_recent_queries` | User's query history |
| `get_table_indexes` | Table index information |
| `get_table_constraints` | PRIMARY/FOREIGN/UNIQUE/CHECK constraints |
| `get_foreign_keys` | Foreign key relationships |

---

## Development

### Backend

```bash
cd back-end

# Run with hot reload
pipenv run uvicorn main:app --host 0.0.0.0 --port 5000 --reload

# Lint code
pipenv run ruff check .

# Fix lint issues
pipenv run ruff check . --fix
```

### Frontend

```bash
cd front-end

# Development server
npm run dev

# Lint code
npm run lint

# Production build
npm run build
```

---

## Production Deployment

### Backend (Uvicorn)

```bash
cd back-end
pipenv run uvicorn main:app --host 0.0.0.0 --port 5000 --workers 4
```

### Frontend (Vite Build)

```bash
cd front-end
npm run build
# Deploy dist/ to static hosting (Vercel, Netlify, etc.)
```

### Production Checklist

- Set `APP_ENV=production`
- Use strong `SECRET_KEY` (32+ characters)
- Configure `CORS_ORIGINS` explicitly
- Enable rate limiting (`LLM_RATELIMIT_ENABLED=true`, `USER_QUOTA_ENABLED=true`)
- Set `UPSTASH_REDIS_URL` for sessions and quota

---

## Security

- **Read-only Query Guard**: Only SELECT statements allowed
- **Query Timeout**: Configurable execution limits
- **Result Limits**: Prevents excessive data retrieval
- **Firebase Token Verification**: Cryptographic auth validation
- **Rate Limiting**: Per-user quotas + global API limits
- **CORS**: Explicit origin allowlist in production

---

## Tech Stack

### Backend
- **Framework**: FastAPI 0.115+
- **LLM SDK**: Cerebras Cloud SDK 1.59+
- **Auth**: Firebase Admin SDK 6.9+
- **Databases**: psycopg2-binary, mysql-connector-python, sqlite3, oracledb, pyodbc
- **Session/Quota**: Redis (Upstash) via redis-py
- **Rate Limiting**: Custom (slowapi for HTTP, custom for LLM)
- **ASGI Server**: Uvicorn

### Frontend
- **Build Tool**: Vite 7
- **Framework**: React 19
- **UI Library**: Material UI 7
- **Editor**: Monaco Editor
- **Diagrams**: Mermaid
- **Charts**: Chart.js
- **Auth**: Firebase SDK
- **Markdown**: react-markdown + remark-gfm

---

## Documentation

- [Rate Limiting Architecture](back-end/docs/RATE_LIMITING.md)
- [Upstash Redis Integration](back-end/docs/upstash-redis-integration.md)

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## Acknowledgments

- [Cerebras](https://cerebras.ai/) for LLM inference
- [FastAPI](https://fastapi.tiangolo.com/) for backend framework
- [Firebase](https://firebase.google.com/) for authentication & Firestore
- [Upstash](https://upstash.com/) for serverless Redis
- [Material UI](https://mui.com/) for React components
