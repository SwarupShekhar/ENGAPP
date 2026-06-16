"""Shared internal API key verification for backend-ai."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any

from fastapi import Header, HTTPException, Request, WebSocket

from app.core.config import settings

PUBLIC_HTTP_PATHS = frozenset(
    {
        "/",
        "/api/health",
        "/health",
        "/metrics",
        "/docs",
        "/openapi.json",
        "/redoc",
    }
)


def _header_api_key(request: Request) -> str | None:
    return request.headers.get("x-api-key") or request.headers.get("X-API-Key")


def is_public_http_path(path: str) -> bool:
    if path in PUBLIC_HTTP_PATHS:
        return True
    if path.startswith("/metrics"):
        return True
    return False


def verify_internal_api_key_header(x_api_key: str | None) -> None:
    """Raise 401 when the caller is not authorized."""
    if settings.environment in ("development", "dev", "local", "test") and (
        settings.internal_api_key == "change-me-in-production"
        and not x_api_key
    ):
        return

    if not x_api_key or not secrets.compare_digest(
        x_api_key, settings.internal_api_key
    ):
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


async def require_internal_api_key(request: Request) -> None:
    if request.method == "OPTIONS":
        return
    if is_public_http_path(request.url.path):
        return
    verify_internal_api_key_header(_header_api_key(request))


def verify_ws_token(token: str | None, session_id: str, user_id: str | None) -> dict[str, Any]:
    if not token:
        raise HTTPException(status_code=401, detail="Missing ws_token")

    parts = token.split(".", 1)
    if len(parts) != 2:
        raise HTTPException(status_code=401, detail="Invalid ws_token")

    payload_b64, sig = parts
    expected = hmac.new(
        settings.internal_api_key.encode("utf-8"),
        payload_b64.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    expected_b64 = base64.urlsafe_b64encode(expected).decode("utf-8").rstrip("=")
    sig_norm = sig.rstrip("=")
    if not secrets.compare_digest(sig_norm, expected_b64):
        raise HTTPException(status_code=401, detail="Invalid ws_token signature")

    pad = "=" * (-len(payload_b64) % 4)
    try:
        payload = json.loads(
            base64.urlsafe_b64decode(payload_b64 + pad).decode("utf-8")
        )
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid ws_token payload") from exc

    exp = int(payload.get("exp", 0))
    if exp < int(time.time()):
        raise HTTPException(status_code=401, detail="ws_token expired")

    if payload.get("sid") != session_id:
        raise HTTPException(status_code=403, detail="ws_token session mismatch")

    if user_id and payload.get("sub") != user_id:
        raise HTTPException(status_code=403, detail="ws_token user mismatch")

    return payload


async def verify_ws_connection(
    websocket: WebSocket, session_id: str
) -> dict[str, Any]:
    token = websocket.query_params.get("ws_token")
    user_id = (websocket.query_params.get("user_id") or "").strip() or None
    return verify_ws_token(token, session_id, user_id)


async def get_current_admin(x_api_key: str = Header(...)):
    verify_internal_api_key_header(x_api_key)
    return True
