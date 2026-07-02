from __future__ import annotations

import asyncio
import base64
import logging
import random
from collections.abc import AsyncGenerator

import google.generativeai as genai

from app.core.config import settings
from app.features.tutor.prompt_builder import build_conversation_prompt
from app.features.tutor.llm.sentence_chunker import stream_sentences_from_async_tokens

logger = logging.getLogger(__name__)

FALLBACK_REPLY = (
    "I'm having a little trouble connecting right now. "
    "Could you please say that again in a moment?"
)
NOT_CONFIGURED_REPLY = (
    "I'm not fully configured yet. Please set GOOGLE_API_KEY and restart the AI service."
)


class StreamingGeminiService:
    provider_name = "gemini"

    def __init__(self) -> None:
        self.enabled = bool(settings.google_api_key)
        if not settings.google_api_key:
            logger.warning(
                "GOOGLE_API_KEY is not configured; Gemini tutor responses are disabled."
            )
            self.model = None
            self.model_name = ""
            return

        genai.configure(api_key=settings.google_api_key)
        self.model_name = (settings.google_gemini_chat_model or "gemini-2.5-flash").strip()
        self.model = genai.GenerativeModel(self.model_name)

    async def stream_response(
        self,
        prompt: str,
        conversation_history: list,
        phonetic_context: dict | None = None,
        audio_base64: str | None = None,
        cefr_level: str | None = None,
    ) -> AsyncGenerator[str, None]:
        if not self.enabled or self.model is None:
            yield NOT_CONFIGURED_REPLY
            return

        full_prompt = build_conversation_prompt(
            prompt, conversation_history, phonetic_context, cefr_level
        )
        logger.info(
            "GEMINI tutor stream utterance_len=%s context=%s audio=%s model=%s",
            len(prompt),
            bool(phonetic_context),
            bool(audio_base64),
            self.model_name,
        )

        if audio_base64:
            audio_bytes = base64.b64decode(audio_base64)
            if (
                len(audio_bytes) >= 12
                and audio_bytes[:4] == b"RIFF"
                and audio_bytes[8:12] == b"WAVE"
            ):
                audio_mime = "audio/wav"
            else:
                audio_mime = "audio/mp4"
            audio_instruction = (
                "\n\n[AUDIO ATTACHED: Listen to the user's audio carefully. "
                "The text transcription above may have been auto-corrected by the speech engine. "
                "If you hear any pronunciation errors (e.g., 'engless' for 'English', 'pepul' for 'people', "
                "'vater' for 'water', 'tink' for 'think'), gently correct them in your response. "
                "The audio is the ground truth — trust what you HEAR over what the text says.]"
            )
            content = [
                full_prompt + audio_instruction,
                {"mime_type": audio_mime, "data": audio_bytes},
            ]
            logger.info(
                "Sending multimodal prompt to Gemini with %d bytes (%s)",
                len(audio_bytes),
                audio_mime,
            )
        else:
            content = full_prompt

        max_retries = 3
        for attempt in range(max_retries + 1):
            has_yielded = False
            try:
                response = await self.model.generate_content_async(
                    content,
                    stream=True,
                    generation_config={
                        "temperature": 0.55,
                        "top_p": 0.9,
                        "top_k": 40,
                        "max_output_tokens": 220,
                    },
                )

                async def _token_stream() -> AsyncGenerator[str, None]:
                    nonlocal has_yielded
                    async for chunk in response:
                        try:
                            if not chunk.text:
                                continue
                            has_yielded = True
                            yield chunk.text
                        except ValueError as ve:
                            logger.warning("Gemini chunk ValueError: %s", ve)
                        except Exception as e:
                            logger.exception("Gemini chunk error: %s", e)
                            if "429" in str(e) and not has_yielded:
                                raise
                            if "429" in str(e):
                                logger.warning(
                                    "Gemini rate limited after partial response"
                                )
                                break

                async for sentence in stream_sentences_from_async_tokens(_token_stream()):
                    yield sentence
                return

            except Exception as e:
                if "429" in str(e) and attempt < max_retries:
                    wait_time = (2 ** (attempt + 1)) + random.uniform(0, 1)
                    logger.warning(
                        "Gemini 429, retrying in %.1fs (attempt %s/%s)",
                        wait_time,
                        attempt + 1,
                        max_retries,
                    )
                    await asyncio.sleep(wait_time)
                    continue

                logger.error("Gemini stream failed: %s", e)
                yield FALLBACK_REPLY
                return

    # Backward compatibility for smoke script / tests
    def _build_conversation_prompt(
        self,
        current_utterance: str,
        history: list,
        phonetic_context: dict | None = None,
        cefr_level: str | None = None,
    ) -> str:
        return build_conversation_prompt(
            current_utterance, history, phonetic_context, cefr_level
        )
