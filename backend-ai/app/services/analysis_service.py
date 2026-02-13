import json
import time
import asyncio
from typing import Dict, Any, List, Optional
import google.generativeai as genai
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import settings
from app.core.logging import logger
from app.models.base import CEFRLevel, ErrorType, ErrorSeverity, ErrorDetail, AnalysisMetrics, AnalysisTaskType
from app.models.request import AnalysisRequest
from app.models.response import AnalysisResponse
from app.cache.manager import cached

class AnalysisService:
    """
    Robust Text Analysis Service using Google Gemini.
    Features:
    - Retries with exponential backoff
    - Prompt sanitization
    - JSON parsing robustness
    - Integration with specialized tasks (e.g. Image Description)
    """

    def __init__(self):
        self.model = None
        if settings.google_api_key:
            genai.configure(api_key=settings.google_api_key)
            self.model = genai.GenerativeModel('gemini-2.0-flash')

    def _sanitize_input(self, text: str) -> str:
        """Prevent prompt injection by escaping quotes and limiting length."""
        # Simple sanitization
        clean_text = text.replace('"', '\\"').replace('\n', ' ')
        return clean_text[:5000] # Limit to 5000 chars

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True
    )
    async def _call_gemini(self, prompt: str) -> str:
        """Call Gemini with strict timeout and retry."""
        if not self.model:
            raise ValueError("Gemini is not configured")
            
        # genai SDK doesn't have a direct timeout in generate_content_async yet 
        # but we can wrap it
        response = await asyncio.wait_for(
            self.model.generate_content_async(prompt),
            timeout=30.0
        )
        return response.text

    @cached(prefix="analysis", ttl=settings.cache_ttl_analysis)
    async def analyze(self, request: AnalysisRequest) -> AnalysisResponse:
        start_time = time.time()
        
        # 1. Sanitize Input
        safe_text = self._sanitize_input(request.text)
        
        # 2. Build Prompt
        if request.task_type == AnalysisTaskType.IMAGE_DESCRIPTION:
            prompt = self._get_image_description_prompt(safe_text, request.context)
        else:
            prompt = self._get_general_analysis_prompt(safe_text, request.context, request.user_native_language)

        try:
            # 3. Call AI
            raw_response = await self._call_gemini(prompt)
            
            # 4. Enhanced Robust Parsing
            from app.utils.robust_json_parser import parse_gemini_analysis
            data = parse_gemini_analysis(raw_response)
            
            # 5. Build Response
            return self._build_response(data, start_time, None)

        except Exception as e:
            logger.error("analysis_failed", error=str(e), user_id=request.user_id)
            raise

    def _build_response(self, data: Dict[str, Any], start_time: float, shadowing_url: Optional[str]) -> AnalysisResponse:
        # Normalization if it was an image description
        if "cefr_level" in data:
             # Map image description specific format to standard AnalysisResponse
             data["cefr_assessment"] = {
                 "level": data.get("cefr_level", "A1"),
                 "score": (data.get("grammar_score", 0) + data.get("vocabulary_score", 0)) / 2,
                 "confidence": 0.8,
                 "strengths": [],
                 "weaknesses": [],
                 "next_level_requirements": []
             }
             data["metrics"] = {
                 "wpm": 0,
                 "unique_words": 0,
                 "grammar_score": data.get("grammar_score", 0),
                 "vocabulary_score": data.get("vocabulary_score", 0)
             }
             data["strengths"] = data.get("strengths", [])
             data["improvement_areas"] = []
             data["recommended_tasks"] = []

        return AnalysisResponse(
            **data,
            shadowing_audio_url=shadowing_url,
            processing_time=time.time() - start_time
        )

analysis_service = AnalysisService()
