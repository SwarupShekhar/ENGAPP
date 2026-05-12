"""
Batch test script — 10 audio files against backend-ai endpoints.

Endpoints tested (sequential per file):
  1. POST /api/transcribe       — base64 audio → transcript
  2. POST /api/analyze          — transcript → CEFR/metrics/feedback
  3. POST /api/pronunciation/assess — multipart upload, reference_text="" (free-speech)

MD report written to: docs/audio-batch-test-2026-05-08.md
(relative to project root; run from EngR_app/ or backend-ai/)

Usage:
    python backend-ai/scripts/run_audio_batch_test.py
    # or from inside backend-ai/:
    python scripts/run_audio_batch_test.py
"""

from __future__ import annotations

import base64
import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

import requests

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

_RUN_DATE = datetime.now().strftime("%Y-%m-%d")

BACKEND_URL = "http://localhost:8001"
TIMEOUT = 120  # seconds per request — Azure PA on 60s audio is slow

# Resolve the backend-ai directory regardless of where the script is run from
SCRIPT_DIR = Path(__file__).resolve().parent  # .../backend-ai/scripts
BACKEND_AI_DIR = SCRIPT_DIR.parent            # .../backend-ai
PROJECT_ROOT = BACKEND_AI_DIR.parent          # .../EngR_app

# Audio files are all inside backend-ai/
AUDIO_FILES = [
    "Rizwi_Naqui_clean.wav",
    "Fezan Khan_Voice sample_International Sales Specialist.ogg",
    "Satyam Yadav_International Sales Specialist.ogg",
    "Rohit Kumar_Voice Recording_Educational Counsellor.ogg",
    "Suraj Kumar_International Sales Specialist.ogg",
]

# MD output goes to top-level docs/
DOCS_DIR = PROJECT_ROOT / "docs"
REPORT_PATH = DOCS_DIR / f"audio-batch-test-{_RUN_DATE}.md"

USER_ID = "batch-test"
SESSION_ID = "batch-001"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def extract_speaker_name(filename: str) -> str:
    """
    Parse the speaker name from the filename.
    'Fezan Khan_Voice sample_...' → 'Fezan Khan'
    'Rizwi_Naqui_clean.wav'      → 'Rizwi Naqui'
    'New Recording.m4a'          → 'New Recording'
    'test_10.wav.m4a'            → 'test 10.wav'
    """
    stem = Path(filename).stem  # drop extension
    # Drop the suffix portion after the first recognisable role keyword
    role_keywords = [
        "International Sales Specialist",
        "Educational Counsellor",
        "Education Counsellor",
        "Voice sample",
        "Voice Recording",
        "_clean",
    ]
    for kw in role_keywords:
        idx = stem.find(kw)
        if idx != -1:
            stem = stem[:idx]
    stem = stem.strip("_- ")
    # Replace remaining underscores with spaces
    stem = stem.replace("_", " ").strip()
    return stem if stem else filename


def is_fallback_scores(metrics: dict) -> bool:
    """Return True if the analyze response looks like a Gemini fallback (all 50s)."""
    score_keys = ["grammar_score", "vocabulary_score", "pronunciation_score", "fluency_score"]
    present = [metrics.get(k) for k in score_keys if k in metrics]
    if not present:
        return False
    return all(v == 50 for v in present)


def pct(val: float | None) -> str:
    """Format a 0-1 confidence as a percentage string, or a 0-100 score as-is."""
    if val is None:
        return "N/A"
    if val < 1.0:
        return f"{val * 100:.0f}%"
    return f"{val:.0f}%"


def fmt_score(val: float | None, fallback: bool = False) -> str:
    if val is None:
        return "N/A"
    s = f"{val:.0f}/100"
    if fallback:
        s += " ⚠ FALLBACK"
    return s


