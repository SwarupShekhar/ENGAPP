"""
Pure-Python phonemizer fallback using g2p-en.
Used when CMU dict lacks a word and phonemizer/espeak is unavailable.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_g2p = None


def _get_g2p():
    """Lazy-load g2p model."""
    global _g2p
    if _g2p is None:
        try:
            from g2p_en import G2p
            _g2p = G2p()
        except ImportError:
            logger.error("g2p-en not installed. Run: pip install g2p-en")
            return None
    return _g2p


def g2p_phonemes(word: str) -> list[str]:
    """
    Convert English word to ARPABET phoneme tokens using g2p-en.
    Returns empty list on failure.
    """
    g2p = _get_g2p()
    if g2p is None:
        return []

    try:
        raw = g2p(word.strip())
        # g2p-en returns: ['P', 'IY1', 'P', 'AH0', 'L'] — strip stress digits
        tokens = [p.rstrip("012") for p in raw if p not in ["ˈ", "ˌ"]]
        # Remove any non-alphabetic tokens
        tokens = [p for p in tokens if p.isalpha()]
        return tokens
    except Exception as e:
        logger.warning(f"g2p failed for '{word}': {e}")
        return []
