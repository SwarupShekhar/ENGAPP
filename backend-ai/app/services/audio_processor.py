import librosa
import numpy as np
import soundfile as sf
import io
import httpx
from typing import Dict, Any, Tuple
from app.core.logging import logger
from app.core.config import settings

class AudioProcessor:
    """
    Advanced audio processing service for feature extraction.
    """

    async def get_audio_features(self, audio_bytes: bytes) -> Dict[str, Any]:
        """
        Extract basic spectral and temporal features from audio.
        """
        try:
            # Load audio from bytes
            y, sr = librosa.load(io.BytesIO(audio_bytes), sr=settings.audio_sample_rate)
            
            # Duration
            duration = librosa.get_duration(y=y, sr=sr)
            
            # RMS Energy (Loudness)
            rms = librosa.feature.rms(y=y)
            avg_loudness = float(np.mean(rms))
            
            # Zero Crossing Rate (Noisiness)
            zcr = librosa.feature.zero_crossing_rate(y=y)
            avg_zcr = float(np.mean(zcr))
            
            # Spectral Centroid (Brightness)
            centroid = librosa.feature.spectral_centroid(y=y, sr=sr)
            avg_centroid = float(np.mean(centroid))
            
            return {
                "duration_sec": float(duration),
                "avg_loudness": avg_loudness,
                "noisiness_ratio": avg_zcr,
                "spectral_centroid": avg_centroid,
                "sample_rate": sr
            }
        except Exception as e:
            logger.error(f"audio_feature_extraction_failed: {e}", exc_info=True)
            return {}

    async def detect_silence(self, y: np.ndarray, sr: int, top_db: int = 20) -> List[Tuple[float, float]]:
        """
        Detect non-silent intervals in the audio.
        """
        intervals = librosa.effects.split(y, top_db=top_db)
        return [(start/sr, end/sr) for start, end in intervals]

audio_processor = AudioProcessor()
