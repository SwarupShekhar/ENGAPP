import time
from fastapi import APIRouter, Depends, Request
from app.models.request import TranscriptionRequest
from app.models.response import TranscriptionResponse, StandardResponse, Meta
from app.features.transcription.service import transcription_service, TranscriptionService
from app.api.deps import get_logger

router = APIRouter()

@router.post("/transcribe", response_model=StandardResponse[TranscriptionResponse])
async def transcribe_audio(
    request: Request,
    body: TranscriptionRequest,
    service: TranscriptionService = Depends(lambda: transcription_service)
):
    log = get_logger(request)
    try:
        log.debug("endpoint_transcribe_started", 
                  has_audio_url=bool(body.audio_url), 
                  has_base64=bool(body.audio_base64),
                  base64_length=len(body.audio_base64) if body.audio_base64 else 0)
        
        start_time = time.time()
        result = await service.transcribe(body)
        log.debug("endpoint_transcribe_completed", duration_ms=int((time.time() - start_time) * 1000))
        
        processing_time_ms = int((time.time() - start_time) * 1000)
        
        return StandardResponse(
            success=True,
            data=result,
            meta=Meta(
                processing_time_ms=processing_time_ms,
                request_id=getattr(request.state, "request_id", None)
            )
        )
    except Exception as e:
        log.error("endpoint_transcribe_failed", error=str(e), exc_info=True)
        raise
