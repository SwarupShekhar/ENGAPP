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
        """Create a detailed prompt for Gemini."""
        # This prompt engineering is critical for getting structured, reliable JSON output.
        return f"""
        Analyze the following English text from a user who is a native {request.user_native_language or 'speaker of another language'}.
        The user is currently at a {cefr_level.value} CEFR level.

        Text to analyze:
        ---
        "{request.text}"
        ---

        Based on the text, provide a detailed analysis in the following JSON format.
        Do NOT include any commentary or explanations outside of the JSON structure.

        {{
            "errors": [
                {{
                    "type": "GRAMMAR" | "VOCABULARY" | "TENSE" | "ARTICLE" | "FLUENCY",
                    "severity": "CRITICAL" | "MAJOR" | "MINOR" | "SUGGESTION",
                    "original_text": "The segment of text with the error.",
                    "corrected_text": "The corrected version of the text.",
                    "explanation": "A concise explanation of the error and the correction.",
                    "suggestion": "A tip to avoid this error in the future."
                }}
            ],
            "feedback": "Overall constructive feedback for the user.",
            "strengths": ["List of 2-3 key strengths."],
            "improvement_areas": ["List of 2-3 key areas for improvement."],
            "recommended_tasks": [
                {{"type": "practice_sheet", "topic": "e.g., Use of definite articles"}},
                {{"type": "shadowing_exercise", "sentence": "A sentence to practice."}}
            ]
        }}
        """

    @cached(prefix="analysis", ttl=settings.cache_ttl_analysis)
    async def analyze(self, request: AnalysisRequest) -> AnalysisResponse:
        """
        Analyzes text by first classifying its CEFR level, then getting a detailed
        analysis from the Gemini model.
        """
        if not self.model:
            raise RuntimeError("Analysis service is not configured.")

        start_time = time.time()

        # 1. Get CEFR classification first
        cefr_assessment = cefr_classifier.classify(request.text)

        # 2. Call Gemini for detailed error detection and feedback
        prompt = self._create_analysis_prompt(request, cefr_assessment.level)
        try:
            response = await asyncio.wait_for(
                self.model.generate_content_async(prompt),
                timeout=45.0
            )
            analysis_data = robust_json_parser(response.text)
        except Exception as e:
            logger.error(f"Gemini analysis failed: {e}", exc_info=True)
            # Provide a fallback response if Gemini fails
            analysis_data = {
                "errors": [],
                "feedback": "Could not complete AI analysis at this time.",
                "strengths": [],
                "improvement_areas": [],
                "recommended_tasks": []
            }

        # 3. Calculate metrics (placeholder for more advanced metrics)
        words = request.text.split()
        num_words = len(words)
        duration_minutes = num_words / 150  # Approximate wpm
        metrics = AnalysisMetrics(
            wpm=num_words / duration_minutes if duration_minutes > 0 else 0,
            unique_words=len(set(words)),
            grammar_score=100 - (len(analysis_data.get("errors", [])) * 10), # Simple metric
            vocabulary_score=cefr_assessment.score # Reuse CEFR score
        )
        
        # 4. Construct the final response
        return AnalysisResponse(
            cefr_assessment=cefr_assessment,
            errors=[ErrorDetail(**e) for e in analysis_data.get("errors", [])],
            metrics=metrics,
            feedback=analysis_data.get("feedback", ""),
            strengths=analysis_data.get("strengths", []),
            improvement_areas=analysis_data.get("improvement_areas", []),
            recommended_tasks=analysis_data.get("recommended_tasks", []),
            processing_time=time.time() - start_time
        )

analysis_service = AnalysisService()
