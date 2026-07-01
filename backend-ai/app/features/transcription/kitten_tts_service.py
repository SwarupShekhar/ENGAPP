"""
Kitten TTS Mini 0.8 — local CPU synthesis for static / daily shared audio.

Voices used in EngR: Kiki, Jasper (user-selectable).
"""

from __future__ import annotations

import asyncio
import io
import logging
from typing import Optional

import numpy as np

from app.core.config import settings

logger = logging.getLogger(__name__)

_SAMPLE_RATE = 24_000
_ALLOWED_VOICES = frozenset({"Kiki", "Jasper", "Bella", "Luna", "Bruno", "Rosie", "Hugo", "Leo"})
_DEFAULT_VOICE = "Kiki"
_MODEL_ID = "KittenML/kitten-tts-mini-0.8"


class KittenTTSService:
    def __init__(self) -> None:
        self._model = None
        self._load_lock = asyncio.Lock()

    def is_enabled(self) -> bool:
        return bool(settings.kitten_tts_enabled)

    def _normalize_voice(self, voice: Optional[str]) -> str:
        clean = (voice or _DEFAULT_VOICE).strip()
        if clean not in _ALLOWED_VOICES:
            return _DEFAULT_VOICE
        return clean

    def _load_model_sync(self):
        try:
            from kittentts import KittenTTS

            logger.info("kitten_tts_loading model=%s", _MODEL_ID)
            model = KittenTTS(_MODEL_ID)
            logger.info("kitten_tts_ready")
            return model
        except Exception as exc:
            logger.error("kitten_tts_load_failed model=%s error=%s", _MODEL_ID, exc)
            return None

    async def _ensure_model_loaded(self) -> bool:
        if self._model is not None:
            return True
        async with self._load_lock:
            if self._model is not None:
                return True
            try:
                loaded = await asyncio.to_thread(self._load_model_sync)
            except Exception as exc:
                logger.error("kitten_tts_load_thread_failed error=%s", exc)
                return False
            if loaded is None:
                return False
            self._model = loaded
            return True

    def _audio_to_mp3(self, audio: np.ndarray) -> bytes:
        if audio is None or len(audio) == 0:
            return b""
        try:
            arr = np.asarray(audio)
            if arr.dtype in (np.float32, np.float64):
                arr = (np.clip(arr, -1.0, 1.0) * 32767).astype(np.int16)
            elif arr.dtype != np.int16:
                arr = arr.astype(np.int16)

            from pydub import AudioSegment

            segment = AudioSegment(
                data=arr.tobytes(),
                sample_width=2,
                frame_rate=_SAMPLE_RATE,
                channels=1,
            )
            buf = io.BytesIO()
            segment.export(buf, format="mp3", bitrate="64k")
            return buf.getvalue()
        except Exception as exc:
            logger.error("kitten_tts_mp3_encode_failed error=%s", exc)
            return b""

    def _synthesize_sync(self, text: str, voice: str) -> bytes:
        clean = (text or "").strip()
        if not clean or self._model is None:
            return b""
        try:
            audio = self._model.generate(clean, voice=voice)
            return self._audio_to_mp3(audio)
        except Exception as exc:
            logger.error(
                "kitten_tts_generate_failed voice=%s text_len=%s error=%s",
                voice,
                len(clean),
                exc,
            )
            return b""

    async def synthesize_async(self, text: str, voice: Optional[str] = None) -> bytes:
        if not self.is_enabled():
            return b""
        normalized_voice = self._normalize_voice(voice)
        try:
            if not await self._ensure_model_loaded():
                return b""
            return await asyncio.to_thread(
                self._synthesize_sync, text, normalized_voice
            )
        except Exception as exc:
            logger.error(
                "kitten_tts_synthesize_async_failed voice=%s text_len=%s error=%s",
                normalized_voice,
                len((text or "").strip()),
                exc,
            )
            return b""


kitten_tts_service = KittenTTSService()
