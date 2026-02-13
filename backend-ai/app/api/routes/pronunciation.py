import time
from fastapi import APIRouter, Depends, Request
from app.models.request import PronunciationRequest
from app.models.response import PronunciationResponse, StandardResponse, Meta
from app.services.pronunciation_service import pronunciation_service, PronunciationService
from app.api.deps import get_logger

router = APIRouter()

@router.post("/pronunciation", response_model=StandardResponse[PronunciationResponse])
async def assess_pronunciation(
    request: Request,
    body: PronunciationRequest,
    service: PronunciationService = Depends(lambda: pronunciation_service)
):
    log = get_logger(request)
    log.info("endpoint_pronunciation_started", user_id=body.user_id)
    
    start_time = time.time()
    result = await service.assess(body)
    
    processing_time_ms = int((time.time() - start_time) * 1000)
    
    return StandardResponse(
        success=True,
        data=result,
        meta=Meta(
            processing_time_ms=processing_time_ms,
            request_id=getattr(request.state, "request_id", None)
        )
    )
