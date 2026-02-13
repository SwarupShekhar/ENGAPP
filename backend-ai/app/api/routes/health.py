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
            if cache.redis_client:
                 await cache.redis_client.setex("health_check", 10, "ok")
                 checks["redis"] = "online"
            else:
                 checks["redis"] = "disabled/unavailable"
        except Exception as e:
            from app.core.logging import logger
            logger.error("redis_health_check_failed", error=str(e))
            checks["redis"] = "offline"
            
    return checks
