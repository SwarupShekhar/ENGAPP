#!/usr/bin/env bash
# Deploy internal tester page on appapk.englivo.com (host port 4003).
# APK lives at /opt/engr-apk/app-release.apk on the VPS (existing upload path).
#
# Usage (on VPS as root):
#   cd /opt/engr-app
#   bash scripts/deploy-internal-test-portal.sh [/path/to/app-release.apk]
#
# First form submission: Formsubmit emails a confirmation link to swarup.shekhar@vaidikedu.com — click it once.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/engr-app}"
APK_DIR="/opt/engr-apk"
APK_DEST="$APK_DIR/app-release.apk"
COMPOSE_FILE="$APP_DIR/docker-compose.prod.yml"

cd "$APP_DIR"

mkdir -p "$APK_DIR"

if [[ -n "${1:-}" ]]; then
  if [[ ! -f "$1" ]]; then
    echo "APK not found: $1"
    exit 1
  fi
  cp "$1" "$APK_DEST"
  chmod 644 "$APK_DEST"
  echo "Copied APK → $APK_DEST ($(du -h "$APK_DEST" | cut -f1))"
elif [[ ! -f "$APK_DEST" ]]; then
  echo "No APK at $APK_DEST"
  echo "Upload APK first, e.g.: bash scripts/deploy-internal-test-portal.sh /path/to/app-release.apk"
  exit 1
fi

echo "Starting tester portal on host port 4003…"
docker compose -f "$COMPOSE_FILE" up -d tester-portal

echo
echo "APK: $APK_DEST"
echo "Test on VPS:"
echo "  curl -sI http://127.0.0.1:4003/ | head"
echo "  curl -sI http://127.0.0.1:4003/app-release.apk | head"
echo
echo "Public: https://appapk.englivo.com/ (DNS → VPS :4003)"
