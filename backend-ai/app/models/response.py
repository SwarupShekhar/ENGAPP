from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Dict, Any, Generic, TypeVar
from app.models.base import (
    Word, CEFRAssessment, ErrorDetail, AnalysisMetrics, 
    WordPronunciation
)

T = TypeVar("T")

class Meta(BaseModel):
    processing_time_ms: int = 0
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
    accent_notes: Optional[str] = None
    # Deep Intelligence Additions
    linguistic_fingerprint_updates: Optional[Dict[str, Any]] = None
    shadowing_audio_url: Optional[str] = None
    # Image Description Specifics
    relevance_score: Optional[float] = None
    talk_style: Optional[str] = None


class MispronuncedWord(BaseModel):
    word: str
    accuracy: float
    error_type: str
    position_in_text: int

class WeakPhoneme(BaseModel):
    word: str
    phoneme: str
    score: float
    ipa_symbol: str

class DetailedPronunciationFeedback(BaseModel):
    mispronounced_words: List[MispronuncedWord] = []
    weak_phonemes: List[WeakPhoneme] = []
    problem_sounds: Dict[str, int] = {}
    omitted_words: List[str] = []
    inserted_words: List[str] = []
    word_level_scores: List[Dict[str, Any]] = []

class ActionableFeedback(BaseModel):
    practice_words: List[str] = []
    phoneme_tips: List[str] = []
    accent_specific_tips: List[str] = []
    strengths: List[str] = []

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
    # Detailed Feedback
    detailed_errors: Optional[DetailedPronunciationFeedback] = None
    actionable_feedback: Optional[ActionableFeedback] = None
    word_level_data: Optional[List[Dict[str, Any]]] = None
    # Emotion & Confidence
    emotion_data: Optional[Dict[str, Any]] = None
