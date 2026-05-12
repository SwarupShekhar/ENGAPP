from pydantic import BaseModel, ConfigDict, HttpUrl
from typing import Optional, List, Dict, Any
from app.models.base import AnalysisTaskType

class TranscriptionRequest(BaseModel):
    audio_url: Optional[str] = None
    audio_base64: Optional[str] = None  # Base64-encoded audio data (alternative to URL)
    language: str = "en-US"
    user_id: str
    session_id: str
    enable_diarization: bool = False

class AnalysisRequest(BaseModel):
    text: str
    user_id: str
    session_id: str
    context: Optional[str] = None
    user_native_language: Optional[str] = None
    task_type: AnalysisTaskType = AnalysisTaskType.GENERAL
    # Optional: Pulse live-tutor captures; merged with WebSocket store in analyze()
    pronunciation_issues: Optional[List[Dict[str, Any]]] = None
    # Optional: structured PA flagged_errors from /pronunciation/assess; injected into Gemini prompt
    pa_flagged_errors: Optional[List[Dict[str, Any]]] = None
    # Optional: pronunciation score (0-100) from /pronunciation/assess; overrides Gemini estimate
    pa_pronunciation_score: Optional[float] = None
    # Optional: fluency and prosody scores from /pronunciation/assess for richer Gemini context
    pa_fluency_score: Optional[float] = None
    pa_prosody_score: Optional[float] = None
    # Optional: Deepgram secondary transcript (less normalized, preserves grammar errors)
    secondary_text: Optional[str] = None

class PronunciationRequest(BaseModel):
    audio_url: Optional[str] = None
    audio_base64: Optional[str] = None
    reference_text: str
    user_id: str
    language: str = "en-US"

class SpeakerSegment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    speaker_id: str
    text: str
    timestamp: float
    context: Optional[str] = None
    user_native_language: Optional[str] = None
    pa_flagged_errors: Optional[List[Dict[str, Any]]] = None


class JointAnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    session_id: str
    segments: List[SpeakerSegment]

class HinglishSTTRequest(BaseModel):
    audio_base64: str
    user_id: str

class HinglishTTSRequest(BaseModel):
    text: str
    gender: str = "female"
