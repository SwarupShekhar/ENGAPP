from __future__ import annotations

import time
from typing import Any

import httpx

from app.core.config import settings
from app.core.logger import logger
from app.models.base import Word
from app.models.response import TranscriptionResponse


class DeepgramTranscriptionService:
    """Deepgram transcription client (primary STT when enabled)."""

    def __init__(self) -> None:
        self.api_key = settings.deepgram_api_key
        self.model = settings.deepgram_model or "nova-3"
        # nova-3 does not accept all regional codes (en-IN → 400). Prefer en.
        self.language = settings.deepgram_language or "en"
        if not self.api_key:
            logger.warning("Deepgram API key not configured; Deepgram STT disabled.")

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    def _param_attempts(self, language: str | None = None) -> list[dict[str, str]]:
        """
        Build param sets to try. Deepgram returns 400 for invalid model/language
        combinations (e.g. nova-3 + en-IN) or unsupported query flags.
        """
        primary_lang = (language or self.language or "en").strip()
        langs: list[str] = []
        for lang in (primary_lang, "en", "en-US"):
            if lang and lang not in langs:
                langs.append(lang)

        models: list[str] = []
        for model in (self.model, "nova-2"):
            if model and model not in models:
                models.append(model)

        attempts: list[dict[str, str]] = []
        for model in models:
            for lang in langs:
                attempts.append(
                    {
                        "model": model,
                        "language": lang,
                        # Keep grammar errors literal — don't over-normalize learner speech.
                        "smart_format": "false",
                        "punctuate": "true",
                    }
                )
        return attempts

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

    def _post_listen(
        self,
        client: httpx.Client | httpx.AsyncClient,
        audio_bytes: bytes,
        headers: dict[str, str],
        params: dict[str, str],
    ):
        return client.post(
            "https://api.deepgram.com/v1/listen",
            params=params,
            headers=headers,
            content=audio_bytes,
        )

    def _raise_with_body(self, response: httpx.Response, params: dict[str, str]) -> None:
        body = (response.text or "")[:400]
        logger.warning(
            "Deepgram listen failed status=%s params=%s body=%s",
            response.status_code,
            params,
            body,
        )
        response.raise_for_status()

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
        attempts = self._param_attempts(language)
        last_error: Exception | None = None

        async with httpx.AsyncClient(timeout=45.0) as client:
            for params in attempts:
                response = await self._post_listen(client, audio_bytes, headers, params)
                if response.status_code == 400:
                    body = (response.text or "")[:400]
                    logger.warning(
                        "Deepgram 400 for params=%s body=%s — trying next",
                        params,
                        body,
                    )
                    last_error = httpx.HTTPStatusError(
                        f"Deepgram 400: {body}",
                        request=response.request,
                        response=response,
                    )
                    continue
                if response.status_code >= 400:
                    self._raise_with_body(response, params)
                logger.info(
                    "Deepgram STT ok model=%s language=%s",
                    params.get("model"),
                    params.get("language"),
                )
                return self._parse_response(response.json(), time.time() - start_time)

        if last_error:
            raise last_error
        raise RuntimeError("Deepgram transcription failed with no attempts")

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
        attempts = self._param_attempts(language)
        last_error: Exception | None = None

        with httpx.Client(timeout=45.0) as client:
            for params in attempts:
                response = self._post_listen(client, audio_bytes, headers, params)
                if response.status_code == 400:
                    body = (response.text or "")[:400]
                    logger.warning(
                        "Deepgram 400 for params=%s body=%s — trying next",
                        params,
                        body,
                    )
                    last_error = httpx.HTTPStatusError(
                        f"Deepgram 400: {body}",
                        request=response.request,
                        response=response,
                    )
                    continue
                if response.status_code >= 400:
                    self._raise_with_body(response, params)
                logger.info(
                    "Deepgram STT ok model=%s language=%s",
                    params.get("model"),
                    params.get("language"),
                )
                return self._parse_response(response.json(), time.time() - start_time)

        if last_error:
            raise last_error
        raise RuntimeError("Deepgram transcription failed with no attempts")


deepgram_transcription_service = DeepgramTranscriptionService()
