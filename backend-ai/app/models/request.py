from pydantic import BaseModel, HttpUrl
from typing import Optional
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

class PronunciationRequest(BaseModel):
    audio_url: Optional[str] = None
    audio_base64: Optional[str] = None  # Base64-encoded audio data (alternative to URL)
    reference_text: str
    user_id: str
    language: str = "en-US"
