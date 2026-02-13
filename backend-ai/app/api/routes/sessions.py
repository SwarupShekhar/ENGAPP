from fastapi import APIRouter, Request, Query
from typing import List, Optional
from app.models.response import StandardResponse, Meta
from app.services.aggregation_service import aggregation_service
from app.core.logging import logger

router = APIRouter()

@router.get("/sessions/{user_id}/progress", response_model=StandardResponse[dict])
async def get_user_progress(
    request: Request,
    user_id: str,
    limit: int = Query(10, ge=1, le=100)
):
    """
    Get aggregated progress analytics for a user.
    """
    log = logger.bind(request_id=getattr(request.state, "request_id", None))
    log.info("user_progress_requested", user_id=user_id)
    
    # Placeholder: In a real app, we'd fetch historical session data from DB/Redis
    # For now, we use the aggregation service with empty/mock data
    mock_sessions = [] 
    
    result = await aggregation_service.analyze_user_progress(user_id, mock_sessions)
    
    return StandardResponse(
        success=True,
        data=result,
        meta=Meta(
            request_id=request.state.request_id
        )
    )
