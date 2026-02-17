import time
import base64
from fastapi import APIRouter, Depends, Request
from app.models.request import HinglishSTTRequest, HinglishTTSRequest
from app.models.response import HinglishSTTResponse, HinglishTTSResponse, StandardResponse, Meta
from app.services.hinglish_stt_service import hinglish_stt_service, HinglishSTTService
from app.services.hinglish_tts_service import hinglish_tts_service, HinglishTTSService
from app.api.deps import get_logger

router = APIRouter()

@router.post("/stt", response_model=StandardResponse[HinglishSTTResponse])
async def transcribe_hinglish(
    request: Request,
    body: HinglishSTTRequest,
    service: HinglishSTTService = Depends(lambda: hinglish_stt_service)
):
    log = get_logger(request)
    try:
        log.info("endpoint_hinglish_stt_started", user_id=body.user_id)
        start_time = time.time()
        
        # Decode base64 audio
        audio_data = base64.b64decode(body.audio_base64)
        
        result = service.transcribe_hinglish(audio_data)
        
        processing_time_ms = int((time.time() - start_time) * 1000)
        
        return StandardResponse(
            success=True,
            data=HinglishSTTResponse(
                text=result.get('text', ""),
                language=result.get('language')
            ),
            meta=Meta(
                processing_time_ms=processing_time_ms,
                request_id=getattr(request.state, "request_id", None)
            )
        )
    except Exception as e:
        log.error("endpoint_hinglish_stt_failed", error=str(e))
        raise e

@router.post("/tts", response_model=StandardResponse[HinglishTTSResponse])
async def synthesize_hinglish(
    request: Request,
    body: HinglishTTSRequest,
    service: HinglishTTSService = Depends(lambda: hinglish_tts_service)
):
    log = get_logger(request)
    try:
        log.info("endpoint_hinglish_tts_started")
        start_time = time.time()
        
        audio_content = service.synthesize_hinglish(body.text, body.gender)
        
        # Encode audio back to base64
        audio_base64 = base64.b64encode(audio_content).decode('utf-8')
        
        processing_time_ms = int((time.time() - start_time) * 1000)
        
        return StandardResponse(
            success=True,
            data=HinglishTTSResponse(audio_base64=audio_base64),
            meta=Meta(
                processing_time_ms=processing_time_ms,
                request_id=getattr(request.state, "request_id", None)
            )
        )
    except Exception as e:
        log.error("endpoint_hinglish_tts_failed", error=str(e))
        raise e
