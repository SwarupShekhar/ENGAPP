"""Reads and updates CoachingContext from Redis."""
from __future__ import annotations
import json
import logging
import re
from typing import Any

import redis

from app.core.config import settings

logger = logging.getLogger(__name__)

_redis_client: redis.Redis | None = None


def _get_redis() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=5,
        )
    return _redis_client


def cache_key(user_id: str, session_id: str) -> str:
    return f"coaching:{user_id}:{session_id}"


def get_context(user_id: str, session_id: str) -> dict[str, Any] | None:
    try:
        raw = _get_redis().get(cache_key(user_id, session_id))
        if not raw:
            return None
        return json.loads(raw)
    except Exception as e:
        logger.warning("coaching_context.get_context failed: %s", e)
        return None


def update_context(user_id: str, session_id: str, updates: dict[str, Any]) -> None:
    """Patch specific fields in the context. Fire-and-forget — never raises.

    Upserts when the key is missing so next-turn fields like pendingCoachingHint
    are not silently dropped when Nest has not prebuilt coaching context yet.
    """
    try:
        r = _get_redis()
        key = cache_key(user_id, session_id)
        raw = r.get(key)
        if not raw:
            ctx: dict[str, Any] = {"userId": user_id, "sessionId": session_id}
        else:
            ctx = json.loads(raw)
        ctx.update(updates)
        ttl = r.ttl(key)
        r.set(key, json.dumps(ctx), ex=max(ttl, 60) if ttl and ttl > 0 else 4 * 3600)
    except Exception as e:
        logger.warning("coaching_context.update_context failed: %s", e)


def set_pending_hint_check(
    user_id: str,
    session_id: str,
    phrase: str,
    task_id: str | None,
    mark_field: str | None = None,
) -> None:
    """After a hint fires, store what phrase to watch for in the next segments."""
    # Normalize once so check_and_clear_pending_hint can compare apples-to-apples.
    norm = re.sub(r"[^a-z\s]", "", phrase.lower()).strip()
    update_context(user_id, session_id, {
        "pendingHintCheck": {
            "phrase": norm,
            "taskId": task_id,
            "markField": mark_field,
            "segmentsRemaining": 2,
        }
    })


def check_and_clear_pending_hint(user_id: str, session_id: str, transcript: str) -> dict | None:
    """
    Called on each segment. If a pending hint check exists and the phrase appears
    in the transcript, returns the check dict and clears it. Otherwise decrements
    segmentsRemaining and clears when exhausted.
    """
    try:
        ctx = get_context(user_id, session_id)
        if not ctx:
            return None
        pending = ctx.get("pendingHintCheck")
        if not pending:
            return None

        phrase = pending.get("phrase", "")
        norm_transcript = re.sub(r"[^a-z\s]", "", transcript.lower())

        if phrase and phrase in norm_transcript:  # phrase is already normalized by set_pending_hint_check
            # Hit — clear and return
            update_context(user_id, session_id, {"pendingHintCheck": None})
            return pending

        # Miss — decrement
        remaining = pending.get("segmentsRemaining", 1) - 1
        if remaining <= 0:
            update_context(user_id, session_id, {"pendingHintCheck": None})
        else:
            update_context(user_id, session_id, {
                "pendingHintCheck": {**pending, "segmentsRemaining": remaining}
            })
        return None
    except Exception as e:
        logger.warning("check_and_clear_pending_hint failed: %s", e)
        return None
