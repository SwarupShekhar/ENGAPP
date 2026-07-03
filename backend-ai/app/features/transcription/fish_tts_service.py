import re
from typing import Optional

import httpx

from app.core.config import settings
from app.core.logger import logger


class FishTTSService:
    """Fish Audio cloud TTS (https://fish.audio)."""

    def __init__(self) -> None:
        self.api_key = (settings.fish_audio_api_key or "").strip()
        self.endpoint = "https://api.fish.audio/v1/tts"
        self.model = (settings.fish_tts_model or "s2.1-pro-free").strip()

    def is_configured(self) -> bool:
        return bool(self.api_key) and settings.fish_tts_enabled

    def _clean_text(self, text: str) -> str:
        text = re.sub(r"[\U00010000-\U0010ffff]", "", text)
        return text.strip()

    def resolve_reference_id(self, voice_id: Optional[str] = None) -> Optional[str]:
        """Map daily listen Inworld labels (Olivia/Dennis) to Fish voice model ids."""
        label = (voice_id or "").strip()
        if label:
            lower = label.lower()
            if lower in ("olivia", "kiki"):
                return (
                    (settings.fish_tts_reference_id_kiki or "").strip()
                    or (settings.fish_tts_reference_id or "").strip()
                    or None
                )
            if lower in ("dennis", "jasper"):
                return (
                    (settings.fish_tts_reference_id_jasper or "").strip()
                    or (settings.fish_tts_reference_id or "").strip()
                    or None
                )
        default = (settings.fish_tts_reference_id or "").strip()
        return default or None

    async def synthesize_async(
        self,
        text: str,
        voice_id: Optional[str] = None,
        timeout_sec: Optional[float] = None,
    ) -> bytes:
        if not self.is_configured():
            return b""

        clean = self._clean_text(text)
        if not clean:
            return b""

        reference_id = self.resolve_reference_id(voice_id)
        payload: dict = {"text": clean, "format": "mp3"}
        if reference_id:
            payload["reference_id"] = reference_id

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "model": self.model,
        }
        timeout = timeout_sec if timeout_sec is not None else settings.fish_tts_timeout_sec

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.endpoint,
                    json=payload,
                    headers=headers,
                    timeout=timeout,
                )
                if response.status_code != 200:
                    logger.warning(
                        "Fish TTS error status=%s body=%s",
                        response.status_code,
                        (response.text or "")[:200],
                    )
                    return b""
                content = response.content or b""
                if len(content) < 128:
                    logger.warning("Fish TTS returned suspiciously small payload (%s bytes)", len(content))
                    return b""
                return content
        except httpx.TimeoutException:
            logger.warning("Fish TTS timeout after %ss text_len=%s", timeout, len(clean))
            return b""
        except Exception as exc:
            logger.warning("Fish TTS error: %s", exc)
            return b""


fish_tts_service = FishTTSService()
