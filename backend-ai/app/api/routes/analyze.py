import time
from fastapi import APIRouter, Depends, Request
from app.models.request import AnalysisRequest, JointAnalysisRequest
from app.models.response import AnalysisResponse, StandardResponse, Meta, JointAnalysisResponse
from app.services.analysis_service import analysis_service, AnalysisService
from app.api.deps import get_logger

router = APIRouter()

@router.post("/analyze", response_model=StandardResponse[AnalysisResponse])
async def analyze_text(
    request: Request,
    body: AnalysisRequest,
    service: AnalysisService = Depends(lambda: analysis_service)
):
    log = get_logger(request)
    log.info("endpoint_analyze_started", user_id=body.user_id)
    
    start_time = time.time()
    result = await service.analyze(body)
    
    processing_time_ms = int((time.time() - start_time) * 1000)
    
    return StandardResponse(
        success=True,
        data=result,
        meta=Meta(
            processing_time_ms=processing_time_ms,
            request_id=getattr(request.state, "request_id", None)
        )
    )

@router.post("/analyze-joint", response_model=StandardResponse[JointAnalysisResponse])
async def analyze_joint_text(
    request: Request,
    body: JointAnalysisRequest,
    service: AnalysisService = Depends(lambda: analysis_service)
):
    from app.models.response import JointAnalysisResponse
    log = get_logger(request)
    log.info("endpoint_analyze_joint_started", session_id=body.session_id)
    
    start_time = time.time()
    result = await service.analyze_joint(body)
    
    processing_time_ms = int((time.time() - start_time) * 1000)
    
    return StandardResponse(
        success=True,
        data=result,
        meta=Meta(
            processing_time_ms=processing_time_ms,
            request_id=getattr(request.state, "request_id", None)
        )
    )

