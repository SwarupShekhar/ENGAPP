"""Fish → Inworld → Gemini chain for /api/tts/speak and daily listen bakes."""
from typing import Optional, Tuple

from app.core.config import settings
from app.core.logger import logger
from app.features.transcription.fish_tts_service import fish_tts_service
from app.features.transcription.google_gemini_tts_service import google_gemini_tts_service
from app.features.transcription.inworld_tts_service import inworld_tts_service


async def synthesize_speak_with_fallback(
    text: str,
    *,
    speaking_rate: float = 0.78,
    voice_id: Optional[str] = None,
) -> Tuple[bytes, str]:
    """
    Returns (audio_bytes, provider_used).
    provider_used is one of: fish, inworld, gemini, none
    """
    clean = (text or "").strip()
    if not clean:
        return b"", "none"

    if fish_tts_service.is_configured():
        audio = await fish_tts_service.synthesize_async(
            clean,
            voice_id=voice_id,
            timeout_sec=settings.fish_tts_timeout_sec,
        )
        if audio:
            return audio, "fish"
        logger.info("speak_tts_fish_fallback text_len=%s", len(clean))

    if inworld_tts_service.is_configured():
        audio = await inworld_tts_service.synthesize_async(
            clean,
            speaking_rate=speaking_rate,
            voice_id=(voice_id or "").strip() or None,
        )
        if audio:
            return audio, "inworld"
        logger.info("speak_tts_inworld_fallback text_len=%s", len(clean))

    if google_gemini_tts_service.is_configured():
        audio = await google_gemini_tts_service.synthesize_async(clean)
        if audio:
            return audio, "gemini"

    return b"", "none"
