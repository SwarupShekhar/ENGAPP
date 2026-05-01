"""
Targeted A/B test harness for pronunciation detector strictness.

Compares old detector thresholds vs current stricter thresholds on
controlled Azure-like word payloads so we can quantify behavior change
without requiring live Azure or local audio files.

Run:
    python3 scripts/ab_pronunciation_detector.py
"""
from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any
import os
import sys
import json
import argparse
from datetime import datetime, timezone

# Allow running from repo root: python backend-ai/scripts/ab_pronunciation_detector.py
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.features.pronunciation import pronunciation_detector as det


@dataclass(frozen=True)
class DetectorConfig:
    default_accuracy_threshold: int
    function_word_threshold: int
    phoneme_bad_threshold: int
    false_positive_suppression: int


OLD_CONFIG = DetectorConfig(
    default_accuracy_threshold=70,
    function_word_threshold=75,
    phoneme_bad_threshold=65,
    false_positive_suppression=80,
)

NEW_CONFIG = DetectorConfig(
    default_accuracy_threshold=det.DEFAULT_ACCURACY_THRESHOLD,
    function_word_threshold=det.FUNCTION_WORD_THRESHOLD,
    phoneme_bad_threshold=det.PHONEME_BAD_THRESHOLD,
    false_positive_suppression=det.FALSE_POSITIVE_SUPPRESSION,
)


@contextmanager
def use_config(cfg: DetectorConfig):
    prev = (
        det.DEFAULT_ACCURACY_THRESHOLD,
        det.FUNCTION_WORD_THRESHOLD,
        det.PHONEME_BAD_THRESHOLD,
        det.FALSE_POSITIVE_SUPPRESSION,
    )
    det.DEFAULT_ACCURACY_THRESHOLD = cfg.default_accuracy_threshold
    det.FUNCTION_WORD_THRESHOLD = cfg.function_word_threshold
    det.PHONEME_BAD_THRESHOLD = cfg.phoneme_bad_threshold
    det.FALSE_POSITIVE_SUPPRESSION = cfg.false_positive_suppression
    try:
        yield
    finally:
        (
            det.DEFAULT_ACCURACY_THRESHOLD,
            det.FUNCTION_WORD_THRESHOLD,
            det.PHONEME_BAD_THRESHOLD,
            det.FALSE_POSITIVE_SUPPRESSION,
        ) = prev


def mk_word(
    word: str,
    accuracy: float,
    error_type: str = "None",
    phonemes: list[tuple[str, float]] | None = None,
) -> dict[str, Any]:
    return {
        "Word": word,
        "PronunciationAssessment": {
            "AccuracyScore": accuracy,
            "ErrorType": error_type,
        },
        "Phonemes": [
            {
                "Phoneme": p_name,
                "PronunciationAssessment": {"AccuracyScore": p_score},
            }
            for p_name, p_score in (phonemes or [])
        ],
    }


def mk_azure(words: list[dict[str, Any]]) -> dict[str, Any]:
    return {"NBest": [{"Words": words}]}


def summarize_errors(errors: list[dict[str, Any]]) -> set[tuple[str, str, str]]:
    return {
        (
            str(e.get("spoken") or ""),
            str(e.get("correct") or ""),
            str(e.get("rule_category") or ""),
        )
        for e in errors
    }


def run_case(name: str, azure_result: dict[str, Any], reference_text: str) -> dict[str, Any]:
    with use_config(OLD_CONFIG):
        old_errors = det.detect_from_azure_result(
            azure_result,
            reference_text=reference_text,
            accuracy_threshold=OLD_CONFIG.default_accuracy_threshold,
        )
    with use_config(NEW_CONFIG):
        new_errors = det.detect_from_azure_result(
            azure_result,
            reference_text=reference_text,
            accuracy_threshold=NEW_CONFIG.default_accuracy_threshold,
        )

    old_set = summarize_errors(old_errors)
    new_set = summarize_errors(new_errors)
    return {
        "name": name,
        "reference_text": reference_text,
        "old_count": len(old_errors),
        "new_count": len(new_errors),
        "added_in_new": sorted(new_set - old_set),
        "removed_in_new": sorted(old_set - new_set),
        "old_errors": old_errors,
        "new_errors": new_errors,
    }


def _default_reports_dir() -> str:
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    return os.path.join(repo_root, "reports", "pronunciation_ab")


