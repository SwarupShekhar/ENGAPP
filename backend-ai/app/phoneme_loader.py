"""
Load phoneme_error_map.json and reel_category_map.json once at startup.
Any service imports from this module — no repeated disk reads.
"""
from __future__ import annotations

import json
from pathlib import Path

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
        # Fix B: Lowercase by_approximation (and by_correct_word) keys so lookups are consistent
        if "by_approximation" in _phoneme_map and isinstance(_phoneme_map["by_approximation"], dict):
            _phoneme_map["by_approximation"] = _lowercase_map_keys(_phoneme_map["by_approximation"])
        if "by_correct_word" in _phoneme_map and isinstance(_phoneme_map["by_correct_word"], dict):
            _phoneme_map["by_correct_word"] = _lowercase_map_keys(_phoneme_map["by_correct_word"])
    return _phoneme_map


def get_reel_map() -> dict[str, str]:
    global _reel_map
    if _reel_map is None:
        _reel_map = _load_json("reel_category_map.json")
    return _reel_map
