#!/usr/bin/env bash
# One-shot Vultr server bootstrap for the EngR app.
# Run as root on a fresh Ubuntu 24.04/25.10 server:
#   curl -fsSL https://raw.githubusercontent.com/<org>/<repo>/main/scripts/vultr-bootstrap.sh | bash -s -- <git-repo-url>
# Or copy + execute:
#   bash scripts/vultr-bootstrap.sh <git-repo-url>

set -euo pipefail

REPO_URL="${1:-}"
APP_DIR="/opt/engr-app"

if [[ -z "$REPO_URL" ]]; then
  echo "Usage: bash vultr-bootstrap.sh <git-repo-url>"
  exit 1
fi

echo "==> Updating apt and installing base packages"
apt-get update -y
apt-get install -y --no-install-recommends \
  ca-certificates curl git ufw

echo "==> Installing Docker (if missing)"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

echo "==> Verifying Docker Compose plugin"
docker --version
docker compose version

echo "==> Cloning repository to $APP_DIR (if missing)"
if [[ ! -d "$APP_DIR/.git" ]]; then
  mkdir -p "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"
git fetch origin main
git checkout main
git pull --ff-only origin main

echo "==> Ensuring server .env files exist (DO NOT commit these!)"
[[ -f backend-nest/.env ]] || cp backend-nest/.env.example backend-nest/.env
[[ -f backend-ai/.env ]]   || cp backend-ai/.env.example   backend-ai/.env

echo "    -> backend-nest/.env"
echo "    -> backend-ai/.env"
echo "    Edit them with real production values before continuing."

echo "==> Configuring firewall (allow SSH, HTTP, HTTPS)"
if command -v ufw >/dev/null 2>&1; then
  ufw allow 22/tcp || true
  ufw allow 80/tcp || true
  ufw allow 443/tcp || true
  ufw --force enable || true
fi

echo "==> Installing systemd unit for auto-start"
install -m 644 config/systemd/engr-app.service /etc/systemd/system/engr-app.service
systemctl daemon-reload
systemctl enable engr-app

echo "==> Initial build & start"
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps

echo
echo "Done. Next steps:"
echo "  1. Edit backend-nest/.env and backend-ai/.env with real secrets"
echo "  2. Edit config/caddy/Caddyfile and set your real domain"
echo "  3. Re-run: docker compose -f docker-compose.prod.yml up -d --build"
echo "  4. Verify: curl -s http://localhost/health"