def write_json_artifacts(report: dict[str, Any], reports_dir: str) -> tuple[str, str]:
    os.makedirs(reports_dir, exist_ok=True)
    run_id = report["meta"]["run_id"]
    timestamped_path = os.path.join(reports_dir, f"{run_id}.json")
    latest_path = os.path.join(reports_dir, "latest.json")

    with open(timestamped_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    with open(latest_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    return timestamped_path, latest_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run targeted A/B pronunciation detector comparison and emit JSON artifacts."
    )
    parser.add_argument(
        "--output-dir",
        default=_default_reports_dir(),
        help="Directory where JSON artifacts are written.",
    )
    parser.add_argument(
        "--tag",
        default="",
        help="Optional label to append in run_id (e.g. strict-v2).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    # Cases chosen to stress exactly the new strictness knobs.
    cases: list[tuple[str, dict[str, Any], str]] = [
        (
            "FunctionWord_ThToD_Borderline",
            mk_azure([mk_word("this", 80.0, "None", phonemes=[("d", 68.0), ("ih", 92.0), ("s", 96.0)])]),
            "this",
        ),
        (
            "GeneralWord_Borderline_Accuracy",
            mk_azure([mk_word("water", 76.0, "None", phonemes=[("w", 78.0), ("ao", 88.0), ("t", 95.0)])]),
            "water",
        ),
        (
            "SingleWeakCriticalPhoneme",
            mk_azure([mk_word("very", 88.0, "None", phonemes=[("v", 73.0), ("eh", 90.0), ("r", 91.0)])]),
            "very",
        ),
        (
            "HighConfidence_NonMapped_ShouldSuppress",
            mk_azure([mk_word("umbrella", 92.0, "None", phonemes=[("ah", 91.0), ("m", 93.0), ("b", 94.0)])]),
            "umbrella",
        ),
        (
            "HighConfidence_NonMapped_StillSuppressedAt95Gate",
            mk_azure([mk_word("umbrella", 97.0, "None", phonemes=[("ah", 92.0), ("m", 94.0), ("b", 95.0)])]),
            "umbrella",
        ),
        (
            "ExplicitAzureMispronunciation",
            mk_azure([mk_word("vater", 83.0, "Mispronunciation", phonemes=[("v", 62.0), ("aa", 79.0), ("t", 90.0)])]),
            "water",
        ),
    ]

    print("=== Pronunciation Detector A/B ===")
    print(f"OLD: {OLD_CONFIG}")
    print(f"NEW: {NEW_CONFIG}")
    print()

    total_old = 0
    total_new = 0
    total_added = 0
    total_removed = 0
    case_results: list[dict[str, Any]] = []

    for name, azure_result, reference_text in cases:
        result = run_case(name, azure_result, reference_text)
        case_results.append(result)
        total_old += result["old_count"]
        total_new += result["new_count"]
        total_added += len(result["added_in_new"])
        total_removed += len(result["removed_in_new"])

        print(f"[{name}] old={result['old_count']} new={result['new_count']}")
        if result["added_in_new"]:
            print(f"  + added in new: {result['added_in_new']}")
        if result["removed_in_new"]:
            print(f"  - removed in new: {result['removed_in_new']}")
        if not result["added_in_new"] and not result["removed_in_new"]:
            print("  = no diff")
        print()

    print("=== Aggregate ===")
    print(f"old_total_flags={total_old}")
    print(f"new_total_flags={total_new}")
    print(f"net_change={total_new - total_old:+d}")
    print(f"added_signals={total_added}")
    print(f"removed_signals={total_removed}")

    now = datetime.now(timezone.utc)
    run_id = now.strftime("%Y%m%dT%H%M%SZ")
    safe_tag = (
        "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in args.tag.strip())
        if args.tag.strip()
        else ""
    )
    if safe_tag:
        run_id = f"{run_id}__{safe_tag}"
    report = {
        "meta": {
            "run_id": run_id,
            "generated_at_utc": now.isoformat(),
            "script": "backend-ai/scripts/ab_pronunciation_detector.py",
            "tag": safe_tag or None,
        },
        "config": {
            "old": OLD_CONFIG.__dict__,
            "new": NEW_CONFIG.__dict__,
        },
        "aggregate": {
            "old_total_flags": total_old,
            "new_total_flags": total_new,
            "net_change": total_new - total_old,
            "added_signals": total_added,
            "removed_signals": total_removed,
        },
        "cases": case_results,
    }

    reports_dir = os.path.abspath(args.output_dir)
    timestamped_path, latest_path = write_json_artifacts(report, reports_dir)
    print()
    print("=== Artifact ===")
    print(f"timestamped_report={timestamped_path}")
    print(f"latest_report={latest_path}")


if __name__ == "__main__":
    main()
