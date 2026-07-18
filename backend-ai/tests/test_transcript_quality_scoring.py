"""Regression: Recording-3 style broken English must not score as B1."""

from app.features.scoring.service import call_quality_service
from app.features.scoring.transcript_quality import (
    compute_disfluency_penalty,
    compute_lexical_accuracy_score,
    compute_structural_grammar_score,
)

# Task-specified pair: a real broken transcript vs one clean sentence.
BROKEN_RAW = (
    "hello my name is gia roberto i have english no speak i find that inglis is is "
    "very uh stuff i think that i don't draw the right words i tried to throw bird "
    "bird 's the my english is bird some people find it my english so not too good i "
    "all i you do i age not going good english english is my good not i bend to "
    "market power buying some apples but i find people not give her good do apple "
    "good so i not take a purchase"
)
CLEAN_SIMPLE = (
    "I really enjoy learning new languages because it helps me connect with people "
    "from different cultures and understand their perspectives more deeply."
)

BROKEN = (
    "hello my name is gia roberto i have english no speak i find that inglis "
    "is is very uh stuff i think that i don't draw the right words i tried to "
    "throw bird bird 's the my english is bird some people find it my english "
    "so not too good i all i you do i age not going good english english is my "
    "good not i bend to market power buying some apples but i find people not "
    "give her good do apple good so i not take a purchase"
)

CLEAN = (
    "Hello, my name is Roberto. I am learning English and I find it difficult "
    "sometimes, but I practice every day. Yesterday I went to the market and "
    "bought some apples. People were friendly and helped me choose good fruit."
)


def test_structural_grammar_syntax_only_on_broken_transcript():
    result = compute_structural_grammar_score(BROKEN)
    assert result["measured"] is True
    # Grammar is syntax-only now: it flags the run-on's missing finite verbs,
    # but lexical misuse (odd collocations) is scored by vocabulary, not grammar.
    assert result["signals"]["missing_finite_verb_rate"] > 0
    assert result["score"] < 82  # below the unpenalized baseline


def test_structural_grammar_higher_on_clean_transcript():
    broken = compute_structural_grammar_score(BROKEN)["score"]
    clean = compute_structural_grammar_score(CLEAN)["score"]
    assert clean > broken
    assert clean >= 60


def test_cqs_grammar_not_saturated_on_broken_english():
    score = call_quality_service.compute_grammar_score([BROKEN])
    assert 0 < score < 95


def test_disfluency_penalty_delivery_only_on_broken():
    result = compute_disfluency_penalty(BROKEN)
    # Delivery-only: repetitions + fillers, and strictly higher than clean speech.
    assert result["penalty"] > compute_disfluency_penalty(CLEAN)["penalty"]
    assert "pronoun_salad_rate" not in result["signals"]
    assert "odd_collocation_rate" not in result["signals"]


def test_lexical_accuracy_penalizes_misuse():
    lex = compute_lexical_accuracy_score(BROKEN, depth_score=80.0)
    assert lex["score"] < 55


def test_fluency_blends_disfluency_with_azure_pace():
    pqs = {
        "mean_fluency": 88.0,
        "mean_accuracy": 89.0,
        "combined_error_rate": 0.33,
        "pqs": 60.0,
    }
    flu = call_quality_service.compute_fluency_signal(pqs, [BROKEN])
    # Must not stay near raw Azure 88 (capped by weak pronunciation/pqs).
    assert flu < 80


# --- De-triple-count factoring: each signal owned by exactly one pillar ---

def test_vocab_broken_below_clean_and_not_floored():
    vocab_broken = compute_lexical_accuracy_score(BROKEN_RAW, depth_score=80.0)["score"]
    vocab_clean = compute_lexical_accuracy_score(CLEAN_SIMPLE, depth_score=80.0)["score"]
    assert vocab_broken < vocab_clean
    # Capped penalties: broken must NOT collapse to the floor of 5.
    assert vocab_broken > 15


def test_vocab_no_floor_slam_when_odd_but_strong_depth_ttr():
    # odd_collocation_rate == 1.0 but strong depth (~85) + high TTR.
    text = "throw bird bird bend to power buying going good do apple age not is bird"
    from app.features.scoring.transcript_quality import odd_collocation_rate, tokenize

    assert odd_collocation_rate(tokenize(text)) == 1.0
    # Strong depth + high TTR: capped odd penalty (max 30) cannot floor-slam.
    result = compute_lexical_accuracy_score(text, depth_score=100.0)
    assert result["score"] > 40
    # Even at moderate depth it stays well off the floor of 5.
    assert compute_lexical_accuracy_score(text, depth_score=85.0)["score"] > 30


def test_grammar_broken_below_clean():
    grammar_broken = compute_structural_grammar_score(BROKEN_RAW)["score"]
    grammar_clean = compute_structural_grammar_score(CLEAN_SIMPLE)["score"]
    assert grammar_broken < grammar_clean


def test_grammar_signals_have_no_wordchoice_or_delivery_keys():
    signals = compute_structural_grammar_score(BROKEN_RAW)["signals"]
    for banned in ("odd_collocation_rate", "repetition_rate", "filler_rate"):
        assert banned not in signals
    assert "missing_finite_verb_rate" in signals


def test_disfluency_broken_above_clean_and_delivery_only():
    pen_broken = compute_disfluency_penalty(BROKEN_RAW)
    pen_clean = compute_disfluency_penalty(CLEAN_SIMPLE)
    assert pen_broken["penalty"] > pen_clean["penalty"]
    for banned in ("odd_collocation_rate", "pronoun_salad_rate"):
        assert banned not in pen_broken["signals"]
        assert banned not in pen_clean["signals"]
