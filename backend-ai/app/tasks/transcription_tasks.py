from app.tasks.celery_app import celery_app
from app.services.transcription_service import transcription_service
from app.models.request import TranscriptionRequest
from app.core.logging import logger
import asyncio

@celery_app.task(name="app.tasks.transcribe_async")
def transcribe_async(request_data: dict):
    """
    Background task for audio transcription.
    """
    logger.info("background_transcription_started", user_id=request_data.get("user_id"))
    
    # Create request model from dict
    request = TranscriptionRequest(**request_data)
    
    # Run async transcription in sync celery worker
    loop = asyncio.get_event_loop()
    try:
        result = loop.run_until_complete(transcription_service.transcribe(request))
        return result.model_dump()
    except Exception as e:
        logger.error(f"background_transcription_failed: {e}", exc_info=True)
        raise
