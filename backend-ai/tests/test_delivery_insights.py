"""Tests for delivery insight selection rules (phase 1.5)."""
from app.features.pronunciation.delivery_insights import build_delivery_insights
from app.features.pronunciation.librosa_features import compute_delivery_confidence


def test_delivery_confidence_formula():
    # pause_ratio=0.4, pitch=20 -> 100 - 20 - 7.5 = 72.5
    assert compute_delivery_confidence(20.0, 0.4) == 72.5
    # High pause, flat pitch -> low confidence
    low = compute_delivery_confidence(10.0, 0.85)
    assert low < 45.0


def test_all_problems_capped_with_affirming():
    features = {
        "pitch_variance": 15.0,
        "pause_ratio": 0.5,
        "energy_level": 20.0,
        "duration_sec": 10.0,
    }
    insights = build_delivery_insights(features, wpm=90.0)
    assert 2 <= len(insights) <= 4
    severities = [i["severity"] for i in insights]
    assert "info" in severities  # at least one affirming when problems stack
    assert sum(1 for s in severities if s in ("tip", "focus")) <= 3


def test_no_problems_shows_affirming_only():
    features = {
        "pitch_variance": 35.0,
        "pause_ratio": 0.15,
        "energy_level": 50.0,
        "duration_sec": 8.0,
    }
    insights = build_delivery_insights(features, wpm=145.0)
    assert len(insights) >= 2
    assert all(i["severity"] == "info" for i in insights)


def test_zero_problems_no_affirming_still_one_bullet():
    features = {
        "pitch_variance": 28.0,
        "pause_ratio": 0.3,
        "energy_level": 35.0,
        "duration_sec": 5.0,
    }
    insights = build_delivery_insights(features, wpm=110.0)
    assert len(insights) >= 1
