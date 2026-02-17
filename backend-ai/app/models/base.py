from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from enum import Enum

class CEFRLevel(str, Enum):
    A1 = "A1"
    A2 = "A2"
    B1 = "B1"
    B2 = "B2"
    C1 = "C1"
    C2 = "C2"

class AnalysisTaskType(str, Enum):
    GENERAL = "general"
    IMAGE_DESCRIPTION = "image_description"
    JOINT_CONVERSATION = "joint_conversation"

class ErrorType(str, Enum):
    GRAMMAR = "grammar"
    VOCABULARY = "vocabulary"
    PRONUNCIATION = "pronunciation"
    TENSE = "tense"
    ARTICLE = "article"
    FLUENCY = "fluency"
    COHERENCE = "coherence"

class ErrorSeverity(str, Enum):
    CRITICAL = "critical"
    MAJOR = "major"
    MINOR = "minor"
    SUGGESTION = "suggestion"

class Word(BaseModel):
    text: str
    start_time: float
    end_time: float
    confidence: float

class ErrorDetail(BaseModel):
    type: ErrorType
    severity: ErrorSeverity
    original_text: str
    corrected_text: str
    explanation: str
    suggestion: str
    rule: Optional[str] = None

class CEFRAssessment(BaseModel):
    level: CEFRLevel
    score: float
    confidence: float
    strengths: List[str]
    weaknesses: List[str]
    next_level_requirements: List[str]

class AnalysisMetrics(BaseModel):
    wpm: float
    unique_words: int
    grammar_score: float
    pronunciation_score: float = 50.0
    fluency_score: float = 50.0
    vocabulary_score: float
    overall_score: float = 50.0

class PhonemeScore(BaseModel):
    phoneme: str
    accuracy_score: float
    error_type: Optional[str] = None

class WordPronunciation(BaseModel):
    word: str
    accuracy_score: float
    error_type: Optional[str] = None
    phonemes: List[PhonemeScore] = []
