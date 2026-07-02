from unittest.mock import AsyncMock, patch

import pytest

from app.features.coaching.coaching_llm import resolve_coaching_llm_provider
from app.features.coaching.hint_engine import check_missed_opportunity


def test_resolve_coaching_auto_uses_cerebras_when_key_set():
    with patch("app.features.coaching.coaching_llm.settings") as s:
        s.coaching_llm_provider = "auto"
        s.cerebras_api_key = "key"
        assert resolve_coaching_llm_provider() == "cerebras"


def test_resolve_coaching_explicit_gemini():
    with patch("app.features.coaching.coaching_llm.settings") as s:
        s.coaching_llm_provider = "gemini"
        s.cerebras_api_key = "key"
        assert resolve_coaching_llm_provider() == "gemini"


@pytest.mark.asyncio
async def test_missed_opportunity_yes_from_cerebras():
    ctx = {
        "phraseOfDay": {"phrase": "break the ice"},
        "usedPhraseOfDay": False,
    }
    with patch(
        "app.features.coaching.coaching_llm.classify_yes_no",
        new_callable=AsyncMock,
        return_value="YES",
    ):
        hint = await check_missed_opportunity(
            "I met someone new at the party yesterday",
            ctx,
        )
    assert hint is not None
    assert hint["trigger"] == "missed_opportunity"
    assert "break the ice" in hint["text"]


@pytest.mark.asyncio
async def test_missed_opportunity_no_returns_none():
    ctx = {
        "wordOfDay": {"word": "deadline"},
        "usedWordOfDay": False,
    }
    with patch(
        "app.features.coaching.coaching_llm.classify_yes_no",
        new_callable=AsyncMock,
        return_value="NO",
    ):
        hint = await check_missed_opportunity("The weather is nice today", ctx)
    assert hint is None
