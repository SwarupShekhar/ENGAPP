#!/usr/bin/env python3
"""
One-time: read backend-ai/phonemeError.json and write data/phoneme_error_map.json
with by_approximation, by_correct_word, by_category.

Run from backend-ai:
  python scripts/build_phoneme_map_from_json.py [--input phonemeError.json] [--out data/phoneme_error_map.json]
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=None, help="Input phonemeError.json")
    parser.add_argument("--out", type=Path, default=Path("data/phoneme_error_map.json"))
    args = parser.parse_args()

    root = Path(__file__).resolve().parent.parent
    in_path = args.input
    if in_path is None:
        for candidate in (root / "phonemeError.json", root / "phonemeerror.json"):
            if candidate.exists():
                in_path = candidate
                break
        if in_path is None:
            in_path = root / "phonemeError.json"
    if not in_path.exists():
        print(f"Not found: {in_path}")
        print("Place phonemeError.json (or phonemeerror.json) in backend-ai/ and run again.")
        return

    with open(in_path, encoding="utf-8") as f:
        raw = json.load(f)
    print(f"Using input: {in_path.resolve()}")

    # Category order for list-of-blocks format (numeric keys "0","1",... map to these)
    CATEGORY_ORDER = [
        "w_to_v", "v_to_w_reversal", "ae_to_e", "i_to_ee", "o_to_aa",
        "th_to_t", "th_to_d", "h_dropping", "zh_to_j", "z_to_j",
        "r_rolling", "syllabic_lengthening", "schwa_addition", "schwa_reduction", "schwa_prothesis",
    ]

    by_approximation: dict[str, dict] = {}
    by_correct_word: dict[str, dict] = {}
    by_category: dict[str, list[str]] = {}

    if isinstance(raw, list):
        for item in raw:
            if not isinstance(item, dict):
                continue
                
            # The structure is: 
            # "Word": "water",
            # "Indian_Spelling_Approximation": "vater",
            # "Rule_Category": "w_to_v"
            
            right = item.get("Word", "").strip().lower()
            wrong = item.get("Indian_Spelling_Approximation", "").strip().lower()
            category = item.get("Rule_Category", "").strip()
            
            if right and wrong and category:
                by_approximation[wrong] = {"correct_word": right, "rule_category": category}
                by_correct_word[right] = {"approximation": wrong, "rule_category": category}
                by_category.setdefault(category, []).append(right)
    
    # Dedupe by_category lists
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
    print(f"Wrote {args.out} (approx={len(by_approximation)}, correct={len(by_correct_word)}, categories={len(by_category)})")


if __name__ == "__main__":
    main()
