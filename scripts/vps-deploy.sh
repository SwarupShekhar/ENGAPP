#!/usr/bin/env bash
# Deploy EngR backends on Vultr (safe ports 4000–5000 only).
# Run on the server:  cd /opt/engr-app && bash scripts/vps-deploy.sh
#
# Never use bare `docker compose up` from backend-nest/ or backend-ai/ subfolders.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/engr-app}"
COMPOSE=(docker compose -f docker-compose.prod.yml)

cd "$APP_DIR"

echo "==> Stopping any broken/default stacks"
docker compose down --remove-orphans 2>/dev/null || true
"${COMPOSE[@]}" down --remove-orphans 2>/dev/null || true

echo "==> Building backend-nest and backend-ai"
"${COMPOSE[@]}" build backend-nest backend-ai

echo "==> Applying database migrations"
"${COMPOSE[@]}" run --rm --no-deps backend-nest npx prisma migrate deploy

echo "==> Starting backends"
"${COMPOSE[@]}" up -d --no-deps --remove-orphans backend-nest backend-ai

echo "==> Waiting for AI health on host :4010 (up to 180s)..."
ai_ok=0
for i in $(seq 1 36); do
  if curl -fsS http://127.0.0.1:4010/api/health >/dev/null 2>&1; then
    ai_ok=1
    break
  fi
  sleep 5
done
if [ "$ai_ok" -ne 1 ]; then
  echo "ERROR: backend-ai not healthy on :4010"
  "${COMPOSE[@]}" logs backend-ai --tail 80
  exit 1
fi
echo "    AI OK"

echo "==> Waiting for Nest health on host :4001 (up to 120s)..."
nest_ok=0
for i in $(seq 1 24); do
  if curl -fsS http://127.0.0.1:4001/health >/dev/null 2>&1; then
    nest_ok=1
    break
  fi
  sleep 5
done
if [ "$nest_ok" -ne 1 ]; then
  echo "Restarting backend-nest (AI may have been slow to warm)..."
  "${COMPOSE[@]}" restart backend-nest
  sleep 20
  curl -fsS http://127.0.0.1:4001/health >/dev/null 2>&1 || {
    echo "ERROR: backend-nest not healthy on :4001"
    "${COMPOSE[@]}" logs backend-nest --tail 80
    exit 1
  }
fi
echo "    Nest OK"

echo "==> Starting caddy + prometheus"
"${COMPOSE[@]}" up -d caddy prometheus 2>/dev/null || true

echo "==> Health summary"
curl -s http://127.0.0.1:4010/api/health | head -c 200
echo ""
curl -s http://127.0.0.1:4001/health | head -c 200
echo ""
"${COMPOSE[@]}" ps
