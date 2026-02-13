"""
Robust JSON parser for LLM responses.
Handles malformed JSON, schema validation, and fallbacks.
"""
import json
import re
from typing import Any, Dict, Optional, Type
from pydantic import BaseModel, ValidationError
from app.core.logging import logger

class RobustJSONParser:
    """
    Production-grade JSON parser for LLM responses.
    """
    
    @staticmethod
    def extract_json(text: str) -> str:
        """
        Extract JSON from various text formats.
        """
        text = text.strip()
        
        # Pattern 1: ```json ... ```
        json_block = re.search(r'```json\s*\n(.*?)\n```', text, re.DOTALL)
        if json_block:
            return json_block.group(1).strip()
        
        # Pattern 2: ``` ... ```
        code_block = re.search(r'```\s*\n(.*?)\n```', text, re.DOTALL)
        if code_block:
            content = code_block.group(1).strip()
            if content.startswith('{') or content.startswith('['):
                return content
        
        # Pattern 3: Find JSON object/array in text
        start_brace = text.find('{')
        start_bracket = text.find('[')
        
        if start_brace == -1 and start_bracket == -1:
            return text
        
        if start_brace != -1 and (start_bracket == -1 or start_brace < start_bracket):
            start = start_brace
            open_char = '{'
            close_char = '}'
        else:
            start = start_bracket
            open_char = '['
            close_char = ']'
        
        count = 0
        in_string = False
        escape_next = False
        
        for i in range(start, len(text)):
            char = text[i]
            if escape_next:
                escape_next = False
                continue
            if char == '\\':
                escape_next = True
                continue
            if char == '"' and not escape_next:
                in_string = not in_string
                continue
            if not in_string:
                if char == open_char:
                    count += 1
                elif char == close_char:
                    count -= 1
                    if count == 0:
                        return text[start:i+1]
        
        return text[start:]
    
    @staticmethod
    def clean_json(text: str) -> str:
        """Clean common JSON formatting issues."""
        text = re.sub(r'//.*?$', '', text, flags=re.MULTILINE)
        text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
        text = re.sub(r',\s*([}\]])', r'\1', text)
        text = re.sub(r"'([^']*?)'(?=\s*[,}\]:])", r'"\1"', text)
        return text.strip()
    
    @staticmethod
    def parse_with_recovery(
        text: str,
        schema: Optional[Type[BaseModel]] = None,
        fallback: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Parse JSON with multiple recovery strategies."""
        if not text or not text.strip():
            return fallback or {}
        
        # Strategy 1: Direct parse
        try:
            data = json.loads(text)
            if schema:
                validated = schema(**data)
                return validated.model_dump()
            return data
        except (json.JSONDecodeError, ValidationError):
            pass
        
        # Strategy 2: Extract and clean
        try:
            extracted = RobustJSONParser.extract_json(text)
            cleaned = RobustJSONParser.clean_json(extracted)
            data = json.loads(cleaned)
            if schema:
                validated = schema(**data)
                return validated.model_dump()
            return data
        except (json.JSONDecodeError, ValidationError):
            pass
        
        return fallback or {}


class GeminiResponseParser:
    """Specialized parser for Gemini responses."""
    
    @staticmethod
    def parse_analysis_response(text: str) -> Dict[str, Any]:
        fallback = {
            "errors": [],
            "feedback": "Analysis completed.",
            "strengths": [],
            "improvement_areas": [],
            "recommended_tasks": []
        }
        
        result = RobustJSONParser.parse_with_recovery(text, fallback=fallback)
        
        # Ensure consistent structure
        for key in fallback:
            result.setdefault(key, fallback[key])
        
        return result

def parse_gemini_analysis(text: str) -> Dict[str, Any]:
    return GeminiResponseParser.parse_analysis_response(text)
