from fastapi import APIRouter
from app.core.config import settings
from app.cache.manager import cache

router = APIRouter()

@router.get("/health")
async def health_check():
    checks = {
        "server": "online",
        "redis": "unknown",
        "azure_speech": "configured" if settings.azure_speech_key else "missing",
        "gemini_ai": "configured" if settings.google_api_key else "missing"
    }
    
    # Check Redis
    if settings.enable_cache:
        try:
            # Simple check
            if cache.redis:
                 await cache.redis.set("health_check", "ok", ttl=10)
                 checks["redis"] = "online"
            else:
                 checks["redis"] = "disabled/unavailable"
        except Exception:
            checks["redis"] = "offline"
            
    return checks
