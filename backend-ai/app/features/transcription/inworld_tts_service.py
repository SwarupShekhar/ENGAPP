import asyncio
import base64
import httpx
import re
from typing import Optional
from app.core.config import settings
from app.core.logger import logger


class InworldTTSService:
    def __init__(self):
        self.api_key = settings.inworld_api_key
        self.jwt_key = settings.inworld_jwt_key
        self.jwt_secret = settings.inworld_jwt_secret
        self.endpoint = "https://api.inworld.ai/tts/v1/voice"
        self.auth_header: Optional[str] = ""

        if self.jwt_key and self.jwt_secret:
            auth_str = f"{self.jwt_key}:{self.jwt_secret}"
            self.auth_header = f"Basic {base64.b64encode(auth_str.encode()).decode()}"
        elif self.api_key:
            if self.api_key.startswith("Basic "):
                self.auth_header = self.api_key
            else:
                self.auth_header = f"Basic {self.api_key}"
        else:
            self.auth_header = None
            logger.warning("Inworld AI credentials not configured.")

    def _clean_text(self, text: str) -> str:
        text = re.sub(r'[\U00010000-\U0010ffff]', '', text)
        text = re.sub(r'[^\w\s,!.?\'"]', '', text)
        return text

    def _build_payload(self, text: str) -> dict:
        return {
            "text": self._clean_text(text),
            "voiceId": settings.inworld_character_id or "Abby",
            "modelId": "inworld-tts-1.5-max",
            "timestampType": "WORD",
        }

    def synthesize_hinglish(self, text: str, gender: str = 'female') -> bytes:
        """Synchronous synthesis — kept for backward compat with tutor route."""
        if not self.auth_header:
            logger.error("Inworld TTS service is not configured.")
            return b""
        headers = {"Authorization": self.auth_header, "Content-Type": "application/json"}
        try:
            with httpx.Client() as client:
                response = client.post(
                    self.endpoint,
                    json=self._build_payload(text),
                    headers=headers,
                    timeout=30.0,
                )
                if response.status_code != 200:
                    logger.error(f"Inworld TTS error: {response.status_code} - {response.text}")
                    return b""
                result = response.json()
                audio_content = result.get("audioContent")
                if not audio_content:
                    logger.error("Inworld TTS returned no audio content")
                    return b""
                return base64.b64decode(audio_content)
        except Exception as e:
            logger.error(f"Inworld TTS error: {e}")
            return b""

    async def synthesize_async(self, text: str, gender: str = 'female') -> bytes:
        """Async synthesis using httpx.AsyncClient — non-blocking, lower latency."""
        if not self.auth_header:
            logger.error("Inworld TTS service is not configured.")
            return b""
        headers = {"Authorization": self.auth_header, "Content-Type": "application/json"}
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.endpoint,
                    json=self._build_payload(text),
                    headers=headers,
                    timeout=30.0,
                )
                if response.status_code != 200:
                    logger.error(f"Inworld TTS async error: {response.status_code} - {response.text}")
                    return b""
                result = response.json()
                audio_content = result.get("audioContent")
                if not audio_content:
                    logger.error("Inworld TTS async returned no audio content")
                    return b""
                return base64.b64decode(audio_content)
        except Exception as e:
            logger.error(f"Inworld TTS async error: {e}")
            return b""

    async def synthesize_sentence(self, text: str) -> bytes:
        """Alias for synthesize_async — called by StreamingTutorService."""
        return await self.synthesize_async(text)


inworld_tts_service = InworldTTSService()
