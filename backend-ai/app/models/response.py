from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Dict, Any, Generic, TypeVar
from app.models.base import (
    Word, CEFRAssessment, ErrorDetail, AnalysisMetrics, 
    WordPronunciation
)

T = TypeVar("T")

class Meta(BaseModel):
    processing_time_ms: int
    cache_hit: bool = False
    request_id: Optional[str] = None

class ErrorResponse(BaseModel):
    code: str
    message: str
    details: Optional[Dict[str, Any]] = None

class StandardResponse(BaseModel, Generic[T]):
    success: bool
    data: Optional[T] = None
    error: Optional[ErrorResponse] = None
    meta: Optional[Meta] = None

class TranscriptionResponse(BaseModel):
    text: str
    confidence: float
    words: List[Word]
    duration: float
    processing_time: float

class AnalysisResponse(BaseModel):
    cefr_assessment: CEFRAssessment
    errors: List[ErrorDetail]
    metrics: AnalysisMetrics
    feedback: str
    strengths: List[str]
    improvement_areas: List[str]
    recommended_tasks: List[Dict[str, Any]]
    processing_time: float
    # Deep Intelligence Additions
    linguistic_fingerprint_updates: Optional[Dict[str, Any]] = None
    shadowing_audio_url: Optional[str] = None
    # Image Description Specifics
    relevance_score: Optional[float] = None
    talk_style: Optional[str] = None

class PronunciationResponse(BaseModel):
    accuracy_score: float
    fluency_score: float
    completeness_score: float
    pronunciation_score: float
    words: List[WordPronunciation]
    common_issues: List[str]
    improvement_tips: List[str]
    processing_time: float
    # Deep Intelligence Additions
    prosody_score: Optional[float] = None
    speech_rate_wpm: Optional[float] = None
    pitch_variance: Optional[float] = None
