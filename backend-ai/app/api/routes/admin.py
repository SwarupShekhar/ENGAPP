from fastapi import APIRouter
from app.middleware.rate_limiter import rate_limiter

router = APIRouter()

@router.get("/metrics")
async def get_system_metrics():
    """
    Monitor system health and concurrency
    """
    return {
        'active_sessions': len(rate_limiter.active_sessions),
        'active_users': list(rate_limiter.active_sessions.keys()),
        'total_concurrent_connections': sum(rate_limiter.active_sessions.values()),
        'users_at_limit': [
            uid for uid, count in rate_limiter.active_sessions.items()
            if count >= 2
        ],
    }
