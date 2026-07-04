"""Unit tests for pronunciation coaching TTS narration scripts."""

from app.features.tts.narration_service import (
    build_pronunciation_script,
    coaching_line,
    slow_words_from_errors,
)


def test_build_pronunciation_script_spoken_differs_includes_both_words():
    script = build_pronunciation_script(
        70,
        None,
        [
            {
                "spoken": "dat",
                "correct": "that",
                "rule_category": "th_to_d",
            }
        ],
    )
    assert "dat" in script
    assert "that" in script
    assert "You said" in script
    assert "Try saying" in script
    assert "Your pronunciation score is 70 out of 100." in script
    # Dominant tip once at end (th_to_d)
    assert "tongue" in script.lower()


def test_build_pronunciation_script_spoken_equals_correct_still_coaches():
    script = build_pronunciation_script(
        70,
        None,
        [
            {
                "spoken": "think",
                "correct": "think",
                "rule_category": "th_to_d",
            }
        ],
    )
    assert "Your pronunciation score is 70 out of 100." in script
    assert "think" in script
    assert "wasn't clear" in script
    assert "Say 'think' like this" in script
    assert "tongue" in script.lower()


def test_build_pronunciation_script_no_errors_score_and_closing_only():
    script = build_pronunciation_script(85, None, None)
    assert script.startswith("Your pronunciation score is 85 out of 100.")
    assert "Excellent work" in script
    assert "You said" not in script
    assert "Try saying" not in script


def test_build_pronunciation_script_empty_errors_score_and_closing_only():
    script = build_pronunciation_script(60, None, [])
    assert script.startswith("Your pronunciation score is 60 out of 100.")
    assert "You said" not in script
    assert "Try saying" not in script


def test_build_pronunciation_script_includes_up_to_two_errors():
    errors = [
        {"spoken": "is", "correct": "his", "rule_category": "general_mispronunciation"},
        {"spoken": "tin", "correct": "thin", "rule_category": "th_to_t"},
        {"spoken": "bery", "correct": "very", "rule_category": "v_to_b"},
    ]
    script = build_pronunciation_script(50, None, errors)
    assert "You said 'is'" in script
    assert "You said 'tin'" in script
    assert "You said 'bery'" not in script
    # Tip only once (dominant = first issue), not per-line tips in coaching lines
    assert script.count("Listen to a native speaker") == 1


def test_coaching_line_spoken_equals_correct_not_none():
    line = coaching_line("think", "think", "th_to_d")
    assert line is not None
    assert "think" in line
    assert "wasn't clear" in line
    assert "Say 'think' like this" in line
    assert "tongue" not in line.lower()  # tip not in line by default


def test_coaching_line_spoken_differs():
    line = coaching_line("dat", "that", "th_to_d")
    assert line is not None
    assert "dat" in line
    assert "that" in line
    assert "You said" in line
    assert "Try saying" in line


def test_coaching_line_empty_returns_none():
    assert coaching_line("", "", "th_to_d") is None
    assert coaching_line(None, None) is None


def test_slow_words_from_errors_unique_correct_only():
    words = slow_words_from_errors(
        [
            {"spoken": "is", "correct": "his"},
            {"spoken": "iz", "correct": "his"},
            {"spoken": "tin", "correct": "thin"},
            {"spoken": "x", "correct": "very"},
        ],
        limit=2,
    )
    assert words == ["his", "thin"]
