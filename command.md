# Moonlit Command Reference

Run commands from the directory shown in each section. Keep secrets and database connection
strings in `back-end/.env`; never paste them into this file or commit them.

## Quick start

Use three terminals after completing the one-time setup below.

### Terminal 1 — local services

From the repository root:

```bash
cd ~/Desktop/Moonlit-AI-Agent
sudo systemctl start docker
sudo docker start moonlit-qdrant moonlit-redis
sudo docker ps --filter name=moonlit-qdrant --filter name=moonlit-redis
```

If either container does not exist yet, create it using the Docker commands in the relevant
section below.

### Terminal 2 — backend

```bash
cd ~/Desktop/Moonlit-AI-Agent/back-end
uv sync --locked
APP_ENV=development uv run --locked python main.py
```

Backend: [http://localhost:5000](http://localhost:5000)
Swagger UI in development: [http://localhost:5000/docs](http://localhost:5000/docs)

### Terminal 3 — frontend

```bash
cd ~/Desktop/Moonlit-AI-Agent/front-end
npm ci
npm run dev
```

Frontend: [http://localhost:5173](http://localhost:5173)

Press `Ctrl+C` in the backend and frontend terminals to stop their development servers.

## One-time setup

### Install the project-pinned uv version

```bash
curl -LsSf https://astral.sh/uv/0.12.5/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
hash -r
uv --version
```

The expected uv version is `0.12.5`. The installer normally updates the shell profile; open a new
terminal if `uv` is unavailable in a later shell.

### Install project dependencies

```bash
cd ~/Desktop/Moonlit-AI-Agent/back-end
uv sync --locked

cd ~/Desktop/Moonlit-AI-Agent/front-end
npm ci
```

`uv` owns `back-end/.venv`; it does not require manual activation. `npm ci` installs the exact
frontend dependency graph from `package-lock.json`.

## Docker

The commands use `sudo` because the current user does not have permission to access the Docker
socket directly.

### Docker daemon lifecycle

Docker must be running before Qdrant, Redis, or any other container can start.

```bash
# Check whether Docker is running
sudo systemctl status docker

# Start Docker for the current session
sudo systemctl start docker

# Start Docker now and automatically after future system boots
sudo systemctl enable --now docker

# Restart the Docker daemon
sudo systemctl restart docker

# Stop the Docker daemon
sudo systemctl stop docker
```

Enabling Docker at boot once is the most convenient development setup. Day to day, start and stop
the individual Qdrant and Redis containers. Stopping or restarting the Docker daemon affects every
container running on the machine.

### General inspection

```bash
sudo docker version
sudo docker ps
sudo docker ps -a
sudo docker stats
```

### Qdrant

Create and start Qdrant for the first time:

```bash
sudo docker run -d \
  --name moonlit-qdrant \
  --restart unless-stopped \
  -p 6333:6333 \
  -p 6334:6334 \
  -v moonlit-qdrant-storage:/qdrant/storage \
  qdrant/qdrant:latest
```

Common lifecycle and diagnostic commands:

```bash
sudo docker start moonlit-qdrant
sudo docker stop moonlit-qdrant
sudo docker restart moonlit-qdrant
sudo docker logs --tail 100 moonlit-qdrant
sudo docker logs -f moonlit-qdrant
sudo docker inspect moonlit-qdrant
curl --fail http://localhost:6333/readyz
```

clearQdrant dashboard: [http://localhost:6333/dashboard](http://localhost:6333/dashboard)

Backend development settings should include:

```dotenv
VAMP_MEMORY_ENABLED=True
VAMP_QDRANT_URL=http://localhost:6333
```

For a reproducible production deployment, replace `latest` with a reviewed image tag or digest.

### Redis Stack

Create and start Redis Stack for the first time:

```bash
sudo docker run -d \
  --name moonlit-redis \
  --restart unless-stopped \
  -p 6379:6379 \
  -p 8001:8001 \
  -v moonlit-redis-data:/data \
  redis/redis-stack:latest
```

Common lifecycle and diagnostic commands:

```bash
sudo docker start moonlit-redis
sudo docker stop moonlit-redis
sudo docker restart moonlit-redis
sudo docker logs --tail 100 moonlit-redis
sudo docker logs -f moonlit-redis
sudo docker exec moonlit-redis redis-cli ping
sudo docker inspect moonlit-redis
```

RedisInsight: [http://localhost:8001](http://localhost:8001)

Backend development settings should include:

```dotenv
REDIS_URL=redis://localhost:6379
RATELIMIT_STORAGE_URL=redis://localhost:6379
```

For a reproducible production deployment, replace `latest` with a reviewed image tag or digest.

### Stop or start all local containers

```bash
sudo docker stop moonlit-qdrant moonlit-redis
sudo docker start moonlit-qdrant moonlit-redis
```

The following cleanup commands delete the containers but retain their named data volumes:

```bash
sudo docker rm -f moonlit-qdrant
sudo docker rm -f moonlit-redis
```

Do not remove `moonlit-qdrant-storage` or `moonlit-redis-data` unless permanent local data loss is
intentional.

## Backend

Run all commands in `back-end/`:

```bash
cd ~/Desktop/Moonlit-AI-Agent/back-end
```

### Synchronize dependencies

```bash
uv sync --locked
uv lock --check
uv pip check
```

### Start the development server

Recommended command:

```bash
APP_ENV=development uv run --locked python main.py
```

Equivalent explicit Uvicorn command:

```bash
APP_ENV=development uv run --locked uvicorn main:app \
  --reload \
  --host 0.0.0.0 \
  --port 5000
```

### Run backend validation

```bash
uv run --locked pytest
uv run --locked ruff check .
uv run --locked ruff format --check .
uv run --locked mypy .
uv run --locked pip-audit
```

Run a specific test module:

```bash
uv run --locked pytest tests/test_dependency_management.py -q
```

### Update a dependency deliberately

```bash
uv lock --upgrade-package <package-name>
uv lock --check
uv sync --locked
uv run --locked pytest
uv run --locked pip-audit
```

Review both `pyproject.toml` and `uv.lock` before committing an upgrade. Do not use an unguarded
`uv sync` in CI or production.

### Start the production server

```bash
uv sync --locked --no-dev --no-build
APP_ENV=production uv run --locked --no-dev --no-build gunicorn main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:5000
```

Production also requires production-safe Firebase, Redis, rate-limit, CORS, Bedrock, Qdrant,
secret-management, TLS, and proxy settings. Do not treat the development `.env` as a production
configuration.

## Frontend

Run all commands in `front-end/`:

```bash
cd ~/Desktop/Moonlit-AI-Agent/front-end
```

### Install and start

```bash
npm ci
npm run dev
```

The Vite development server listens on port `5173` and proxies backend requests to port `5000`.

### Biome

Check formatting, lint rules, and import organization without changing files:

```bash
npm run biome
```

Apply Biome formatting and safe fixes:

```bash
npm run biome:fix
git diff --check
git diff
```

Check or fix only a target path:

```bash
npm exec -- biome check src
npm exec -- biome check --write src
```

`npm run biome:fix` and `biome check --write` modify files. Always review the resulting diff.

### Other frontend validation

```bash
npm run lint
npm run knip
npm run biome
npm run build
```

Apply ESLint fixes:

```bash
npm run lint:fix
git diff --check
git diff
```

Run the JavaScript test modules discovered under `src/`:

```bash
node --test $(find src -name '*.test.js' -print)
```

Build and preview the production bundle:

```bash
npm run build
npm run preview
```

Vite preview normally uses [http://localhost:4173](http://localhost:4173).

## Troubleshooting

### `uv: command not found`

```bash
export PATH="$HOME/.local/bin:$PATH"
hash -r
uv --version
```

If uv is not installed, use the pinned installer in the one-time setup section.

### Docker reports that a container name is already in use

Do not run `docker run` again. Inspect and start the existing container:

```bash
sudo docker ps -a --filter name=moonlit-qdrant --filter name=moonlit-redis
sudo docker start moonlit-qdrant moonlit-redis
```

### Backend reports that Qdrant is unavailable

```bash
sudo docker ps --filter name=moonlit-qdrant
sudo docker logs --tail 100 moonlit-qdrant
curl --fail http://localhost:6333/readyz
```

Confirm that `back-end/.env` contains `VAMP_QDRANT_URL=http://localhost:6333`.

### Backend cannot connect to Redis

```bash
sudo docker ps --filter name=moonlit-redis
sudo docker logs --tail 100 moonlit-redis
sudo docker exec moonlit-redis redis-cli ping
```

The Redis command should return `PONG`.

### A local port is already in use

```bash
sudo ss -ltnp | grep -E ':(5000|5173|6333|6334|6379|8001)\b'
```

Stop the conflicting process or container; do not start a second copy on the same port.
