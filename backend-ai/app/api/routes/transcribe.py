import time
from fastapi import APIRouter, Depends, Request
from app.models.request import TranscriptionRequest
from app.models.response import TranscriptionResponse, StandardResponse, Meta
from app.services.transcription_service import transcription_service, TranscriptionService
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
        log.info("endpoint_transcribe_started", user_id=body.user_id)
        print(f"DEBUG TRANSCRIBE REQUEST: audio_url={body.audio_url}, has_base64={bool(body.audio_base64)}, base64_len={len(body.audio_base64) if body.audio_base64 else 0}, user_id={body.user_id}")
        
        start_time = time.time()
        print(f"DEBUG: Calling service.transcribe for user {body.user_id}")
        result = await service.transcribe(body)
        print("DEBUG: Service returned result")
        
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
        print(f"DEBUG: Error in transcribe endpoint: {str(e)}")
        import traceback
        traceback.print_exc()
        raise e
