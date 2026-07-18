"""
LLM-based grammar grader for post-call scoring.

Replaces the structural heuristic (spaCy sentence well-formedness + hand-listed
patterns) with a real grammatical-error grader. The heuristic cannot model
word-order / missing-copula / agreement / tense errors that dominate learner
speech; an LLM can. Runs off the hot path (post-call), so a ~1-2s call is fine.

Provider order mirrors coaching_llm: Cerebras primary, Gemini fallback. Returns
None on any failure so callers fall back to the structural heuristic.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import threading
from typing import Any, Dict, List, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

_gemini_configured = False
_gemini_lock = threading.Lock()

_SYSTEM_RUBRIC = """You are an ESL examiner grading the GRAMMAR of a spoken-English transcript.

The transcript comes from automatic speech recognition of a language learner, so:
- IGNORE capitalization, punctuation, and spelling — they are ASR artifacts, not the speaker's errors.
- Grade ONLY grammar: word order, subject-verb agreement, verb tense/form, missing or
  wrong auxiliaries/copulas ("I English no speak", "it not going good"), article/preposition
  misuse, plural/possessive errors, and broken/incomplete clauses.
- Do NOT grade pronunciation, vocabulary richness, fluency/pace, or content — only grammar.

Score 0-100 on this rubric:
- 90-100: essentially native-like grammar; at most rare slips.
- 75-89: mostly correct; occasional errors that don't impede meaning.
- 60-74: frequent errors but generally understandable sentences.
- 40-59: many errors; sentence structure often broken but some correct clauses.
- 20-39: mostly broken grammar; word-order/missing-verb errors throughout.
- 0-19: almost no well-formed grammar.

Return STRICT JSON only, no prose, in exactly this shape:
{"score": <int 0-100>, "error_count": <int>, "examples": ["<short quote>", ...], "rationale": "<one sentence>"}
Limit examples to at most 5."""


def resolve_provider() -> str:
    mode = (settings.grammar_llm_provider or "auto").strip().lower()
    if mode in ("gemini", "cerebras"):
        return mode
    if (settings.cerebras_api_key or "").strip():
        return "cerebras"
    return "gemini"


def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    if not text:
        return None
    # Strip code fences and grab the first {...} block.
    cleaned = text.strip().replace("```json", "```")
    if "```" in cleaned:
        cleaned = cleaned.split("```")[1] if len(cleaned.split("```")) > 1 else cleaned
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except (ValueError, TypeError):
        return None


def _coerce(payload: Dict[str, Any], provider: str) -> Optional[Dict[str, Any]]:
    if not isinstance(payload, dict) or "score" not in payload:
        return None
    try:
        score = float(payload["score"])
    except (ValueError, TypeError):
        return None
    score = max(0.0, min(100.0, score))
    examples = payload.get("examples") or []
    if not isinstance(examples, list):
        examples = [str(examples)]
    return {
        "score": round(score, 2),
        "error_count": int(payload.get("error_count") or 0),
        "examples": [str(e)[:120] for e in examples][:5],
        "rationale": str(payload.get("rationale") or "")[:300],
        "provider": provider,
    }


def _cerebras_sync(prompt: str, *, timeout_sec: float) -> str:
    from cerebras.cloud.sdk import Cerebras

    api_key = (settings.cerebras_api_key or "").strip()
    if not api_key:
        raise RuntimeError("CEREBRAS_API_KEY not configured")
    model = (settings.grammar_cerebras_model or settings.cerebras_chat_model).strip()
    client = Cerebras(api_key=api_key, timeout=timeout_sec)
    kwargs: Dict[str, Any] = dict(
        messages=[
            {"role": "system", "content": _SYSTEM_RUBRIC},
            {"role": "user", "content": prompt},
        ],
        model=model,
        max_completion_tokens=int(settings.grammar_llm_max_tokens or 2048),
        temperature=0.0,
        top_p=1.0,
        stream=False,
        timeout=timeout_sec,
    )
    # gpt-oss models spend the token budget on hidden reasoning first; keep it low
    # so the JSON answer fits. Ignored by non-reasoning models.
    if "oss" in model.lower():
        kwargs["reasoning_effort"] = "low"
    try:
        completion = client.chat.completions.create(**kwargs)
    except TypeError:
        kwargs.pop("reasoning_effort", None)
        completion = client.chat.completions.create(**kwargs)
    msg = completion.choices[0].message
    return (getattr(msg, "content", None) or "").strip()


def _ensure_gemini(api_key: str) -> None:
    global _gemini_configured
    if _gemini_configured:
        return
    with _gemini_lock:
        if _gemini_configured:
            return
        import google.generativeai as genai

        genai.configure(api_key=api_key)
        _gemini_configured = True


async def _gemini(prompt: str, *, timeout_sec: float) -> str:
    import google.generativeai as genai

    api_key = settings.google_api_key
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY not configured")
    _ensure_gemini(api_key)
    model = genai.GenerativeModel(
        (settings.google_gemini_chat_model or "gemini-2.5-flash").strip(),
        system_instruction=_SYSTEM_RUBRIC,
    )
    response = await asyncio.wait_for(
        model.generate_content_async(
            prompt,
            generation_config={
                "temperature": 0.0,
                "max_output_tokens": int(settings.grammar_llm_max_tokens or 700),
            },
        ),
        timeout=timeout_sec,
    )
    return response.text or ""


async def grade_grammar_llm(user_turns: List[str]) -> Optional[Dict[str, Any]]:
    """
    Grade grammar with an LLM. Returns a dict with score/examples/rationale/provider,
    or None if disabled, empty, or all providers fail (caller falls back to heuristic).
    """
    if not settings.grammar_llm_enabled:
        return None
    transcript = " ".join(t for t in user_turns if t).strip()
    if not transcript:
        return None

    timeout_sec = max(1.0, float(settings.grammar_llm_timeout_sec or 20.0))
    prompt = f"Transcript to grade:\n\"\"\"\n{transcript}\n\"\"\"\nReturn the JSON."

    primary = resolve_provider()
    order = [primary]
    if (
        settings.maya_llm_fallback_to_gemini
        and primary == "cerebras"
        and (settings.google_api_key or "").strip()
    ):
        order.append("gemini")

    last_error: Optional[Exception] = None
    for provider in order:
        try:
            if provider == "cerebras":
                if not (settings.cerebras_api_key or "").strip():
                    continue
                raw = await asyncio.wait_for(
                    asyncio.to_thread(_cerebras_sync, prompt, timeout_sec=timeout_sec),
                    timeout=timeout_sec + 1.0,
                )
            else:
                raw = await _gemini(prompt, timeout_sec=timeout_sec)
            parsed = _coerce(_extract_json(raw) or {}, provider)
            if parsed is not None:
                logger.info(
                    "grammar_llm provider=%s score=%s", provider, parsed["score"]
                )
                return parsed
            logger.warning("grammar_llm provider=%s returned unparseable output", provider)
        except Exception as e:  # noqa: BLE001 — fall back on any provider failure
            last_error = e
            logger.warning("grammar_llm provider=%s failed: %s", provider, e)

    if last_error:
        logger.warning("grammar_llm all providers failed: %s", last_error)
    return None
