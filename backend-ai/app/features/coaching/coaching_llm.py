"""Fast YES/NO LLM calls for in-call coaching hints (Cerebras or Gemini)."""
from __future__ import annotations

import asyncio
import logging
from typing import Literal

from app.core.config import settings

logger = logging.getLogger(__name__)

ProviderName = Literal["gemini", "cerebras"]


def resolve_coaching_llm_provider() -> ProviderName:
    mode = (settings.coaching_llm_provider or "auto").strip().lower()
    if mode == "gemini":
        return "gemini"
    if mode == "cerebras":
        return "cerebras"
    if (settings.cerebras_api_key or "").strip():
        return "cerebras"
    return "gemini"


def _normalize_yes_no(text: str) -> str:
    return (text or "").strip().upper()


def _cerebras_yes_no_sync(prompt: str) -> str:
    from cerebras.cloud.sdk import Cerebras

    api_key = (settings.cerebras_api_key or "").strip()
    if not api_key:
        raise RuntimeError("CEREBRAS_API_KEY not configured")

    model = (settings.coaching_cerebras_model or "gemma-4-31b").strip()
    client = Cerebras(api_key=api_key)
    completion = client.chat.completions.create(
        messages=[{"role": "user", "content": prompt}],
        model=model,
        max_completion_tokens=int(settings.coaching_llm_max_tokens or 32),
        temperature=0.1,
        top_p=1.0,
        stream=False,
    )
    content = completion.choices[0].message.content or ""
    if not content.strip():
        reasoning = getattr(completion.choices[0].message, "reasoning", None) or ""
        if reasoning:
            tail = reasoning.strip().split()[-8:]
            content = " ".join(tail)
    return _normalize_yes_no(content)


async def _gemini_yes_no(prompt: str) -> str:
    import google.generativeai as genai

    api_key = settings.google_api_key
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY not configured")

    genai.configure(api_key=api_key)
    chat_model = (settings.google_gemini_chat_model or "gemini-2.5-flash").strip()
    model = genai.GenerativeModel(chat_model)
    response = await model.generate_content_async(
        prompt,
        generation_config={
            "temperature": 0.1,
            "max_output_tokens": int(settings.coaching_llm_max_tokens or 32),
        },
    )
    return _normalize_yes_no(response.text or "")


async def classify_yes_no(prompt: str) -> str | None:
    """
    Return normalized model text (e.g. YES / NO) or None if all providers fail.
  """
    primary = resolve_coaching_llm_provider()
    order: list[ProviderName] = [primary]
    if (
        settings.maya_llm_fallback_to_gemini
        and primary == "cerebras"
        and (settings.google_api_key or "").strip()
    ):
        order.append("gemini")

    last_error: Exception | None = None
    for provider in order:
        try:
            if provider == "cerebras":
                if not (settings.cerebras_api_key or "").strip():
                    continue
                answer = await asyncio.to_thread(_cerebras_yes_no_sync, prompt)
            else:
                answer = await _gemini_yes_no(prompt)
            if answer:
                logger.debug("coaching_llm provider=%s answer=%r", provider, answer[:20])
                return answer
        except Exception as e:
            last_error = e
            logger.warning("coaching_llm provider=%s failed: %s", provider, e)

    if last_error:
        logger.warning("coaching_llm all providers failed: %s", last_error)
    return None
