from app.tasks.celery_app import celery_app
from app.services.analysis_service import analysis_service
from app.models.request import AnalysisRequest
from app.core.logging import logger
import asyncio

@celery_app.task(name="app.tasks.analyze_async")
def analyze_async(request_data: dict):
    """
    Background task for text analysis.
    """
    logger.info("background_analysis_started", user_id=request_data.get("user_id"))
    
    request = AnalysisRequest(**request_data)
    
    loop = asyncio.get_event_loop()
    try:
        result = loop.run_until_complete(analysis_service.analyze(request))
        return result.model_dump()
    except Exception as e:
        logger.error(f"background_analysis_failed: {e}", exc_info=True)
        raise
