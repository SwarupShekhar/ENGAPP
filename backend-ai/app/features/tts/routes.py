import base64
import time
from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import List, Optional

from app.features.tts.narration_service import build_narration_script, build_full_feedback_script
from app.features.transcription.inworld_tts_service import inworld_tts_service
from app.features.transcription.google_gemini_tts_service import google_gemini_tts_service
from app.features.transcription.kitten_tts_service import kitten_tts_service
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
    first_name: Optional[str] = None


class FeedbackNarrationResponse(BaseModel):
    audio_base64: str
    text: str
    word_timestamps: list = []


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
    audio_bytes, word_timestamps = await inworld_tts_service.synthesize_with_timestamps(script)

    if not audio_bytes:
        log.error("feedback_narration_tts_failed no audio returned")
        # Return empty audio_base64 — mobile will show silent fail
        return FeedbackNarrationResponse(audio_base64="", text=script, word_timestamps=[])

    audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")
    ms = int((time.time() - start) * 1000)
    log.info(f"feedback_narration_completed ms={ms} audio_bytes={len(audio_bytes)}")

    return FeedbackNarrationResponse(audio_base64=audio_base64, text=script, word_timestamps=word_timestamps)


class MistakeEntry(BaseModel):
    spoken: Optional[str] = None
    correct: Optional[str] = None
    rule_category: Optional[str] = None
    original_text: Optional[str] = None
    corrected_text: Optional[str] = None


class FullFeedbackNarrationRequest(BaseModel):
    pronunciation_issues: Optional[List[MistakeEntry]] = None
    grammar_mistakes: Optional[List[MistakeEntry]] = None
    vocabulary_issues: Optional[List[MistakeEntry]] = None
    scores: Optional[dict] = None          # {pronunciation, grammar, vocabulary, fluency}
    justifications: Optional[dict] = None  # {pronunciation, grammar, vocabulary, fluency}
    first_name: Optional[str] = None


@router.post("/full-feedback-narration", response_model=FeedbackNarrationResponse)
async def full_feedback_narration(request: Request, body: FullFeedbackNarrationRequest):
    """
    Builds and narrates ALL feedback sections in one sequential audio.
    Used by the 'Listen to Feedback' button on the Pulse CallFeedbackScreen.
    """
    log = get_logger(request)
    start = time.time()
    log.info(
        f"full_feedback_narration_started "
        f"pron_issues={len(body.pronunciation_issues or [])} "
        f"grammar={len(body.grammar_mistakes or [])} "
        f"scores={body.scores}"
    )

    script = build_full_feedback_script(
        pronunciation_issues=[e.model_dump() for e in (body.pronunciation_issues or [])],
        grammar_mistakes=[e.model_dump() for e in (body.grammar_mistakes or [])],
        vocabulary_issues=[e.model_dump() for e in (body.vocabulary_issues or [])],
        scores=body.scores,
        justifications=body.justifications,
        first_name=body.first_name,
    )
    log.info(f"full_feedback_script_built words={len(script.split())}")

    audio_bytes, word_timestamps = await inworld_tts_service.synthesize_with_timestamps(script)

    if not audio_bytes:
        log.error("full_feedback_narration_tts_failed no audio returned")
        return FeedbackNarrationResponse(audio_base64="", text=script, word_timestamps=[])

    audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")
    ms = int((time.time() - start) * 1000)
    log.info(f"full_feedback_narration_completed ms={ms} audio_bytes={len(audio_bytes)}")

    return FeedbackNarrationResponse(audio_base64=audio_base64, text=script, word_timestamps=word_timestamps)


class SpeakRequest(BaseModel):
    text: str
    speaking_rate: float = 0.65  # Only used by Inworld fallback path

@router.post("/speak", response_model=FeedbackNarrationResponse)
async def speak(request: Request, body: SpeakRequest):
    log = get_logger(request)
    clean = (body.text or "").strip()
    if not clean:
        return FeedbackNarrationResponse(audio_base64="", text="")

    # Inworld is faster and already used for feedback narration; Gemini TTS is the fallback.
    audio_bytes = await inworld_tts_service.synthesize_async(
        clean, speaking_rate=body.speaking_rate
    )
    if not audio_bytes and google_gemini_tts_service.is_configured():
        audio_bytes = await google_gemini_tts_service.synthesize_async(clean)

    if not audio_bytes:
        log.error("speak_tts_failed text_len=%s inworld=%s gemini=%s",
                  len(clean), inworld_tts_service.is_configured(),
                  google_gemini_tts_service.is_configured())
        return FeedbackNarrationResponse(audio_base64="", text=clean)

    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
    return FeedbackNarrationResponse(audio_base64=audio_b64, text=clean)


class KittenSpeakRequest(BaseModel):
    text: str
    voice: str = "Kiki"


class KittenSpeakResponse(BaseModel):
    audio_base64: str
    text: str
    voice: str
    content_type: str = "audio/mpeg"


@router.post("/kitten/speak", response_model=KittenSpeakResponse)
async def kitten_speak(request: Request, body: KittenSpeakRequest):
    """Local CPU TTS for daily phrase/word and static ack clips."""
    log = get_logger(request)
    clean = (body.text or "").strip()
    voice = (body.voice or "Kiki").strip()
    if not clean:
        return KittenSpeakResponse(audio_base64="", text="", voice=voice)

    if not kitten_tts_service.is_enabled():
        log.warning("kitten_speak_disabled")
        return KittenSpeakResponse(audio_base64="", text=clean, voice=voice)

    start = time.time()
    audio_bytes = await kitten_tts_service.synthesize_async(clean, voice=voice)
    if not audio_bytes:
        log.error("kitten_speak_failed text_len=%s voice=%s", len(clean), voice)
        return KittenSpeakResponse(audio_base64="", text=clean, voice=voice)

    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
    ms = int((time.time() - start) * 1000)
    log.info(
        "kitten_speak_completed ms=%s voice=%s text_len=%s audio_bytes=%s",
        ms,
        voice,
        len(clean),
        len(audio_bytes),
    )
    return KittenSpeakResponse(
        audio_base64=audio_b64,
        text=clean,
        voice=voice,
        content_type="audio/mpeg",
    )
