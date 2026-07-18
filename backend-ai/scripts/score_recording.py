"""
Validation harness: score a free-speech audio clip through the SAME pillar
functions the live CQS path uses, and print the full breakdown.

Reference-less (unscripted) Azure Pronunciation Assessment over the whole clip
via continuous recognition, then PQS / grammar / fluency / vocabulary via
CallQualityService, then the (cap-free) overall formula that mirrors
backend-nest/src/modules/scoring/scoring.service.ts after the 2026-07-18 refactor.

Usage:
    python3 scripts/score_recording.py "/abs/path/New Recording 4.m4a"
"""

from __future__ import annotations

import io
import json
import os
import sys
import threading
from typing import Any, Dict, List

from dotenv import load_dotenv

_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND_AI = os.path.dirname(_HERE)
load_dotenv(os.path.join(_BACKEND_AI, ".env"))
sys.path.insert(0, _BACKEND_AI)

import azure.cognitiveservices.speech as speechsdk  # noqa: E402
from pydub import AudioSegment  # noqa: E402


def to_wav_16k_mono(path: str) -> bytes:
    seg = AudioSegment.from_file(path)
    seg = seg.set_frame_rate(16000).set_channels(1)
    buf = io.BytesIO()
    seg.export(buf, format="wav")
    return buf.getvalue()


def assess_unscripted(audio_bytes: bytes) -> Dict[str, Any]:
    """Continuous, reference-less PA over the whole clip."""
    key = os.environ["AZURE_SPEECH_KEY"]
    region = os.environ["AZURE_SPEECH_REGION"]

    config = speechsdk.SpeechConfig(subscription=key, region=region)
    config.speech_recognition_language = "en-US"
    config.output_format = speechsdk.OutputFormat.Detailed
    config.set_property(
        speechsdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, "8000"
    )
    config.set_property(
        speechsdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, "1500"
    )

    stream = speechsdk.audio.PushAudioInputStream()
    audio_config = speechsdk.audio.AudioConfig(stream=stream)

    pa = speechsdk.PronunciationAssessmentConfig(
        reference_text="",
        grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
        granularity=speechsdk.PronunciationAssessmentGranularity.Phoneme,
        enable_miscue=False,
    )
    pa.json_string = json.dumps({"NBestPhonemeCount": 5, "WordLevelTiming": True})
    pa.enable_prosody_assessment()

    recognizer = speechsdk.SpeechRecognizer(
        speech_config=config, audio_config=audio_config
    )
    pa.apply_to(recognizer)

    utterances: List[Dict[str, Any]] = []
    texts: List[str] = []
    errors: List[str] = []
    done = threading.Event()

    def on_recognized(evt):
        if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
            raw = evt.result.properties.get(
                speechsdk.PropertyId.SpeechServiceResponse_JsonResult
            )
            if raw:
                detailed = json.loads(raw)
                if detailed.get("NBest"):
                    utterances.append(detailed)
                    texts.append(detailed["NBest"][0].get("Display", evt.result.text))
        elif evt.result.reason == speechsdk.ResultReason.Canceled:
            cd = evt.result.cancellation_details
            if cd.reason == speechsdk.CancellationReason.Error:
                errors.append(cd.error_details)

    recognizer.recognized.connect(on_recognized)
    recognizer.session_stopped.connect(lambda e: done.set())
    recognizer.canceled.connect(lambda e: done.set())

    recognizer.start_continuous_recognition()
    chunk = 4096
    for i in range(0, len(audio_bytes), chunk):
        stream.write(audio_bytes[i : i + chunk])
    stream.close()
    finished = done.wait(timeout=300)
    recognizer.stop_continuous_recognition()

    if errors:
        raise RuntimeError(f"Azure canceled: {errors[0]}")
    if not finished:
        raise RuntimeError("Azure timed out")
    if not utterances:
        raise ValueError("No speech recognized")

    return {"utterances": utterances, "full_text": " ".join(texts).strip()}


