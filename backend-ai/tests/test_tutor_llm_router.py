from unittest.mock import patch

from app.features.tutor.llm.router import resolve_tutor_llm_provider


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
