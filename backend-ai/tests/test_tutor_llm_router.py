from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.features.tutor.llm.router import TutorLLMRouter, resolve_tutor_llm_provider


def test_resolve_auto_text_uses_cerebras_when_key_set():
    with patch(
        "app.features.tutor.llm.router.settings"
    ) as mock_settings:
        mock_settings.maya_llm_provider = "auto"
        mock_settings.cerebras_api_key = "test-key"
        assert resolve_tutor_llm_provider(audio_base64=None) == "cerebras"


def test_resolve_auto_audio_uses_gemini():
    with patch(
        "app.features.tutor.llm.router.settings"
    ) as mock_settings:
        mock_settings.maya_llm_provider = "auto"
        mock_settings.cerebras_api_key = "test-key"
        assert resolve_tutor_llm_provider(audio_base64="abc") == "gemini"


def test_resolve_explicit_gemini():
    with patch(
        "app.features.tutor.llm.router.settings"
    ) as mock_settings:
        mock_settings.maya_llm_provider = "auto"
        mock_settings.cerebras_api_key = "test-key"
        assert resolve_tutor_llm_provider(audio_base64=None, explicit="gemini") == "gemini"


@pytest.mark.asyncio
async def test_router_falls_back_to_gemini_when_cerebras_fails():
    router = TutorLLMRouter()
    router._cerebras.enabled = True
    router._gemini.enabled = True

    async def cerebras_fail(*_a, **_k):
        raise RuntimeError("cerebras down")
        yield  # pragma: no cover

    async def gemini_ok(*_a, **_k):
        yield "Gemini backup reply."

    router._cerebras.stream_response = cerebras_fail
    router._gemini.stream_response = gemini_ok

    with patch("app.features.tutor.llm.router.settings") as s:
        s.maya_llm_provider = "auto"
        s.cerebras_api_key = "test-key"
        s.maya_llm_fallback_to_gemini = True
        parts = [p async for p in router.stream_response("hi", [], None, None, "B1")]

    assert parts == ["Gemini backup reply."]
    assert router.last_provider == "gemini"
