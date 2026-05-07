"""Integration-style checks for Layer 2 phoneme distance (CMU + g2p-en fallback)."""

import pytest

from app.features.pronunciation.pronunciation_detector import (
    PHONEME_SUBSTITUTION_MAX_DISTANCE,
    _phoneme_edit_distance,
    _run_phoneme_distance_pass,
    _run_nbest_word_substitution_check,
)
from app.features.pronunciation.g2p_fallback import g2p_phonemes
from app.features.pronunciation.routes import _check_audio_quality
import numpy as np
import io
import wave


def _g2p_ready() -> bool:
    """True when g2p-en can produce ARPABET tokens."""
    try:
        tokens = g2p_phonemes("hello")
        return len(tokens) > 0
    except Exception:
        return False


requires_g2p = pytest.mark.skipif(
    not _g2p_ready(),
    reason="g2p-en package required (pip install g2p-en)",
)


def test_phoneme_edit_distance_verry_very_cmu_both_in_dict():
    """CMU lists verry/very with identical phones — distance 0, no g2p needed."""
    assert _phoneme_edit_distance("verry", "very") == 0


def test_phoneme_edit_distance_cat_cut_cmu():
    """Both words in CMU — pure ARPABET path."""
    d = _phoneme_edit_distance("cat", "cut")
    assert d is not None
    assert d >= 1


@requires_g2p
def test_phoneme_edit_distance_pepul_people_ipa_aligned():
    """Non-dictionary form vs reference: g2p-en path for both; distance within Layer 2 cap."""
    d = _phoneme_edit_distance("pepul", "people")
    assert d is not None
    assert d <= PHONEME_SUBSTITUTION_MAX_DISTANCE


@requires_g2p
def test_layer2_flags_pepul_against_reference_people():
    """Spoken token not in reference but phonetically close → phoneme_substitution."""
    out = _run_phoneme_distance_pass(["pepul"], {"people"})
    assert len(out) == 1
    assert out[0]["spoken"] == "pepul"
    assert out[0]["correct"] == "people"
    assert out[0]["rule_category"] == "phoneme_substitution"


def test_layer3_nbest_substitution():
    """N-Best word substitution catches 'berry'→'very'."""
    words = [
        {
            "Word": "berry",
            "PronunciationAssessment": {"AccuracyScore": 85.0, "ErrorType": "None"},
            "Phonemes": [],
            "NBest": [
                {"Word": "berry", "Confidence": 85.0},
                {"Word": "very", "Confidence": 82.0},
            ],
        },
    ]
    flags = _run_nbest_word_substitution_check({}, words, {"very"})
    assert len(flags) == 1
    assert flags[0]["spoken"] == "berry"
    assert flags[0]["correct"] == "very"
    assert flags[0]["rule_category"] == "nbest_word_substitution"


def test_layer3_nbest_no_false_positive_when_top_in_reference():
    """If top word is already correct, no flag."""
    words = [
        {
            "Word": "very",
            "PronunciationAssessment": {"AccuracyScore": 90.0, "ErrorType": "None"},
            "Phonemes": [],
            "NBest": [
                {"Word": "very", "Confidence": 90.0},
                {"Word": "berry", "Confidence": 82.0},
            ],
        },
    ]
    flags = _run_nbest_word_substitution_check({}, words, {"very"})
    assert len(flags) == 0


def test_layer3_top_level_nbest_substitution():
    """Azure top-level NBest alternatives should trigger Layer 3 substitution."""
    azure_result = {
        "NBest": [
            {
                "Confidence": 0.88,
                "Words": [{"Word": "berry"}],
            },
            {
                "Confidence": 0.83,
                "Words": [{"Word": "very"}],
            },
        ]
    }
    flags = _run_nbest_word_substitution_check(azure_result, [], {"very"})
    assert len(flags) == 1
    assert flags[0]["spoken"] == "berry"
    assert flags[0]["correct"] == "very"
    assert flags[0]["rule_category"] == "nbest_word_substitution"


def test_audio_quality_check_valid_sine_wave():
    """Valid 1kHz sine wave passes quality check."""
    sample_rate = 16000
    duration = 1.0
    t = np.linspace(0, duration, int(sample_rate * duration))
    sine = (np.sin(2 * np.pi * 1000 * t) * 16000).astype(np.int16)

    wav_buf = io.BytesIO()
    with wave.open(wav_buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(sine.tobytes())

    valid, msg = _check_audio_quality(wav_buf.getvalue())
    assert valid is True
    assert not msg


def test_audio_quality_check_silence():
    """Silence is rejected."""
    sample_rate = 16000
    silence = np.zeros(sample_rate, dtype=np.int16)

    silence_buf = io.BytesIO()
    with wave.open(silence_buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(silence.tobytes())

    valid, msg = _check_audio_quality(silence_buf.getvalue())
    assert valid is False
    assert "quiet" in msg.lower()


def test_audio_quality_check_clipping():
    """Clipped/distorted audio is rejected."""
    sample_rate = 16000
    # Use maximum int16 amplitude to trigger peak > 32000 check
    clipped = np.full(sample_rate, 32767, dtype=np.int16)

    clip_buf = io.BytesIO()
    with wave.open(clip_buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(clipped.tobytes())

    valid, msg = _check_audio_quality(clip_buf.getvalue())
    assert valid is False
    assert "distorted" in msg.lower()


def test_issues_from_phonetic_raw_words_flags_low_phoneme_despite_high_word_score():
    """Azure may omit Mispronunciation while one phoneme score is still weak."""
    from app.features.tutor.pronunciation_capture import issues_from_phonetic_context

    pc = {
        "words": [
            {
                "Word": "water",
                "PronunciationAssessment": {"AccuracyScore": 82, "ErrorType": "None"},
                "Phonemes": [
                    {"Phoneme": "w", "PronunciationAssessment": {"AccuracyScore": 45}},
                    {"Phoneme": "ao", "PronunciationAssessment": {"AccuracyScore": 95}},
                ],
            }
        ]
    }
    out = issues_from_phonetic_context(pc)
    assert len(out) == 1
    assert out[0]["word"] == "water"
    assert out[0]["worst_phoneme"] == "w"
    assert out[0]["worst_phoneme_score"] == 45.0


def test_issues_from_phonetic_raw_words_skips_when_word_and_phonemes_above_threshold():
    from app.features.tutor.pronunciation_capture import issues_from_phonetic_context

    pc = {
        "words": [
            {
                "Word": "water",
                "PronunciationAssessment": {"AccuracyScore": 92, "ErrorType": "None"},
                "Phonemes": [
                    {"Phoneme": "w", "PronunciationAssessment": {"AccuracyScore": 90}},
                    {"Phoneme": "ao", "PronunciationAssessment": {"AccuracyScore": 94}},
                ],
            }
        ]
    }
    assert issues_from_phonetic_context(pc) == []

