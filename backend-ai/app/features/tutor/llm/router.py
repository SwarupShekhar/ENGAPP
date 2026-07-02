from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from typing import Literal

from app.core.config import settings
from app.features.tutor.llm.streaming_cerebras import StreamingCerebrasService
from app.features.tutor.llm.streaming_gemini import StreamingGeminiService

logger = logging.getLogger(__name__)

ProviderName = Literal["gemini", "cerebras"]


def resolve_tutor_llm_provider(
    *,
    audio_base64: str | None,
    explicit: str | None = None,
) -> ProviderName:
    mode = (explicit or settings.maya_llm_provider or "auto").strip().lower()
    if mode == "gemini":
        return "gemini"
    if mode == "cerebras":
        return "cerebras"
    if audio_base64:
        return "gemini"
    if (settings.cerebras_api_key or "").strip():
        return "cerebras"
    return "gemini"


class TutorLLMRouter:
    """Routes Maya tutor turns to Cerebras or Gemini with optional fallback."""

    def __init__(self) -> None:
        self._gemini = StreamingGeminiService()
        self._cerebras = StreamingCerebrasService()

    @property
    def last_provider(self) -> str | None:
        return getattr(self, "_last_provider", None)

    async def stream_response(
        self,
        prompt: str,
        conversation_history: list,
        phonetic_context: dict | None = None,
        audio_base64: str | None = None,
        cefr_level: str | None = None,
    ) -> AsyncGenerator[str, None]:
        primary = resolve_tutor_llm_provider(audio_base64=audio_base64)
        order: list[ProviderName] = [primary]
        if (
            settings.maya_llm_fallback_to_gemini
            and primary == "cerebras"
            and self._gemini.enabled
        ):
            order.append("gemini")

        last_error: Exception | None = None
        for provider in order:
            svc = self._cerebras if provider == "cerebras" else self._gemini
            if provider == "cerebras" and not self._cerebras.enabled:
                continue
            if provider == "gemini" and not self._gemini.enabled:
                continue

            yielded = False
            try:
                if provider == "cerebras" and audio_base64:
                    raise ValueError("Cerebras cannot handle audio turns")

                self._last_provider = provider
                logger.info("Maya LLM provider=%s", provider)
                async for sentence in svc.stream_response(
                    prompt,
                    conversation_history,
                    phonetic_context,
                    audio_base64 if provider == "gemini" else None,
                    cefr_level=cefr_level,
                ):
                    yielded = True
                    yield sentence
                if yielded:
                    return
            except Exception as e:
                last_error = e
                logger.warning(
                    "Maya LLM provider %s failed: %s — trying fallback",
                    provider,
                    e,
                )
                if not settings.maya_llm_fallback_to_gemini:
                    break

        if last_error:
            logger.error("All Maya LLM providers failed: %s", last_error)
        yield (
            "I'm having a little trouble connecting right now. "
            "Could you please say that again in a moment?"
        )
