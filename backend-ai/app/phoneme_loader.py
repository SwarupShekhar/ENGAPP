"""
Load phoneme_error_map.json and reel_category_map.json once at startup.
Any service imports from this module — no repeated disk reads.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"

_phoneme_map: dict | None = None
_reel_map: dict[str, str] | None = None


def _load_json(name: str) -> dict:
    path = _DATA_DIR / name
    if not path.exists():
        return {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _lowercase_map_keys(m: dict) -> dict:
    """Normalize map keys to lowercase for consistent by_approximation / by_correct_word lookups."""
    if not m:
        return m
    return {str(k).strip().lower(): v for k, v in m.items()}


def get_phoneme_map() -> dict:
    global _phoneme_map
    if _phoneme_map is None:
        _phoneme_map = _load_json("phoneme_error_map.json")

        # Lowercase keys for consistent lookups
        if "by_approximation" in _phoneme_map and isinstance(_phoneme_map["by_approximation"], dict):
            _phoneme_map["by_approximation"] = _lowercase_map_keys(_phoneme_map["by_approximation"])

        # AUTO-GENERATE by_correct_word from by_approximation to ensure sync
        by_app = _phoneme_map.get("by_approximation") or {}
        by_correct_auto: dict[str, dict] = {}
        for approx_key, entry in by_app.items():
            if not isinstance(entry, dict):
                continue
            correct_word = entry.get("correct_word", "").lower().strip()
            if correct_word:
                by_correct_auto[correct_word] = {
                    "rule_category": entry.get("rule_category", ""),
                    "approximation": approx_key,
                    "tip": entry.get("tip", ""),
                }
        _phoneme_map["by_correct_word"] = by_correct_auto

        logger.info(
            "Phoneme map loaded: %d approximations, %d correct_words (auto-generated)",
            len(by_app),
            len(by_correct_auto)
        )
    return _phoneme_map


def get_reel_map() -> dict[str, str]:
    global _reel_map
    if _reel_map is None:
        _reel_map = _load_json("reel_category_map.json")
    return _reel_map
