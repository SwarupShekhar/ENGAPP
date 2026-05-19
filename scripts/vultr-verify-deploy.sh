#!/usr/bin/env bash
# Verify Vultr production is running the latest backend (Pulse Practice SR routes).
# Usage:
#   ./scripts/vultr-verify-deploy.sh
#   API_BASE=https://api.englivo.com ./scripts/vultr-verify-deploy.sh

set -euo pipefail

API_BASE="${API_BASE:-https://api.englivo.com}"

echo "==> Health"
curl -fsS "$API_BASE/health" | head -c 400
echo ""
echo ""

echo "==> Route probe (new SR endpoints should NOT be 404)"
for path in /tasks/daily /tasks/due /tasks/mastered-count; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" "$API_BASE$path" || true)
  echo "  $path -> HTTP $code"
done
echo ""
echo "Interpretation:"
echo "  /tasks/daily -> 401 means Nest is up and route exists (auth required)."
echo "  /tasks/due   -> 401 means NEW code deployed. 404 means OLD container still running."
echo "  /tasks/mastered-count -> same as /tasks/due"
echo ""
echo "==> Optional: on the Vultr server (SSH)"
echo "  cd /opt/engr-app && git log -1 --oneline"
echo "  docker compose -f docker-compose.prod.yml ps"
echo "  docker compose -f docker-compose.prod.yml images"
