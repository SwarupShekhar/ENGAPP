from fastapi import APIRouter
from app.core.config import settings
from app.cache.manager import cache

router = APIRouter()


def _spacy_model_status() -> str:
    """Grammar scoring requires en_core_web_sm; missing model falls back to score 60."""
    try:
        from app.features.scoring.service import nlp
        return "loaded" if nlp is not None else "missing"
    except Exception:
        return "error"


def _maya_runtime_checks() -> dict:
    """Non-secret Maya path flags — use to verify fast path is live after deploy."""
    deepgram_key = bool((settings.deepgram_api_key or "").strip())
    cerebras_key = bool((settings.cerebras_api_key or "").strip())
    deepgram_primary = bool(settings.deepgram_primary_stt) and deepgram_key
    return {
        "deepgram_key": "configured" if deepgram_key else "missing",
        "cerebras_key": "configured" if cerebras_key else "missing",
        "deepgram_primary_stt_flag": bool(settings.deepgram_primary_stt),
        "stt_primary": "deepgram" if deepgram_primary else "azure",
        "maya_llm_provider": (settings.maya_llm_provider or "auto"),
        "text_llm_expected": (
            "cerebras" if cerebras_key and (settings.maya_llm_provider or "auto") in ("auto", "cerebras")
            else "gemini"
        ),
        "coaching_hint_budget_ms": int(settings.coaching_hint_budget_ms or 0),
        "coaching_next_turn_only": True,
    }


def _grammar_grader_status() -> dict:
    """Grammar grader mode + live fallback rate (silent revert to blind heuristic)."""
    try:
        from app.features.scoring import grammar_metrics

        snap = grammar_metrics.snapshot()
        snap["mode"] = "llm" if settings.grammar_llm_enabled else "structural_only"
        snap["provider_pref"] = settings.grammar_llm_provider
        return snap
    except Exception:
        return {"error": "unavailable"}


@router.get("/health")
async def health_check():
    checks = {
        "server": "online",
        "redis": "unknown",
        "azure_speech": "configured" if settings.azure_speech_key else "missing",
        "gemini_ai": "configured" if settings.google_api_key else "missing",
        "spacy_model": _spacy_model_status(),
        "grammar_grader": _grammar_grader_status(),
        "maya": _maya_runtime_checks(),
    }
    
    # Check Redis
    if settings.enable_cache:
        try:
            if cache.redis_client is None:
                checks["redis"] = "disabled/unavailable"
                return checks

            # Ping + simple write with expiry
            await cache.redis_client.ping()
            await cache.redis_client.set("health_check", "ok", ex=10)
            checks["redis"] = "online"
        except Exception:
            checks["redis"] = "offline"
            
    return checks