def run_transcribe(audio_path: Path) -> dict[str, Any]:
    """POST /api/transcribe with base64-encoded audio."""
    raw = audio_path.read_bytes()
    b64 = base64.b64encode(raw).decode("utf-8")
    payload = {
        "audio_base64": b64,
        "user_id": USER_ID,
        "session_id": SESSION_ID,
    }
    resp = requests.post(
        f"{BACKEND_URL}/api/transcribe",
        json=payload,
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()


def run_analyze(
    transcript: str,
    pa_flagged_errors: list[dict] | None = None,
    pa_pronunciation_score: float | None = None,
    pa_fluency_score: float | None = None,
    pa_prosody_score: float | None = None,
    secondary_text: str | None = None,
) -> dict[str, Any]:
    """POST /api/analyze with the transcript text and optional PA errors."""
    payload: dict[str, Any] = {
        "text": transcript,
        "user_id": USER_ID,
        "session_id": SESSION_ID,
    }
    if pa_flagged_errors:
        payload["pa_flagged_errors"] = pa_flagged_errors
    if pa_pronunciation_score is not None:
        payload["pa_pronunciation_score"] = pa_pronunciation_score
    if pa_fluency_score is not None:
        payload["pa_fluency_score"] = pa_fluency_score
    if pa_prosody_score is not None:
        payload["pa_prosody_score"] = pa_prosody_score
    if secondary_text:
        payload["secondary_text"] = secondary_text
    resp = requests.post(
        f"{BACKEND_URL}/api/analyze",
        json=payload,
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()


def run_pronunciation(audio_path: Path) -> dict[str, Any]:
    """POST /api/pronunciation/assess as multipart form, reference_text='' (free-speech)."""
    with audio_path.open("rb") as f:
        files = {"audio": (audio_path.name, f, "application/octet-stream")}
        data = {"reference_text": ""}
        resp = requests.post(
            f"{BACKEND_URL}/api/pronunciation/assess",
            files=files,
            data=data,
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()


# ---------------------------------------------------------------------------
# Per-file result structure
# ---------------------------------------------------------------------------

class FileResult:
    def __init__(self, idx: int, filename: str):
        self.idx = idx
        self.filename = filename
        self.speaker = extract_speaker_name(filename)
        self.audio_path = BACKEND_AI_DIR / filename

        # Transcribe
        self.transcript_text: str | None = None
        self.transcript_secondary: str | None = None
        self.transcript_confidence: float | None = None
        self.transcript_duration: float | None = None
        self.transcript_word_count: int | None = None
        self.transcript_error: str | None = None

        # Analyze
        self.cefr_level: str | None = None
        self.grammar_score: float | None = None
        self.vocabulary_score: float | None = None
        self.wpm: float | None = None
        self.unique_words: int | None = None
        self.feedback: str | None = None
        self.strengths: list[str] = []
        self.improvement_areas: list[str] = []
        self.analyze_fallback: bool = False
        self.analyze_error: str | None = None

        # Pronunciation
        self.pron_score: float | None = None
        self.pron_cefr_cap: str | None = None
        self.pron_cap_reason: str | None = None
        self.fluency_score: float | None = None
        self.prosody_score: float | None = None
        self.flagged_errors: list[dict] = []
        self.pron_error: str | None = None


# ---------------------------------------------------------------------------
# Main runner
# ---------------------------------------------------------------------------

def run_batch() -> list[FileResult]:
    results: list[FileResult] = []

    for idx, filename in enumerate(AUDIO_FILES, start=1):
        fr = FileResult(idx, filename)
        results.append(fr)

        audio_path = fr.audio_path
        if not audio_path.exists():
            msg = f"File not found: {audio_path}"
            print(f"  [SKIP] {msg}")
            fr.transcript_error = msg
            fr.analyze_error = msg
            fr.pron_error = msg
            continue

        print(f"\n[{idx}/10] {fr.speaker} ({filename})")
        print(f"  File: {audio_path} ({audio_path.stat().st_size / 1024:.1f} KB)")

        # ------------------------------------------------------------------
        # 1. Transcribe
        # ------------------------------------------------------------------
        print("  -> POST /api/transcribe ...", end=" ", flush=True)
        t0 = time.time()
        try:
            resp = run_transcribe(audio_path)
            elapsed = time.time() - t0
            data = resp.get("data", {})
            fr.transcript_text = data.get("text", "")
            fr.transcript_secondary = data.get("secondary_text") or None
            fr.transcript_confidence = data.get("confidence")
            fr.transcript_duration = data.get("duration")
            words = data.get("words", [])
            fr.transcript_word_count = len(words) if words else (
                len(fr.transcript_text.split()) if fr.transcript_text else 0
            )
            print(f"OK ({elapsed:.1f}s) — {fr.transcript_word_count} words, "
                  f"conf={pct(fr.transcript_confidence)}")
        except Exception as exc:
            elapsed = time.time() - t0
            fr.transcript_error = str(exc)
            print(f"FAILED ({elapsed:.1f}s): {exc}")

        # ------------------------------------------------------------------
        # 2. Pronunciation Assessment (before analyze so errors feed into Gemini)
        # ------------------------------------------------------------------
        print("  -> POST /api/pronunciation/assess ...", end=" ", flush=True)
        t0 = time.time()
        try:
            resp = run_pronunciation(audio_path)
            elapsed = time.time() - t0
            pron_score_obj = resp.get("pronunciation_score", {})
            fr.pron_score = pron_score_obj.get("score")
            fr.pron_cefr_cap = pron_score_obj.get("cefr_cap")
            fr.pron_cap_reason = pron_score_obj.get("cap_reason", "")
            azure = resp.get("azure_result", {})
            fr.fluency_score = azure.get("fluency_score")
            fr.prosody_score = azure.get("prosody_score")
            fr.flagged_errors = resp.get("flagged_errors", [])
            print(f"OK ({elapsed:.1f}s) — pron={fr.pron_score}, "
                  f"fluency={fr.fluency_score}, errors={len(fr.flagged_errors)}")
        except Exception as exc:
            elapsed = time.time() - t0
            fr.pron_error = str(exc)
            print(f"FAILED ({elapsed:.1f}s): {exc}")

        # ------------------------------------------------------------------
        # 3. Analyze — pipe PA flagged_errors so Gemini sees specific errors
        # ------------------------------------------------------------------
        if fr.transcript_text:
            print("  -> POST /api/analyze ...", end=" ", flush=True)
            t0 = time.time()
            try:
                resp = run_analyze(
                    fr.transcript_text,
                    pa_flagged_errors=fr.flagged_errors or None,
                    pa_pronunciation_score=fr.pron_score,
                    pa_fluency_score=fr.fluency_score,
                    pa_prosody_score=fr.prosody_score,
                    secondary_text=fr.transcript_secondary,
                )
                elapsed = time.time() - t0
                data = resp.get("data", {})
                cefr = data.get("cefr_assessment", {})
                fr.cefr_level = cefr.get("level")
                metrics = data.get("metrics", {})
                fr.grammar_score = metrics.get("grammar_score")
                fr.vocabulary_score = metrics.get("vocabulary_score")
                fr.wpm = metrics.get("wpm")
                fr.unique_words = metrics.get("unique_words")
                fr.feedback = data.get("feedback", "")
                fr.strengths = data.get("strengths", [])
                fr.improvement_areas = data.get("improvement_areas", [])
                fr.analyze_fallback = is_fallback_scores(metrics)
                fallback_note = " [FALLBACK - scores unreliable]" if fr.analyze_fallback else ""
                pa_note = f", pa_errors={len(fr.flagged_errors)}" if fr.flagged_errors else ""
                print(f"OK ({elapsed:.1f}s) — CEFR={fr.cefr_level}, "
                      f"grammar={fr.grammar_score}, vocab={fr.vocabulary_score}{pa_note}{fallback_note}")
            except Exception as exc:
                elapsed = time.time() - t0
                fr.analyze_error = str(exc)
                print(f"FAILED ({elapsed:.1f}s): {exc}")
        else:
            fr.analyze_error = "Skipped — no transcript available"
            print("  -> POST /api/analyze ... SKIPPED (no transcript)")

    return results


# ---------------------------------------------------------------------------
# MD report generator
# ---------------------------------------------------------------------------

def build_md_report(results: list[FileResult]) -> str:
    lines: list[str] = []

    lines.append(f"# Audio Batch Test — {len(results)} Speakers")
    lines.append(f"**Date:** {_RUN_DATE}  ")
    lines.append(f"**Backend:** {BACKEND_URL}  ")
    lines.append('**Mode:** Free-speech pronunciation assessment (reference_text="")')
    lines.append("")
    lines.append("---")
    lines.append("")

    # Summary table
    lines.append("## Summary Table")
    lines.append("")
    lines.append("| # | Speaker | File | Transcript Confidence | CEFR | Pron Score | Fluency | WPM | Notes |")
    lines.append("|---|---------|------|-----------------------|------|------------|---------|-----|-------|")

    for fr in results:
        conf = pct(fr.transcript_confidence) if fr.transcript_confidence is not None else "FAILED"
        cefr = fr.cefr_level or ("FAILED" if fr.analyze_error else "N/A")
        pron = f"{fr.pron_score:.0f}/100" if fr.pron_score is not None else "FAILED"
        fluency = f"{fr.fluency_score:.0f}/100" if fr.fluency_score is not None else "N/A"
        wpm = f"{fr.wpm:.0f}" if fr.wpm is not None else "N/A"
        notes = ""
        if fr.analyze_fallback:
            notes = "⚠ analyze fallback"
        lines.append(
            f"| {fr.idx} | {fr.speaker} | `{fr.filename}` | {conf} | {cefr} | {pron} | {fluency} | {wpm} | {notes} |"
        )

    lines.append("")
    lines.append("## Known Issues")
    lines.append("")
    lines.append(
        "- `/api/analyze` returns flat 50/100 for all metrics when Gemini fallback triggers "
        "— scores marked ⚠ in table and detail sections."
    )
    lines.append(
        "- `/api/pronunciation/assess` uses `reference_text=\"\"` (free-speech mode) to avoid "
        "the reference-text mismatch bug where a short reference misses most of the actual speech."
    )
    lines.append("")
    lines.append("---")
    lines.append("")

    # Per-speaker detail sections
    for fr in results:
        lines.append(f"## {fr.idx}. {fr.speaker}")
        lines.append("")
        lines.append(f"**File:** `{fr.filename}`")
        lines.append("")

        # --- Transcription ---
        lines.append("### Transcription")
        lines.append("")
        if fr.transcript_error:
            lines.append(f"**Status:** FAILED: {fr.transcript_error}")
        else:
            lines.append("| Metric | Value |")
            lines.append("|--------|-------|")
            lines.append(f"| Confidence | {pct(fr.transcript_confidence)} |")
            lines.append(f"| Duration | {fr.transcript_duration:.1f}s |" if fr.transcript_duration is not None else "| Duration | N/A |")
            lines.append(f"| Words | {fr.transcript_word_count} |")
            lines.append("")
            lines.append("**Transcript:**")
            lines.append("")
            transcript_body = fr.transcript_text or "(empty)"
            lines.append(f"> {transcript_body}")
        lines.append("")

        # --- Text Analysis ---
        lines.append("### Text Analysis")
        lines.append("")
        if fr.analyze_error:
            lines.append(f"**Status:** FAILED: {fr.analyze_error}")
        else:
            fb = fr.analyze_fallback
            lines.append("| Metric | Score |")
            lines.append("|--------|-------|")
            lines.append(f"| CEFR Level | {fr.cefr_level or 'N/A'} |")
            lines.append(f"| Grammar | {fmt_score(fr.grammar_score, fb)} |")
            lines.append(f"| Vocabulary | {fmt_score(fr.vocabulary_score, fb)} |")
            lines.append(f"| WPM | {fr.wpm:.1f} |" if fr.wpm is not None else "| WPM | N/A |")
            lines.append(f"| Unique Words | {fr.unique_words} |" if fr.unique_words is not None else "| Unique Words | N/A |")
            if fb:
                lines.append("")
                lines.append("> **Note:** All scores are 50/100 — Gemini fallback triggered. "
                              "Scores are unreliable placeholder values.")
            if fr.feedback:
                lines.append("")
                lines.append("**Feedback:**")
                lines.append("")
                lines.append(f"> {fr.feedback}")
            if fr.strengths:
                lines.append("")
                lines.append("**Strengths:**")
                for s in fr.strengths:
                    lines.append(f"- {s}")
            if fr.improvement_areas:
                lines.append("")
                lines.append("**Improvement Areas:**")
                for s in fr.improvement_areas:
                    lines.append(f"- {s}")
        lines.append("")

        # --- Pronunciation Assessment ---
        lines.append("### Pronunciation Assessment")
        lines.append("")
        if fr.pron_error:
            lines.append(f"**Status:** FAILED: {fr.pron_error}")
        else:
            lines.append("| Metric | Value |")
            lines.append("|--------|-------|")
            lines.append(f"| Score | {fr.pron_score:.1f}/100 |" if fr.pron_score is not None else "| Score | N/A |")
            lines.append(f"| CEFR Cap | {fr.pron_cefr_cap or 'N/A'} |")
            if fr.pron_cap_reason:
                lines.append(f"| Cap Reason | {fr.pron_cap_reason} |")
            lines.append(f"| Fluency | {fr.fluency_score:.1f}/100 |" if fr.fluency_score is not None else "| Fluency | N/A |")
            lines.append(f"| Prosody | {fr.prosody_score:.1f}/100 |" if fr.prosody_score is not None else "| Prosody | N/A |")
            lines.append(f"| Flagged Errors | {len(fr.flagged_errors)} |")

            if fr.flagged_errors:
                lines.append("")
                lines.append("#### Flagged Errors")
                lines.append("")
                lines.append("| Spoken | Correct | Category | Confidence |")
                lines.append("|--------|---------|----------|------------|")
                for err in fr.flagged_errors:
                    spoken = err.get("spoken", "")
                    correct = err.get("correct", "")
                    category = err.get("rule_category", "")
                    confidence = err.get("confidence", "")
                    conf_str = f"{confidence:.2f}" if isinstance(confidence, float) else str(confidence)
                    lines.append(f"| {spoken} | {correct} | {category} | {conf_str} |")
        lines.append("")
        lines.append("---")
        lines.append("")

    # Footer
    lines.append(f"*Generated by `backend-ai/scripts/run_audio_batch_test.py` on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*")
    lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    print("=" * 60)
    print(f"Audio Batch Test — {len(AUDIO_FILES)} Speakers")
    print(f"Backend: {BACKEND_URL}")
    print(f"Audio dir: {BACKEND_AI_DIR}")
    print(f"Report: {REPORT_PATH}")
    print("=" * 60)

    # Verify files exist before starting
    missing = [f for f in AUDIO_FILES if not (BACKEND_AI_DIR / f).exists()]
    if missing:
        print(f"\nWARNING: {len(missing)} audio file(s) not found:")
        for m in missing:
            print(f"  - {m}")

    # Check backend is reachable
    print("\nChecking backend health ...", end=" ", flush=True)
    try:
        r = requests.get(f"{BACKEND_URL}/api/health", timeout=5)
        print(f"OK (status {r.status_code})")
    except Exception as exc:
        print(f"UNREACHABLE: {exc}")
        print("Continuing anyway — individual request errors will be captured.\n")

    results = run_batch()

    # Build and write report
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    md = build_md_report(results)
    REPORT_PATH.write_text(md, encoding="utf-8")

    print("\n" + "=" * 60)
    print(f"Report written to: {REPORT_PATH}")
    print("=" * 60)

    # Quick summary to stdout
    ok_transcribe = sum(1 for r in results if r.transcript_error is None and r.transcript_text)
    ok_analyze = sum(1 for r in results if r.analyze_error is None and r.cefr_level)
    ok_pron = sum(1 for r in results if r.pron_error is None and r.pron_score is not None)
    fallbacks = sum(1 for r in results if r.analyze_fallback)
    total = len(results)
    print(f"\nResults: transcribe={ok_transcribe}/{total}, analyze={ok_analyze}/{total}, pronunciation={ok_pron}/{total}")
    if fallbacks:
        print(f"WARNING: {fallbacks} file(s) triggered Gemini fallback (scores unreliable)")


if __name__ == "__main__":
    main()
