import time
import json
import asyncio
from typing import Dict, Any, List
import google.generativeai as genai

from app.core.config import settings
from app.core.logging import logger
from app.models.request import AnalysisRequest
from app.models.response import AnalysisResponse, AnalysisMetrics
from app.models.base import CEFRAssessment, ErrorDetail, ErrorType, ErrorSeverity, CEFRLevel
from app.cache.manager import cached
from app.services.cefr_classifier import cefr_classifier
from app.utils.robust_json_parser import robust_json_parser

class AnalysisService:
    """
    Gemini-powered text analysis service.
    """

    def __init__(self):
        self.model = None
        if settings.google_api_key:
            genai.configure(api_key=settings.google_api_key)
            self.model = genai.GenerativeModel('gemini-pro')
        else:
            logger.warning("Google API key not configured. AnalysisService is disabled.")

    def _create_analysis_prompt(self, request: AnalysisRequest, cefr_level: CEFRLevel) -> str:
        """Create a comprehensive system prompt for Gemini that requests structured scores."""
        context_section = ""
        if request.context:
            context_section = f"""
        Additional context (e.g., Azure pronunciation evidence):
        ---
        {request.context}
        ---
        Use this data to inform your pronunciation and fluency scoring.
        """

        return f"""You are a STRICT professional ESL (English as a Second Language) assessment engine.
Analyze the following English speech transcript from a learner.

**IMPORTANT SCORING PRINCIPLES:**
- Be STRICT and realistic. Most learners should score 40-70 range.
- A score above 80 means near-native proficiency — reserve it for truly excellent speech.
- Short or simple utterances should NOT receive high scores regardless of accuracy.
- Penalize lack of complexity even if the speech is technically correct.
- A beginner who says "Hello, I am fine" correctly should score ~30-45, not 90+.

**Learner Profile:**
- Native language: {request.user_native_language or 'Unknown'}
- Estimated CEFR level: {cefr_level.value}

**Transcript to analyze:**
---
"{request.text}"
---
{context_section}

**SCORING RUBRIC — provide a score from 0 to 100 for each:**

1. **grammar_score**: Based on grammatical accuracy AND complexity.
   - 90-100: Near-native with complex structures (relative clauses, conditionals, passive voice)
   - 70-89: Good accuracy with some complex structures, minor errors
   - 50-69: Basic structures mostly correct, limited complexity
   - 30-49: Frequent errors, limited to simple sentences
   - 0-29: Mostly unintelligible grammar

2. **pronunciation_score**: Based on clarity and intelligibility.
   - If Azure pronunciation data is provided in context, weight it at 70%.
   - Note any L1 accent patterns (e.g., Hindi speakers: retroflex consonants, vowel substitutions).
   - Distinguish between accent (acceptable variation) vs. errors (impede understanding).

3. **fluency_score**: Based on natural flow AND speech length.
   - Very short utterances (under 20 words) should cap at 50 regardless of quality.
   - Penalize filler words ("um", "uh", "like"), false starts, repetitions.
   - Reward sustained speech, natural pacing, discourse markers ("however", "moreover").

4. **vocabulary_score**: Based on lexical range, variety, and appropriateness.
   - Simple/common words only → max 50.
   - Must use varied vocabulary and collocations for scores above 70.

5. **overall_score**: Weighted average — Grammar 30%, Pronunciation 25%, Fluency 25%, Vocabulary 20%.

6. **cefr_level**: Your assessed CEFR level (A1, A2, B1, B2, C1, C2) based on the overall performance.

Respond with ONLY this JSON. No commentary outside the JSON structure.

{{
    "scores": {{
        "grammar_score": <int 0-100>,
        "pronunciation_score": <int 0-100>,
        "fluency_score": <int 0-100>,
        "vocabulary_score": <int 0-100>,
        "overall_score": <int 0-100>
    }},
    "cefr_level": "<A1|A2|B1|B2|C1|C2>",
    "errors": [
        {{
            "type": "GRAMMAR" | "VOCABULARY" | "TENSE" | "ARTICLE" | "FLUENCY",
            "severity": "CRITICAL" | "MAJOR" | "MINOR" | "SUGGESTION",
            "original_text": "The segment with the error.",
            "corrected_text": "The corrected version.",
            "explanation": "Brief explanation of why this is wrong and how to fix it.",
            "suggestion": "A practical tip to avoid this error."
        }}
    ],
    "accent_notes": "1-2 sentences describing any detected accent patterns, L1 influence on pronunciation, and specific phonetic tendencies. If Azure data shows specific word-level accuracy issues, mention those words.",
    "feedback": "2-3 sentences of encouraging, constructive overall feedback.",
    "strengths": ["Strength 1", "Strength 2"],
    "improvement_areas": ["Area 1", "Area 2"],
    "recommended_tasks": [
        {{"type": "grammar_drill", "topic": "Specific grammar topic to practice"}},
        {{"type": "shadowing_exercise", "sentence": "An example sentence to shadow"}}
    ]
}}"""

    @cached(prefix="analysis", ttl=settings.cache_ttl_analysis)
    async def analyze(self, request: AnalysisRequest) -> AnalysisResponse:
        """
        Analyzes text by first classifying its CEFR level, then getting a detailed
        analysis from the Gemini model with structured scoring.
        """
        if not self.model:
            raise RuntimeError("Analysis service is not configured.")

        start_time = time.time()

        # 1. Get CEFR classification first (rule-based baseline)
        cefr_assessment = cefr_classifier.classify(request.text)

        # 2. Call Gemini for detailed analysis with structured scores
        prompt = self._create_analysis_prompt(request, cefr_assessment.level)
        try:
            response = await asyncio.wait_for(
                self.model.generate_content_async(prompt),
                timeout=45.0
            )
            analysis_data = robust_json_parser(response.text)
        except Exception as e:
            logger.error(f"Gemini analysis failed: {e}", exc_info=True)
            analysis_data = {
                "scores": {"grammar_score": 50, "pronunciation_score": 50, "fluency_score": 50, "vocabulary_score": 50, "overall_score": 50},
                "cefr_level": cefr_assessment.level.value,
                "errors": [],
                "feedback": "Could not complete AI analysis at this time.",
                "strengths": [],
                "improvement_areas": [],
                "recommended_tasks": []
            }

        # 3. Use AI-generated scores instead of heuristics
        ai_scores = analysis_data.get("scores", {})
        words = request.text.split()
        num_words = len(words)
        duration_minutes = num_words / 150 if num_words > 0 else 1

        metrics = AnalysisMetrics(
            wpm=num_words / duration_minutes if duration_minutes > 0 else 0,
            unique_words=len(set(words)),
            grammar_score=ai_scores.get("grammar_score", 50),
            pronunciation_score=ai_scores.get("pronunciation_score", 50),
            fluency_score=ai_scores.get("fluency_score", 50),
            vocabulary_score=ai_scores.get("vocabulary_score", 50),
            overall_score=ai_scores.get("overall_score", 50),
        )

        # Override CEFR with AI assessment if available
        ai_cefr = analysis_data.get("cefr_level")
        if ai_cefr and ai_cefr in [level.value for level in CEFRLevel]:
            cefr_assessment.level = CEFRLevel(ai_cefr)
        
        # 4. Construct the final response
        return AnalysisResponse(
            cefr_assessment=cefr_assessment,
            errors=[ErrorDetail(**e) for e in analysis_data.get("errors", [])],
            metrics=metrics,
            feedback=analysis_data.get("feedback", ""),
            strengths=analysis_data.get("strengths", []),
            improvement_areas=analysis_data.get("improvement_areas", []),
            recommended_tasks=analysis_data.get("recommended_tasks", []),
            accent_notes=analysis_data.get("accent_notes", None),
            processing_time=time.time() - start_time
        )

analysis_service = AnalysisService()
