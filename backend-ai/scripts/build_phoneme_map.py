#!/usr/bin/env python3
"""
One-time script: read CSV and emit phoneme_error_map.json with three indexes:
  by_approximation, by_correct_word, by_category

CSV expected columns (header row):
  approximation, correct_word, rule_category
or: correct_word, approximation, rule_category

Run from backend-ai root:
  python scripts/build_phoneme_map.py [--csv path/to/phonemes.csv] [--out data/phoneme_error_map.json]
"""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Build phoneme_error_map.json from CSV")
    parser.add_argument("--csv", type=Path, default=None, help="Input CSV path")
    parser.add_argument("--out", type=Path, default=Path("data/phoneme_error_map.json"), help="Output JSON path")
    args = parser.parse_args()

    # Default CSV path next to script or in data/
    csv_path = args.csv
    if csv_path is None:
        for candidate in [
            Path(__file__).resolve().parent.parent / "data" / "phonemes.csv",
            Path(__file__).resolve().parent.parent / "data" / "phoneme_error.csv",
        ]:
            if candidate.exists():
                csv_path = candidate
                break
    if csv_path is None or not csv_path.exists():
        print("No CSV found. Provide --csv path/to.csv with columns: approximation, correct_word, rule_category")
        return

    by_approximation: dict[str, dict] = {}
    by_correct_word: dict[str, dict] = {}
    by_category: dict[str, list[str]] = {}

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        # normalize header names
        fieldnames = [c.strip().lower().replace(" ", "_") for c in (reader.fieldnames or [])]
        if not fieldnames:
            print("CSV has no header")
            return
        # map common aliases
        approx_key = next((k for k in fieldnames if k in ("approximation", "spoken", "wrong")), None)
        correct_key = next((k for k in fieldnames if k in ("correct_word", "correct", "target")), None)
        rule_key = next((k for k in fieldnames if k in ("rule_category", "category", "rule")), None)
        if not (approx_key and correct_key and rule_key):
            print("CSV needs columns for approximation, correct_word, rule_category (or spoken, correct, category)")
            return

        for row in reader:
            row = {k.strip().lower().replace(" ", "_"): (v or "").strip() for k, v in row.items()}
            approx = row.get(approx_key, "").lower()
            correct = row.get(correct_key, "").lower()
            rule = row.get(rule_key, "").strip()
            if not approx or not correct or not rule:
                continue
            by_approximation[approx] = {"correct_word": correct, "rule_category": rule}
            by_correct_word[correct] = {"approximation": approx, "rule_category": rule}
            by_category.setdefault(rule, []).append(correct)

    # dedupe by_category lists
    for k in by_category:
        by_category[k] = sorted(set(by_category[k]))

    out = {
        "by_approximation": by_approximation,
        "by_correct_word": by_correct_word,
        "by_category": by_category,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
