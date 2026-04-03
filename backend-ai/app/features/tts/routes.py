import base64
import time
from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import List, Optional

from app.features.tts.narration_service import build_narration_script
from app.features.transcription.inworld_tts_service import inworld_tts_service
from app.api.deps import get_logger

router = APIRouter(prefix="/tts", tags=["TTS"])


class NarrationError(BaseModel):
    spoken: Optional[str] = None
    correct: Optional[str] = None
    rule_category: Optional[str] = None
    original_text: Optional[str] = None
    corrected_text: Optional[str] = None


class FeedbackNarrationRequest(BaseModel):
    section: str  # pronunciation | grammar | vocabulary | fluency
    score: int
    justification: Optional[str] = None
    errors: Optional[List[NarrationError]] = None


class FeedbackNarrationResponse(BaseModel):
    audio_base64: str
    text: str


@router.post("/feedback-narration", response_model=FeedbackNarrationResponse)
async def feedback_narration(request: Request, body: FeedbackNarrationRequest):
    log = get_logger(request)
    start = time.time()
    log.info(f"feedback_narration_started section={body.section} score={body.score}")

    # 1. Build narration script from templates (<5ms)
    payload = {
        "score": max(0, min(100, body.score)),
        "justification": body.justification,
        "errors": [e.model_dump() for e in (body.errors or [])],
    }
    script = build_narration_script(body.section, payload)
    log.info(f"feedback_narration_script_built words={len(script.split())}")

    # 2. Synthesize with Inworld TTS (async, ~800-1200ms)
    audio_bytes = await inworld_tts_service.synthesize_async(script)

    if not audio_bytes:
        log.error("feedback_narration_tts_failed no audio returned")
        # Return empty audio_base64 — mobile will show silent fail
        return FeedbackNarrationResponse(audio_base64="", text=script)

    audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")
    ms = int((time.time() - start) * 1000)
    log.info(f"feedback_narration_completed ms={ms} audio_bytes={len(audio_bytes)}")

    return FeedbackNarrationResponse(audio_base64=audio_base64, text=script)
