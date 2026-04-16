"""Integration-style checks for Layer 2 phoneme distance (CMU + phonemizer IPA)."""

import pytest

from app.features.pronunciation.pronunciation_detector import (
    PHONEME_SUBSTITUTION_MAX_DISTANCE,
    _phoneme_edit_distance,
    _phonemizer_fallback,
    _run_phoneme_distance_pass,
    _ensure_phonemizer,
)


def _phonemizer_espeak_ready() -> bool:
    """True when phonemizer can produce IPA tokens (espeak lib + pronouncing deps)."""
    try:
        if not _ensure_phonemizer():
            return False
        return len(_phonemizer_fallback("hello")) > 0
    except Exception:
        return False


requires_phonemizer_espeak = pytest.mark.skipif(
    not _phonemizer_espeak_ready(),
    reason="phonemizer + espeak-ng required (e.g. PHONEMIZER_ESPEAK_LIBRARY on macOS Homebrew)",
)


def test_phoneme_edit_distance_verry_very_cmu_both_in_dict():
    """CMU lists verry/very with identical phones — distance 0, no espeak needed."""
    assert _phoneme_edit_distance("verry", "very") == 0


def test_phoneme_edit_distance_cat_cut_cmu():
    """Both words in CMU — pure ARPABET path."""
    d = _phoneme_edit_distance("cat", "cut")
    assert d is not None
    assert d >= 1


@requires_phonemizer_espeak
def test_phoneme_edit_distance_pepul_people_ipa_aligned():
    """Non-dictionary form vs reference: IPA path for both; distance within Layer 2 cap."""
    d = _phoneme_edit_distance("pepul", "people")
    assert d is not None
    assert d <= PHONEME_SUBSTITUTION_MAX_DISTANCE


@requires_phonemizer_espeak
def test_layer2_flags_pepul_against_reference_people():
    """Spoken token not in reference but phonetically close → phoneme_substitution."""
    out = _run_phoneme_distance_pass(["pepul"], {"people"})
    assert len(out) == 1
    assert out[0]["spoken"] == "pepul"
    assert out[0]["correct"] == "people"
    assert out[0]["rule_category"] == "phoneme_substitution"
