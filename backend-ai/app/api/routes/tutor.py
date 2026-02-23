import time
import base64
import logging
from fastapi import APIRouter, Depends, Request, UploadFile, File, Form, HTTPException
from app.models.request import HinglishSTTRequest, HinglishTTSRequest
from app.models.response import (
    HinglishSTTResponse,
    HinglishSTTWithIntentResponse,
    HinglishTTSResponse,
    TutorPronunciationAssessmentResult,
    StandardResponse,
    Meta,
)
from app.services.hinglish_stt_service import hinglish_stt_service, HinglishSTTService
from app.services.hinglish_tts_service import hinglish_tts_service, HinglishTTSService
from app.api.deps import get_logger

logger = logging.getLogger(__name__)

router = APIRouter()


# ─── Existing STT endpoint (updated to support intent detection) ──

@router.post("/stt", response_model=StandardResponse[HinglishSTTWithIntentResponse])
async def transcribe_hinglish(
    request: Request,
    body: HinglishSTTRequest,
    service: HinglishSTTService = Depends(lambda: hinglish_stt_service),
):
    log = get_logger(request)
    try:
        log.info("endpoint_hinglish_stt_started", user_id=body.user_id)
        start_time = time.time()

        audio_data = base64.b64decode(body.audio_base64)

        # Always include intent detection now
        result = service.transcribe_with_intent(audio_data)

        processing_time_ms = int((time.time() - start_time) * 1000)

        return StandardResponse(
            success=True,
            data=HinglishSTTWithIntentResponse(
                text=result.get("text", ""),
                language=result.get("language"),
                success=result.get("success", True),
                error=result.get("error"),
                intent=result.get("intent", "none"),
                intent_confidence=result.get("intent_confidence", 0.0),
                is_command=result.get("is_command", False),
                matched_keyword=result.get("matched_keyword"),
                phonetic_insights=result.get("phonetic_insights"),
            ),
            meta=Meta(
                processing_time_ms=processing_time_ms,
                request_id=getattr(request.state, "request_id", None),
            ),
        )
    except Exception as e:
        log.error("endpoint_hinglish_stt_failed", error=str(e), type=type(e).__name__, b64_len=len(body.audio_base64) if body and body.audio_base64 else 0)
        raise e


# ─── Existing TTS endpoint (untouched) ───────────────────────────

@router.post("/tts", response_model=StandardResponse[HinglishTTSResponse])
async def synthesize_hinglish(
    request: Request,
    body: HinglishTTSRequest,
    service: HinglishTTSService = Depends(lambda: hinglish_tts_service),
):
    log = get_logger(request)
    try:
        log.info("endpoint_hinglish_tts_started")
        start_time = time.time()

        audio_content = service.synthesize_hinglish(body.text, body.gender)
        audio_base64 = base64.b64encode(audio_content).decode("utf-8")

        processing_time_ms = int((time.time() - start_time) * 1000)

        return StandardResponse(
            success=True,
            data=HinglishTTSResponse(audio_base64=audio_base64),
            meta=Meta(
                processing_time_ms=processing_time_ms,
                request_id=getattr(request.state, "request_id", None),
            ),
        )
    except Exception as e:
        log.error("endpoint_hinglish_tts_failed", error=str(e))
        raise e


# ─── NEW: Pronunciation Assessment endpoint ──────────────────────

