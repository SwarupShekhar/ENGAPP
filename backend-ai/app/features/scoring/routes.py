import time
from fastapi import APIRouter, Depends, Query, Request
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

from app.features.scoring.service import call_quality_service
from app.api.deps import get_logger

router = APIRouter(prefix="/scoring", tags=["Scoring"])

class CQSRequest(BaseModel):
    user_turns: List[str]
    full_transcript: str
    azure_results: List[Dict[str, Any]]
    call_duration_seconds: float
    user_spoke_seconds: float

class CQSResponse(BaseModel):
    cqs: float
    breakdown: Dict[str, float]

class PreviewRequest(BaseModel):
    user_turns_so_far: List[str]

@router.post("/cqs", response_model=CQSResponse)
async def compute_cqs(
    request: Request,
    body: CQSRequest
):
    log = get_logger(request)
    log.info("compute_cqs_started")
    start_time = time.time()

    pqs = call_quality_service.compute_pronunciation_quality_score(body.azure_results)
    ds = call_quality_service.compute_depth_score(body.user_turns)
    cs = call_quality_service.compute_complexity_score(body.full_transcript)
    es = call_quality_service.compute_engagement_score(
        body.user_turns, 
        body.call_duration_seconds, 
        body.user_spoke_seconds
    )
    
    cqs = call_quality_service.compute_call_quality_score(pqs, ds, cs, es)

    return CQSResponse(
        cqs=cqs,
        breakdown={
            "pqs": pqs,
            "ds": ds,
            "cs": cs,
            "es": es
        }
    )

@router.post("/preview")
async def compute_preview(
    request: Request,
    body: PreviewRequest
):
    log = get_logger(request)
    log.info("compute_preview_started")
    
    preview_data = call_quality_service.compute_realtime_preview(body.user_turns_so_far)
    return preview_data
