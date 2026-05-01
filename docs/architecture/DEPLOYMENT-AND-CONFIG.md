# EngR — Deployment, CI/CD, and environment configuration

**Scope:** What the repository currently defines for CI/CD, ports, and environment variables; how components are expected to be deployed together.

**Sources (verified):**
- `.github/workflows/backend-ci-cd.yml`
- `.github/workflows/mobile-ci-cd.yml`
- `backend-nest/.env.example`
- `backend-nest/src/main.ts` (Swagger at `/api`)
- `backend-ai/app/main.py` (FastAPI app + `/metrics`)

---

## 1. Runtime ports (defaults)

| Component | Default port | Notes |
|----------|--------------|------|
| Nest API (`backend-nest`) | `3000` in code (or `PORT`) | `.env.example` uses `PORT=3002` |
| FastAPI (`backend-ai`) | env `PORT` (commonly `8001`) | must align with Nest `AI_ENGINE_URL` and/or `FASTAPI_SERVICE_URL` |
| FastAPI (alt in Nest) | `FASTAPI_SERVICE_URL` default `http://localhost:8000` | some Nest integration uses this value |
| Redis | `6379` | used by Bull / presence |
| Postgres | `5432` | `DATABASE_URL` / `DIRECT_URL` |

---

## 2. CI/CD (GitHub Actions)

### 2.1 Backend (`backend-nest`) — `.github/workflows/backend-ci-cd.yml`

- Triggers on:
  - push to `main` when `backend-nest/**` changes
  - PRs to `main` affecting `backend-nest/**`
- Steps:
  - Node `22`
  - `npm ci --include=dev`
  - `npm run lint`
- Deploy:
  - If on `main`, triggers Render deploy hook via `secrets.RENDER_DEPLOY_HOOK_URL`

### 2.2 Mobile (`mobile`) — `.github/workflows/mobile-ci-cd.yml`

- Triggers on:
  - push to `main` when `mobile/**` changes
  - PRs to `main` affecting `mobile/**`
- Steps:
  - Node `18`
  - `npm ci`
  - `npm run tsc` (non-blocking in current workflow)
  - `npm run lint` (non-blocking in current workflow)
- Publish:
  - If on `main`, runs `eas update --auto` when `secrets.EXPO_TOKEN` is set

---

## 3. Environment variables (Nest)

`backend-nest/.env.example` documents the expected config set. Highlights:

### 3.1 Core

- `PORT`
- `NODE_ENV`
- `FRONTEND_URL` (CORS origin)

### 3.2 Database

- `DATABASE_URL` (runtime; pooler recommended for Neon)
- `DIRECT_URL` (migrations; non-pooler recommended for Neon)

### 3.3 Redis

- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`

### 3.4 Clerk

- `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`

### 3.5 LiveKit

- `LIVEKIT_URL`, `LIVEKIT_HOST`
- `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- `LIVEKIT_EGRESS_AZURE_CONTAINER`

### 3.6 AI services

- `AI_ENGINE_URL` (used broadly for tutor/transcription/pronunciation)
- `FASTAPI_SERVICE_URL` (used by `FastApiClient` for `/api/transcribe` + `/api/analyze`)

> Recommendation: set both to the same base URL for a single deployed `backend-ai`, or consolidate to one env var in code to avoid divergence.

---

## 4. Observability

| Component | Signal | Endpoint / mechanism |
|----------|--------|----------------------|
| Nest | API docs | Swagger UI at `/api` |
| FastAPI | API docs | `/docs` (non-prod), OpenAPI auto |
| FastAPI | metrics | `/metrics` (Prometheus ASGI mount) |

---

## 5. Scaling considerations (current architecture)

- **Nest**: stateless HTTP + Socket.IO; presence map is in-memory but mirrored into Redis with TTL. Multi-instance requires consistent socket routing (sticky sessions) or using a Socket.IO adapter (e.g., Redis adapter) if you want cross-instance room broadcasts.
- **FastAPI**: AI work is latency-heavy; scale horizontally behind a load balancer. Streaming endpoints (SSE/WS) require connection-aware routing.
- **Queues**: Bull + Redis already present (`sessions` queue). Ensure worker concurrency and retry policies match upstream limits (Azure/Gemini).

