from fastapi import APIRouter, Request, BackgroundTasks
from typing import List
from app.models.request import AnalysisRequest
from app.models.response import StandardResponse, Meta
from app.tasks.batch_tasks import analyze_batch
from app.core.logging import logger

router = APIRouter()

@router.post("/batch/analyze", response_model=StandardResponse[str])
async def batch_analyze(
    request: Request,
    requests: List[AnalysisRequest]
):
    """
    Submit a batch of texts for asynchronous analysis.
    Returns a task ID that can be used to poll for results.
    """
    log = logger.bind(request_id=getattr(request.state, "request_id", None))
    log.info("batch_analysis_requested", count=len(requests))
    
    # Convert models to dicts for Celery
    request_dicts = [req.model_dump() for req in requests]
    
    task_id = analyze_batch.delay(request_dicts)
    
    return StandardResponse(
        success=True,
        data=str(task_id),
        meta=Meta(
            request_id=request.state.request_id
        )
    )

@router.get("/batch/status/{task_id}")
async def get_batch_status(task_id: str):
    """
    Check the status of a batch task.
    """
    from app.tasks.celery_app import celery_app
    res = celery_app.AsyncResult(task_id)
    return {
        "task_id": task_id,
        "status": res.status,
        "ready": res.ready(),
        "result": res.result if res.ready() else None
    }
