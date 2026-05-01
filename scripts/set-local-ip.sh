#!/bin/bash
# Auto-detect LAN IP (macOS Wi-Fi en0; falls back to en1)
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
if [ -z "$IP" ]; then
  echo "Could not detect LAN IP. Set APP_API_URL_OVERRIDE manually in mobile/.env.local"
  exit 1
fi
cat > mobile/.env.local <<EOF
# EngR NestJS — running locally (port 3004, matches backend-nest .env PORT)
APP_API_URL_OVERRIDE=http://${IP}:3004
# Englivo REST — always live
ENGLIVO_API_URL_OVERRIDE=https://englivo.com
# Englivo AI tutor WebSocket — always live
ENGLIVO_WS_URL_OVERRIDE=wss://englivo-ai.onrender.com
# Englivo.com Clerk instance — required for Core API auth
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsuZW5nbGl2by5jb20k
# Bridge API internal secret — matches backend-nest INTERNAL_API_KEY
BRIDGE_INTERNAL_SECRET=swarupshekhar171199
EOF
echo "Written to mobile/.env.local:"
echo "  NestJS (local)    → http://${IP}:3004"
echo "  Englivo REST      → https://englivo.com"
echo "  Englivo WebSocket → wss://englivo-ai.onrender.com"
