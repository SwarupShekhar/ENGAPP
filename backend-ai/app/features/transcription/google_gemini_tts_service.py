"""
Google Gemini TTS (Gemini API) — fallback when Inworld is unavailable or fails.

Uses generativelanguage.googleapis.com with models such as gemini-2.5-flash-tts
(Cloud TTS billing name; same family as Gemini API speech-generation models).

API key: GOOGLE_TTS_API_KEY or GOOGLE_API_KEY from settings.
Output: MP3 bytes for mobile playback (data:audio/mp3;base64).
"""

from __future__ import annotations

import asyncio
import base64
import io
import logging
import re
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# Prefer GA model from Cloud TTS; fall back if Gemini API returns 404 for that id.
_MODEL_FALLBACK_CHAIN = (
    "gemini-2.5-flash-tts",
    "gemini-2.5-flash-preview-tts",
    "gemini-3.1-flash-tts-preview",
)

_GEMINI_TTS_SAMPLE_RATE = 24000


class GoogleGeminiTTSService:
    def __init__(self) -> None:
        self.api_key = (settings.google_tts_api_key or settings.google_api_key or "").strip()
        self.model = (settings.google_tts_model or "gemini-2.5-flash-tts").strip()
        self.voice_name = (settings.google_tts_voice or "Kore").strip()
        self.prompt = (
            settings.google_tts_prompt
            or "Say the following in a calm, clear, neutral English voice suitable for a language tutor. "
            "Speak at a steady, natural pace without being overly expressive."
        ).strip()
        self._resolved_model: Optional[str] = None

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def _clean_text(self, text: str) -> str:
        text = re.sub(r"[\U00010000-\U0010ffff]", "", text)
        text = re.sub(r"[*_`#]+", "", text)
        text = re.sub(r"\s+", " ", text).strip()
        return text[:500]

    def _pcm_to_mp3(self, pcm: bytes) -> bytes:
        if not pcm:
            return b""
        try:
            from pydub import AudioSegment
        except ImportError:
            logger.warning("pydub unavailable; returning raw PCM (mobile expects MP3)")
            return pcm
        segment = AudioSegment(
            data=pcm,
            sample_width=2,
            frame_rate=_GEMINI_TTS_SAMPLE_RATE,
            channels=1,
        )
        buf = io.BytesIO()
        segment.export(buf, format="mp3", bitrate="64k")
        return buf.getvalue()

    def _extract_audio_bytes(self, data: dict) -> bytes:
        candidates = data.get("candidates") or []
        for cand in candidates:
            content = cand.get("content") or {}
            for part in content.get("parts") or []:
                inline = part.get("inlineData") or part.get("inline_data") or {}
                raw = inline.get("data")
                if not raw:
                    continue
                if isinstance(raw, str):
                    return base64.b64decode(raw)
                if isinstance(raw, (bytes, bytearray)):
                    return bytes(raw)
        return b""

    async def _synthesize_model(self, client: httpx.AsyncClient, model: str, text: str) -> bytes:
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model}:generateContent"
        )
        payload = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": f"{self.prompt}\n\n{text}",
                        }
                    ]
                }
            ],
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {
                    "voiceConfig": {
                        "prebuiltVoiceConfig": {
                            "voiceName": self.voice_name,
                        }
                    }
                },
            },
        }
        response = await client.post(
            url,
            params={"key": self.api_key},
            json=payload,
            timeout=45.0,
        )
        if response.status_code == 404:
            return b""  # signal try next model
        if response.status_code != 200:
            logger.error(
                "Google Gemini TTS error model=%s status=%s body=%s",
                model,
                response.status_code,
                response.text[:400],
            )
            return b""
        pcm = self._extract_audio_bytes(response.json())
        if not pcm:
            logger.warning("Google Gemini TTS model=%s returned no audio", model)
            return b""
        return self._pcm_to_mp3(pcm)

    async def synthesize_async(self, text: str) -> bytes:
        clean = self._clean_text(text)
        if not clean or not self.is_configured():
            return b""

        models = [self.model]
        for m in _MODEL_FALLBACK_CHAIN:
            if m not in models:
                models.append(m)

        async with httpx.AsyncClient() as client:
            for model in models:
                try:
                    audio = await self._synthesize_model(client, model, clean)
                    if audio:
                        if self._resolved_model != model:
                            self._resolved_model = model
                            logger.info("Google Gemini TTS using model=%s voice=%s", model, self.voice_name)
                        return audio
                except httpx.HTTPError as e:
                    logger.error("Google Gemini TTS HTTP error model=%s: %s", model, e)
                except Exception as e:
                    logger.error("Google Gemini TTS error model=%s: %s", model, e)
        return b""

    async def synthesize_sentence(self, text: str) -> bytes:
        """Called by StreamingTutorService (same contract as Inworld / Azure)."""
        return await self.synthesize_async(text)

    def synthesize_hinglish(self, text: str, gender: str = "female") -> bytes:
        return asyncio.run(self.synthesize_async(text))


google_gemini_tts_service = GoogleGeminiTTSService()
