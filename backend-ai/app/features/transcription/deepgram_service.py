from __future__ import annotations

import time
from typing import Any

import httpx

from app.core.config import settings
from app.core.logger import logger
from app.models.base import Word
from app.models.response import TranscriptionResponse


class DeepgramTranscriptionService:
    """Deepgram Nova-3 transcription client — used as secondary/display STT when enabled."""

    def __init__(self) -> None:
        self.api_key = settings.deepgram_api_key
        self.model = settings.deepgram_model or "nova-3"
        self.language = settings.deepgram_language or "en-IN"
        if not self.api_key:
            logger.warning("Deepgram API key not configured; Deepgram STT disabled.")

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    def _request_params(self, language: str | None = None) -> dict[str, str]:
        return {
            "model": self.model,
            "language": language or self.language,
            "smart_format": "false",  # Keep grammar errors literal — don't normalize
            "punctuate": "true",
            "alternatives": "3",      # Word-level phonetic alternatives for pronunciation mining
        }

    def _parse_response(self, payload: dict[str, Any], processing_time: float) -> TranscriptionResponse:
        alternatives = (
            payload.get("results", {})
            .get("channels", [{}])[0]
            .get("alternatives", [])
        )
        best = alternatives[0] if alternatives else {}
        words_payload = best.get("words") or []

        words = [
            Word(
                text=str(w.get("punctuated_word") or w.get("word") or ""),
                start_time=float(w.get("start") or 0.0),
                end_time=float(w.get("end") or 0.0),
                confidence=float(w.get("confidence") or 0.0),
            )
            for w in words_payload
            if w.get("word") or w.get("punctuated_word")
        ]

        duration = float(payload.get("metadata", {}).get("duration") or 0.0)
        if not duration and words:
            duration = max(w.end_time for w in words)

        confidence = float(best.get("confidence") or 0.0)
        if not confidence and words:
            confidence = sum(w.confidence for w in words) / len(words)

        return TranscriptionResponse(
            text=str(best.get("transcript") or "").strip(),
            confidence=confidence,
            words=words,
            duration=duration,
            processing_time=processing_time,
        )

    async def transcribe_bytes(
        self,
        audio_bytes: bytes,
        *,
        language: str | None = None,
        mime_type: str = "audio/wav",
    ) -> TranscriptionResponse:
        if not self.configured:
            raise RuntimeError("Deepgram transcription service is not configured.")

        start_time = time.time()
        headers = {
            "Authorization": f"Token {self.api_key}",
            "Content-Type": mime_type,
        }
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(
                "https://api.deepgram.com/v1/listen",
                params=self._request_params(language),
                headers=headers,
                content=audio_bytes,
            )
            response.raise_for_status()
        return self._parse_response(response.json(), time.time() - start_time)

    def transcribe_bytes_sync(
        self,
        audio_bytes: bytes,
        *,
        language: str | None = None,
        mime_type: str = "audio/wav",
    ) -> TranscriptionResponse:
        if not self.configured:
            raise RuntimeError("Deepgram transcription service is not configured.")

        start_time = time.time()
        headers = {
            "Authorization": f"Token {self.api_key}",
            "Content-Type": mime_type,
        }
        with httpx.Client(timeout=45.0) as client:
            response = client.post(
                "https://api.deepgram.com/v1/listen",
                params=self._request_params(language),
                headers=headers,
                content=audio_bytes,
            )
            response.raise_for_status()
        return self._parse_response(response.json(), time.time() - start_time)


deepgram_transcription_service = DeepgramTranscriptionService()
