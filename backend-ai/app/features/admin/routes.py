from fastapi import APIRouter, Depends, HTTPException, Header
from app.middleware.rate_limiter import rate_limiter
from app.core.config import settings
import hashlib

router = APIRouter()


async def get_current_admin(x_api_key: str = Header(...)):
    """Admin authentication dependency - validates API key header."""
    if x_api_key != settings.internal_api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return True


@router.get("/metrics", dependencies=[Depends(get_current_admin)])
async def get_system_metrics():
    """
    Monitor system health and concurrency
    """
    # Hash user IDs for privacy-safe logging/metrics
    active_user_count = len(rate_limiter.active_sessions)
    total_concurrent = sum(rate_limiter.active_sessions.values())
    users_at_limit_count = sum(1 for count in rate_limiter.active_sessions.values() if count >= 2)
    
    # Generate anonymized hashes for any user identifiers needed
    hashed_user_ids = [
        hashlib.sha256(uid.encode()).hexdigest()[:16] 
        for uid in rate_limiter.active_sessions.keys()
    ]
    
    return {
        'active_user_count': active_user_count,
        'total_concurrent_connections': total_concurrent,
        'users_at_limit_count': users_at_limit_count,
        'hashed_user_ids': hashed_user_ids[:10] if hashed_user_ids else [],  # Limit for privacy
    }
