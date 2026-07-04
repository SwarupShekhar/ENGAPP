from __future__ import annotations

import asyncio
import logging
import queue
import threading
from collections.abc import AsyncGenerator

from app.core.config import settings
from app.features.tutor.prompt_builder import build_conversation_prompt
from app.features.tutor.llm.sentence_chunker import (
    finalize_tail,
    iter_sentences_from_buffer,
    sanitize_maya_sentence,
)

logger = logging.getLogger(__name__)

FALLBACK_REPLY = (
    "I'm having a little trouble connecting right now. "
    "Could you please say that again in a moment?"
)
NOT_CONFIGURED_REPLY = (
    "I'm not fully configured yet. Please set CEREBRAS_API_KEY and restart the AI service."
)

# Soft cap for spoken turns; max_tokens is the real length backstop.
_MAX_SENTENCES = 4
_SENTINEL = object()


def _reasoning_model_max_tokens(model: str, base: int) -> int:
    mid = model.lower()
    if "gpt-oss" in mid or "glm" in mid or "zai-glm" in mid:
        return max(base, 800)
    return base


class StreamingCerebrasService:
    provider_name = "cerebras"

    def __init__(self) -> None:
        self.api_key = (settings.cerebras_api_key or "").strip()
        self.model_name = (settings.cerebras_chat_model or "gpt-oss-120b").strip()
        self.enabled = bool(self.api_key)
        self._client = None
        if not self.enabled:
            logger.warning(
                "CEREBRAS_API_KEY is not configured; Cerebras tutor responses are disabled."
            )
            return
        try:
            from cerebras.cloud.sdk import Cerebras

            self._client = Cerebras(api_key=self.api_key)
        except ImportError:
            logger.warning("cerebras-cloud-sdk not installed; Cerebras tutor disabled.")
            self.enabled = False

    def _max_completion_tokens(self) -> int:
        base = int(settings.cerebras_max_completion_tokens or 220)
        return _reasoning_model_max_tokens(self.model_name, base)

    def _produce_tokens(self, prompt: str, out: queue.Queue) -> None:
        try:
            assert self._client is not None
            stream = self._client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model=self.model_name,
                max_completion_tokens=self._max_completion_tokens(),
                temperature=float(settings.cerebras_temperature or 0.55),
                top_p=float(settings.cerebras_top_p or 0.9),
                stream=True,
            )
            for chunk in stream:
                try:
                    delta = chunk.choices[0].delta.content or ""
                except (AttributeError, IndexError, TypeError):
                    delta = ""
                if delta:
                    out.put(delta)
        except Exception as exc:
            out.put(exc)
        finally:
            out.put(_SENTINEL)

    async def stream_response(
        self,
        prompt: str,
        conversation_history: list,
        phonetic_context: dict | None = None,
        audio_base64: str | None = None,
        cefr_level: str | None = None,
    ) -> AsyncGenerator[str, None]:
        if audio_base64:
            raise ValueError("Cerebras does not support multimodal audio turns")

        if not self.enabled or self._client is None:
            raise RuntimeError("Cerebras is not configured or SDK unavailable")

        full_prompt = build_conversation_prompt(
            prompt, conversation_history, phonetic_context, cefr_level
        )
        logger.info(
            "CEREBRAS tutor stream utterance_len=%s context=%s model=%s max_tokens=%s",
            len(prompt),
            bool(phonetic_context),
            self.model_name,
            self._max_completion_tokens(),
        )

        token_queue: queue.Queue = queue.Queue()
        threading.Thread(
            target=self._produce_tokens,
            args=(full_prompt, token_queue),
            daemon=True,
        ).start()

        buffer = ""
        emitted = 0
        try:
            while emitted < _MAX_SENTENCES:
                try:
                    item = token_queue.get_nowait()
                except queue.Empty:
                    await asyncio.sleep(0.01)
                    continue

                if item is _SENTINEL:
                    break
                if isinstance(item, Exception):
                    raise item

                buffer += str(item)
                new_sentences, buffer = iter_sentences_from_buffer(
                    buffer,
                    max_sentences=_MAX_SENTENCES - emitted,
                    sanitize=sanitize_maya_sentence,
                )
                for sentence in new_sentences:
                    yield sentence
                    emitted += 1
                    if emitted >= _MAX_SENTENCES:
                        return

            tail = finalize_tail(
                buffer,
                emitted_count=emitted,
                max_sentences=_MAX_SENTENCES,
                sanitize=sanitize_maya_sentence,
            )
            if tail:
                yield tail
            elif emitted == 0:
                raise RuntimeError("Cerebras returned empty tutor response")
        except Exception as e:
            logger.error("Cerebras stream failed: %s", e)
            if emitted == 0:
                raise
