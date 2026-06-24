"""Format coaching context into a Gemini prompt block for Maya."""
from __future__ import annotations

import re
from typing import Any


_META_QUESTION_RE = re.compile(
    r"\b("
    r"past mistake|my mistake|what did i get wrong|what should i practice|"
    r"what to practice|weakness|weak area|what am i bad at|areas to improve|"
    r"what were my|my errors|things i got wrong|help me improve"
    r")\b",
    re.I,
)


def user_asks_about_mistakes_or_practice(utterance: str) -> bool:
    if not utterance or not utterance.strip():
        return False
    return bool(_META_QUESTION_RE.search(utterance))


def build_learner_profile_block(ctx: dict[str, Any] | None) -> str:
    """Summarize active tasks + daily picks for the tutor prompt."""
    if not ctx:
        return ""

    lines: list[str] = []
    for task in (ctx.get("activeTasks") or [])[:6]:
        user_said = str(task.get("userSaid") or "").strip()
        target = str(task.get("target") or "").strip()
        if user_said and target:
            lines.append(f'- They often say "{user_said}" — target: "{target}"')
        elif target:
            lines.append(f'- Practice target: "{target}"')
        focus = task.get("focusWords") or []
        if focus and target:
            lines.append(f"  Focus words: {', '.join(str(w) for w in focus[:4])}")

    phrase_obj = ctx.get("phraseOfDay") or {}
    word_obj = ctx.get("wordOfDay") or {}
    phrase = str(phrase_obj.get("phrase") or "").strip()
    word = str(word_obj.get("word") or "").strip()
    if phrase:
        lines.append(f'- Phrase of the day: "{phrase}"')
    if word:
        lines.append(f'- Word of the day: "{word}"')

    if not lines:
        return ""

    return (
        "\n\nLEARNER PROFILE (real data from their practice history — use when relevant):\n"
        + "\n".join(lines)
        + "\n\nWhen they ask about past mistakes, weaknesses, or what to practice, "
        "answer directly from this list in 1-2 sentences. Name specific examples. "
        "Do NOT reply with vague praise like \"that's good\" unless they actually practiced something.\n"
    )
