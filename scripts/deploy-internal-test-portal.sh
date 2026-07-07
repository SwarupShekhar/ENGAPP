#!/usr/bin/env bash
# Deploy internal tester page for appapk.englivo.com (existing host service on :4003).
# Copies index.html into /opt/engr-apk next to app-release.apk — does NOT bind port 4003.
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
PORTAL_HTML="$APP_DIR/config/internal-test-portal/index.html"

cd "$APP_DIR"

if [[ ! -f "$PORTAL_HTML" ]]; then
  echo "Missing portal page: $PORTAL_HTML"
  exit 1
fi

mkdir -p "$APK_DIR"
cp "$PORTAL_HTML" "$APK_DIR/index.html"
chmod 644 "$APK_DIR/index.html"
echo "Deployed portal → $APK_DIR/index.html"

if [[ -n "${1:-}" ]]; then
  if [[ ! -f "$1" ]]; then
    echo "APK not found: $1"
    exit 1
  fi
  cp "$1" "$APK_DEST"
  chmod 644 "$APK_DEST"
  echo "Copied APK → $APK_DEST ($(du -h "$APK_DEST" | cut -f1))"
elif [[ -f "$APK_DEST" ]]; then
  echo "APK unchanged: $APK_DEST ($(du -h "$APK_DEST" | cut -f1))"
else
  echo "Warning: no APK at $APK_DEST — download button will show 'not uploaded' until you add one."
fi

echo
echo "Test on VPS (existing :4003 static server):"
echo "  curl -sI http://127.0.0.1:4003/ | head"
echo "  curl -sI http://127.0.0.1:4003/app-release.apk | head"
echo
echo "Public: https://appapk.englivo.com/"