@router.post(
    "/assess-pronunciation",
    response_model=StandardResponse[TutorPronunciationAssessmentResult],
)
async def assess_pronunciation(
    request: Request,
    audio: UploadFile = File(...),
    reference_text: str = Form(...),
    service: HinglishSTTService = Depends(lambda: hinglish_stt_service),
):
    """
    Assess how well the user pronounced the reference text.
    Called when Priya asks the user to repeat a corrected phrase.
    Accepts multipart/form-data with an audio file and reference_text.
    """
    log = get_logger(request)
    try:
        log.info("endpoint_assess_pronunciation_started", reference_text=reference_text)
        start_time = time.time()

        audio_bytes = await audio.read()
        if not audio_bytes:
            raise HTTPException(status_code=400, detail="Empty audio file")

        if not reference_text or not reference_text.strip():
            raise HTTPException(status_code=400, detail="reference_text is required")

        result = service.assess_pronunciation(
            audio_bytes=audio_bytes,
            reference_text=reference_text.strip(),
        )

        processing_time_ms = int((time.time() - start_time) * 1000)

        return StandardResponse(
            success=True,
            data=result,
            meta=Meta(
                processing_time_ms=processing_time_ms,
                request_id=getattr(request.state, "request_id", None),
            ),
        )
    except HTTPException:
        raise
    except Exception as e:
        log.error("endpoint_assess_pronunciation_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Assessment failed: {str(e)}")


# ─── NEW: STT with multipart (file upload) ───────────────────────

@router.post("/stt-upload", response_model=StandardResponse[HinglishSTTWithIntentResponse])
async def transcribe_hinglish_upload(
    request: Request,
    audio: UploadFile = File(...),
    detect_intent: bool = Form(default=True),
    service: HinglishSTTService = Depends(lambda: hinglish_stt_service),
):
    """
    Transcribe audio from file upload (multipart/form-data).
    Also detects voice command intent if detect_intent is True.
    """
    log = get_logger(request)
    try:
        log.info("endpoint_stt_upload_started")
        start_time = time.time()

        audio_bytes = await audio.read()
        if not audio_bytes:
            raise HTTPException(status_code=400, detail="Empty audio file")

        # Convert to WAV for Azure
        wav_bytes = service._convert_to_wav(audio_bytes)

        if detect_intent:
            transcription = service.transcribe_with_intent(wav_bytes)

            response_data = HinglishSTTWithIntentResponse(
                text=transcription.get("text", ""),
                language=transcription.get("language"),
                success=transcription.get("success", False),
                intent=transcription.get("intent", "none"),
                intent_confidence=transcription.get("intent_confidence", 0.0),
                is_command=transcription.get("is_command", False),
                matched_keyword=transcription.get("matched_keyword"),
                phonetic_insights=transcription.get("phonetic_insights"),
            )
        else:
            # Transcribe without intent (standard STT)
            transcription = service.transcribe_hinglish(wav_bytes)

            response_data = HinglishSTTWithIntentResponse(
                text=transcription.get("text", ""),
                language=transcription.get("language"),
                success=bool(transcription.get("text")),
            )

        processing_time_ms = int((time.time() - start_time) * 1000)

        return StandardResponse(
            success=True,
            data=response_data,
            meta=Meta(
                processing_time_ms=processing_time_ms,
                request_id=getattr(request.state, "request_id", None),
            ),
        )
    except HTTPException:
        raise
    except Exception as e:
        log.error("endpoint_stt_upload_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
@router.post("/debug-phonemes")
async def debug_phonemes(
    request: Request,
    audio: UploadFile = File(...),
    reference_text: str = Form(...),
    service: HinglishSTTService = Depends(lambda: hinglish_stt_service),
):
    """
    Temporary debug endpoint to get raw phoneme scores and N-Best data.
    """
    log = get_logger(request)
    try:
        log.info("endpoint_debug_phonemes_started", reference_text=reference_text)
        start_time = time.time()

        audio_bytes = await audio.read()
        if not audio_bytes:
            raise HTTPException(status_code=400, detail="Empty audio file")

        result = service.debug_phoneme_scores(audio_bytes, reference_text)

        processing_time_ms = int((time.time() - start_time) * 1000)

        return StandardResponse(
            success=True,
            data=result,
            meta=Meta(
                processing_time_ms=processing_time_ms,
                request_id=getattr(request.state, "request_id", None),
            ),
        )
    except Exception as e:
        log.error("endpoint_debug_phonemes_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Debug failed: {str(e)}")