def build_azure_results(utterances: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Shape utterances for compute_pronunciation_quality_score (reads NBest[0])."""
    out = []
    for det in utterances:
        nbest0 = det["NBest"][0]
        out.append({"NBest": [nbest0]})
    return out


def build_weak_phoneme_map(utterances) -> Dict[str, list]:
    """word(lower) -> list of {phoneme, accuracy} below the weak threshold."""
    out: Dict[str, list] = {}
    for det in utterances:
        for w in det["NBest"][0].get("Words", []):
            tok = (w.get("Word") or "").lower().strip()
            if not tok or tok in out:
                continue
            weak = []
            for ph in w.get("Phonemes", []) or []:
                pa = ph.get("PronunciationAssessment") or {}
                score = pa.get("AccuracyScore")
                if score is None:
                    score = ph.get("AccuracyScore") or ph.get("Score")
                if score is not None and float(score) < 70.0:
                    weak.append({"phoneme": ph.get("Phoneme", ""), "accuracy": float(score)})
            if weak:
                out[tok] = weak
    return out


def run_detector(azure_results, full_text, weak_phonemes):
    """Multi-layer mispronunciation detector → named errors + phoneme evidence."""
    try:
        from app.features.pronunciation.pronunciation_detector import (
            detect_from_azure_result,
        )
        from app.features.scoring.transcript_quality import proper_noun_skip_set

        proper = frozenset(proper_noun_skip_set(full_text))
        flagged = []
        for utt in azure_results:
            flagged.extend(
                detect_from_azure_result(utt, proper_nouns=proper) or []
            )
        by_cat: Dict[str, int] = {}
        samples = []
        for f in flagged:
            cat = f.get("rule_category") or f.get("error_type") or "other"
            by_cat[cat] = by_cat.get(cat, 0) + 1
            if len(samples) < 12:
                spoken = f.get("spoken") or f.get("word")
                correct = f.get("correct")
                sample = {"spoken": spoken, "correct": correct, "category": cat}
                # Explainability: when word text looks identical (or as phoneme
                # evidence in general), surface the actual weak phonemes so the
                # evidence trail isn't just a category label with no visible proof.
                weak = weak_phonemes.get((correct or spoken or "").lower()) or weak_phonemes.get(
                    (spoken or "").lower()
                )
                if weak:
                    sample["weak_phonemes"] = weak
                samples.append(sample)
        return {"flagged_count": len(flagged), "by_category": by_cat, "samples": samples}
    except Exception as e:  # noqa: BLE001
        return {"error": f"{type(e).__name__}: {e}"}


def run_librosa_prosody(path: str) -> Dict[str, Any]:
    import librosa
    import numpy as np

    y, sr = librosa.load(path)
    dur = librosa.get_duration(y=y, sr=sr)
    f0, _, _ = librosa.pyin(
        y, fmin=librosa.note_to_hz("C2"), fmax=librosa.note_to_hz("C7")
    )
    f0c = f0[~np.isnan(f0)]
    pstd = float(np.std(f0c)) if len(f0c) else 0.0
    ns = librosa.effects.split(y, top_db=25)
    voiced = sum(e - s for s, e in ns) / sr
    pause_ratio = (dur - voiced) / dur if dur > 0 else 0.0
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    tempo = float(tempo)
    score = min(100.0, (pstd / 50.0 * 40) + (tempo / 150.0 * 40) + ((1 - pause_ratio) * 20))
    return {
        "librosa_prosody_score": round(score, 1),
        "pitch_variance": round(pstd, 1),
        "tempo_bpm": round(tempo, 0),
        "pause_ratio": round(pause_ratio, 2),
    }


def main(path: str) -> None:
    import asyncio

    from app.features.scoring.service import call_quality_service as svc

    wav = to_wav_16k_mono(path)
    azure = assess_unscripted(wav)
    utterances = azure["utterances"]
    full_text = azure["full_text"]
    azure_results = build_azure_results(utterances)
    user_turns = [full_text]

    pqs = svc.compute_pronunciation_quality_score(azure_results)
    ds = svc.compute_depth_score(user_turns)
    cs = svc.compute_complexity_score(full_text)

    grammar_meta = asyncio.run(svc.compute_grammar_score_llm(user_turns))
    grammar_measured = bool(grammar_meta.get("measured", False))
    grammar = float(grammar_meta["score"]) if grammar_measured else None
    fluency = svc.compute_fluency_signal(pqs, user_turns)
    vocabulary = svc.compute_vocabulary_signal(user_turns, ds)

    weak_phonemes = build_weak_phoneme_map(utterances)
    detector = run_detector(azure_results, full_text, weak_phonemes)
    prosody_librosa = (
        run_librosa_prosody(path) if os.environ.get("WITH_LIBROSA") == "1" else "skipped (set WITH_LIBROSA=1)"
    )

    pron = float(pqs["pqs"])
    pron_measured = pqs["word_count"] > 0 and pron > 0
    # Mirror scoring.service.ts: overall = weighted sum over MEASURED pillars only,
    # renormalized. Unmeasured grammar (LLM fallback) / pronunciation are dropped.
    weight_defs = [
        ("fluency", fluency, 0.25, True),
        ("grammar", grammar or 0.0, 0.22, grammar_measured),
        ("pronunciation", pron, 0.22, pron_measured),
        ("vocabulary", vocabulary, 0.18, True),
    ]
    active = sum(v * w for _, v, w, m in weight_defs if m)
    wsum = sum(w for _, _, w, m in weight_defs if m)
    overall = round(active / wsum) if wsum > 0 else 0

    from app.features.scoring.transcript_quality import (
        compute_structural_grammar_score,
        compute_disfluency_penalty,
        compute_lexical_accuracy_score,
    )

    report = {
        "file": os.path.basename(path),
        "word_count_azure": pqs["word_count"],
        "transcript": full_text,
        "pillars": {
            "pronunciation": round(pron, 2) if pron_measured else "not_measured",
            "fluency": round(fluency, 2),
            "grammar": round(grammar, 2) if grammar_measured else "not_measured",
            "vocabulary": round(vocabulary, 2),
            "comprehension": "not_measured",
            "overall": overall,
        },
        "grammar_meta": grammar_meta,
        "pqs_detail": pqs,
        "mispronunciation_detector": detector,
        "prosody_azure": pqs.get("mean_prosody"),
        "prosody_librosa": prosody_librosa,
        "depth_score_ds": ds,
        "complexity_cs": cs,
        "grammar_signals_structural": compute_structural_grammar_score(full_text)["signals"],
        "disfluency_signals": compute_disfluency_penalty(full_text)["signals"],
        "vocab_signals": compute_lexical_accuracy_score(full_text, depth_score=ds)[
            "signals"
        ],
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main(sys.argv[1])
