"""
Pronunciation pipeline validation script.

Usage:
    PRON_DEBUG=1 python scripts/test_pronunciation.py [path/to/audio.wav]

If no audio file is provided a 2-second silence WAV is generated as a placeholder.
The script validates each layer of the pipeline without requiring a live call.

Pass criteria (from task spec):
  - [Azure raw] payload shows AccuracyScore < 70 for deliberately mispronounced words
  - [Pulse] capture layers shows phonetic_ctx >= 1
  - merged count > 0
"""
from __future__ import annotations

import os
import sys
import json
import struct
import wave
import io
import logging

# Allow running from repo root: python scripts/test_pronunciation.py
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("test_pronunciation")

# ── Ensure PRON_DEBUG is set so the Azure raw payload is printed ──────────
os.environ.setdefault("PRON_DEBUG", "1")


def _make_silence_wav(duration_s: float = 2.0, sample_rate: int = 16000) -> bytes:
    """Generate a minimal silent WAV (16-bit, 16 kHz, mono)."""
    n_samples = int(duration_s * sample_rate)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(struct.pack("<" + "h" * n_samples, *([0] * n_samples)))
    return buf.getvalue()


def main() -> None:
    audio_path = sys.argv[1] if len(sys.argv) > 1 else None

    if audio_path:
        with open(audio_path, "rb") as f:
            audio_bytes = f.read()
        logger.info("Loaded audio: %s (%d bytes)", audio_path, len(audio_bytes))
    else:
        audio_bytes = _make_silence_wav()
        logger.info("No audio file provided — using %d bytes of generated silence (placeholder)", len(audio_bytes))
        logger.warning("Silence will return empty transcription; real pronunciation errors need a real WAV.")

    # ── Step 1: transcribe_with_soft_assessment ───────────────────────────
    print("\n" + "=" * 70)
    print("STEP 1: transcribe_with_soft_assessment (PRON_DEBUG=1)")
    print("=" * 70)

    try:
        from app.features.transcription.hinglish_stt_service import HinglishSTTService
        svc = HinglishSTTService()
        result = svc.transcribe_with_soft_assessment(audio_bytes)

        print(f"\nNormalized transcript : {result.get('text')!r}")
        pi = result.get("phonetic_insights")
        print(f"phonetic_insights keys: {list(pi.keys()) if pi else 'None'}")

        raw_words = (pi or {}).get("words", [])
        print(f"\nRaw words returned    : {len(raw_words)}")
        for i, w in enumerate(raw_words[:10]):
            print(f"  [{i}] word={w.get('Word')!r:20s}  AccuracyScore={w.get('AccuracyScore')}  ErrorType={w.get('ErrorType')}  phonemes={len(w.get('Phonemes', []))}")
        if len(raw_words) > 10:
            print(f"  ... ({len(raw_words) - 10} more)")

        phonetic_context = pi or {}

    except Exception as e:
        logger.error("transcribe_with_soft_assessment failed: %s", e, exc_info=True)
        phonetic_context = {}

    # ── Step 2: build_turn_capture ────────────────────────────────────────
    print("\n" + "=" * 70)
    print("STEP 2: build_turn_capture")
    print("=" * 70)

    # Synthetic Gemini response containing a PRON tag for "vater"→"water"
    test_gemini_response = (
        'Aapne kaha "vater" — '
        '[PRON: heard="vater" correct="water" rule="v_w_confusion"] '
        "Practice the W sound by rounding your lips."
    )
    test_transcript = "I drink vater every day and tink about it"

    print(f"\nTest transcript : {test_transcript!r}")
    print(f"Gemini response : {test_gemini_response!r}")

    try:
        from app.features.tutor.pronunciation_capture import build_turn_capture
        merged = build_turn_capture(
            gemini_full_response=test_gemini_response,
            user_transcript=test_transcript,
            phonetic_context=phonetic_context,
        )
        print(f"\nMerged issues ({len(merged)} total):")
        for issue in merged:
            print(f"  word={issue.get('word')!r:15s}  heard={issue.get('heard')!r:15s}  rule={issue.get('rule_category')}  severity={issue.get('severity')}")

        if len(merged) == 0:
            print("\n⚠  merged=0 — check which layer is returning zero above.")
        else:
            print(f"\n✓  merged={len(merged)}")

    except Exception as e:
        logger.error("build_turn_capture failed: %s", e, exc_info=True)

    # ── Step 3: detect_from_azure_result (pronunciation detector) ─────────
    print("\n" + "=" * 70)
    print("STEP 3: detect_from_azure_result (pronunciation_detector)")
    print("=" * 70)

    # Synthetic Azure PA result for "vater" in free-speech mode
    synthetic_azure = {
        "NBest": [{
            "Words": [
                {
                    "Word": "vater",
                    "PronunciationAssessment": {"AccuracyScore": 42, "ErrorType": "Mispronunciation"},
                    "Phonemes": [],
                },
                {
                    "Word": "tink",
                    "PronunciationAssessment": {"AccuracyScore": 38, "ErrorType": "Mispronunciation"},
                    "Phonemes": [],
                },
                {
                    "Word": "englis",
                    "PronunciationAssessment": {"AccuracyScore": 55, "ErrorType": "Mispronunciation"},
                    "Phonemes": [],
                },
                {
                    "Word": "pepul",
                    "PronunciationAssessment": {"AccuracyScore": 60, "ErrorType": "Mispronunciation"},
                    "Phonemes": [],
                },
            ]
        }]
    }

    try:
        from app.features.pronunciation.pronunciation_detector import detect_from_azure_result
        flagged = detect_from_azure_result(synthetic_azure, reference_text="")
        print(f"\nFlagged errors from synthetic Azure result ({len(flagged)}):")
        for err in flagged:
            print(f"  spoken={err.get('spoken')!r:15s}  correct={err.get('correct')!r:15s}  rule={err.get('rule_category')}  confidence={err.get('confidence')}")

        if len(flagged) == 0:
            print("\n⚠  No errors flagged — check detector layers.")
        else:
            print(f"\n✓  {len(flagged)} error(s) flagged")

    except Exception as e:
        logger.error("detect_from_azure_result failed: %s", e, exc_info=True)

    print("\n" + "=" * 70)
    print("Done. Check logs above for [Azure raw], [Pulse], and flagged errors.")
    print("=" * 70)


if __name__ == "__main__":
    main()
