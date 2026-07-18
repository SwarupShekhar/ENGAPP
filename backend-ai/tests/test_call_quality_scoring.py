"""Tests for CallQualityService PQS and fluency scoring."""

from app.features.scoring.service import call_quality_service


def _utterance_with_words(words, fluency=80.0, prosody=75.0):
    return {
        "NBest": [
            {
                "PronunciationAssessment": {
                    "FluencyScore": fluency,
                    "ProsodyScore": prosody,
                },
                "Words": words,
            }
        ]
    }


def test_high_word_accuracy_weak_phoneme_yields_low_pqs():
    """Word accuracy can stay high while weak phonemes should drag PQS down."""
    utterances = [
        _utterance_with_words(
            [
                {
                    "Word": "hello",
                    "PronunciationAssessment": {"AccuracyScore": 82.0},
                    "Phonemes": [
                        {"Phoneme": "h", "AccuracyScore": 90.0},
                        {"Phoneme": "eh", "AccuracyScore": 45.0},
                        {"Phoneme": "l", "AccuracyScore": 80.0},
                    ],
                },
                {
                    "Word": "world",
                    "PronunciationAssessment": {"AccuracyScore": 84.0},
                    "Phonemes": [
                        {"Phoneme": "w", "AccuracyScore": 88.0},
                        {"Phoneme": "er", "AccuracyScore": 42.0},
                        {"Phoneme": "l", "AccuracyScore": 85.0},
                        {"Phoneme": "d", "AccuracyScore": 80.0},
                    ],
                },
            ]
        )
    ]

    result = call_quality_service.compute_pronunciation_quality_score(utterances)

    assert result["phoneme_issue_rate"] == 1.0
    assert result["combined_error_rate"] == 1.0
    assert result["pqs"] < 60.0
    assert result["mean_accuracy"] > 80.0


def test_mispronunciation_error_type_is_penalized():
    utterances = [
        _utterance_with_words(
            [
                {
                    "Word": "berry",
                    "PronunciationAssessment": {
                        "AccuracyScore": 10.0,
                        "ErrorType": "Mispronunciation",
                    },
                    "Phonemes": [{"Phoneme": "b", "AccuracyScore": 5.0}],
                }
            ],
            fluency=45.0,
            prosody=40.0,
        )
    ]

    result = call_quality_service.compute_pronunciation_quality_score(utterances)

    assert result["mispronunciation_rate"] == 1.0
    assert result["combined_error_rate"] == 1.0
    assert result["pqs"] < 60.0


def test_no_utterances_returns_zeros():
    result = call_quality_service.compute_pronunciation_quality_score([])

    assert result["pqs"] == 0.0
    assert result["mean_accuracy"] == 0.0
    assert result["mean_fluency"] == 0.0
    assert result["mean_prosody"] == 0.0
    assert result["mispronunciation_rate"] == 0.0
    assert result["phoneme_issue_rate"] == 0.0
    assert result["combined_error_rate"] == 0.0
    assert result["word_count"] == 0
