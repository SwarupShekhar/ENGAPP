"""
librosa acoustic features for delivery coaching (complements Azure PA).
"""
from __future__ import annotations

import asyncio
from typing import Any

import librosa
import numpy as np


def extract_librosa_features_sync(audio_path: str) -> dict[str, float]:
    """
    Extract delivery features from a WAV file path.
    Returns zeros on failure (caller should treat as no insights).
    """
    try:
        y, sr = librosa.load(audio_path, sr=None, mono=True)
        if y is None or len(y) == 0:
            return _empty_features()

        f0, _, _ = librosa.pyin(
            y,
            fmin=librosa.note_to_hz("C2"),
            fmax=librosa.note_to_hz("C7"),
        )
        f0_clean = f0[~np.isnan(f0)] if f0 is not None else np.array([])
        pitch_variance = float(np.std(f0_clean)) if len(f0_clean) > 0 else 0.0

        duration = float(librosa.get_duration(y=y, sr=sr))
        non_silent = librosa.effects.split(y, top_db=25)
        voiced_duration = (
            sum(end - start for start, end in non_silent) / sr if non_silent is not None else 0.0
        )
        pause_ratio = (duration - voiced_duration) / duration if duration > 0 else 0.0

        rms = librosa.feature.rms(y=y)
        energy_level = float(np.mean(rms) * 100) if rms is not None and len(rms) else 0.0

        return {
            "pitch_variance": pitch_variance,
            "pause_ratio": float(pause_ratio),
            "energy_level": energy_level,
            "voiced_duration_sec": float(voiced_duration),
            "duration_sec": duration,
        }
    except Exception:
        return _empty_features()


async def extract_librosa_features(audio_path: str) -> dict[str, float]:
    return await asyncio.to_thread(extract_librosa_features_sync, audio_path)


def compute_delivery_confidence(pitch_variance: float, pause_ratio: float) -> float:
    """
    One-line formula (spec):
    clamp(100 - pause_ratio×50 - max(0, 30 - pitch_variance)×0.75, 0, 100)
    """
    penalty = pause_ratio * 50.0 + max(0.0, 30.0 - pitch_variance) * 0.75
    return float(max(0.0, min(100.0, 100.0 - penalty)))


def _empty_features() -> dict[str, float]:
    return {
        "pitch_variance": 0.0,
        "pause_ratio": 0.0,
        "energy_level": 0.0,
        "voiced_duration_sec": 0.0,
        "duration_sec": 0.0,
    }
