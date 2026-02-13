"""
Robust JSON parser for LLM responses.
Handles malformed JSON, schema validation, and fallbacks.
"""
import json
import re
from typing import Any, Dict, Optional, Type
from pydantic import BaseModel, ValidationError
from app.core.logging import get_logger

logger = get_logger(__name__)


class RobustJSONParser:
    """
    Production-grade JSON parser for LLM responses.
    
    Handles:
    - Markdown code blocks
    - Trailing commas
    - Comments in JSON
    - Escaped characters
    - Schema validation
    - Partial JSON recovery
    """
    
    @staticmethod
    def extract_json(text: str) -> str:
        """
        Extract JSON from various text formats.
        
        Handles:
        - ```json ... ```
        - ``` ... ```
        - Plain JSON
        - JSON with surrounding text
        """
        # Remove markdown code blocks
        text = text.strip()
        
        # Pattern 1: ```json ... ```
        json_block = re.search(r'```json\s*\n(.*?)\n```', text, re.DOTALL)
        if json_block:
            return json_block.group(1).strip()
        
        # Pattern 2: ``` ... ```
        code_block = re.search(r'```\s*\n(.*?)\n```', text, re.DOTALL)
        if code_block:
            content = code_block.group(1).strip()
            # Check if it's JSON
            if content.startswith('{') or content.startswith('['):
                return content
        
        # Pattern 3: Find JSON object/array in text
        # Look for the first { or [ and matching closing bracket
        start_brace = text.find('{')
        start_bracket = text.find('[')
        
        if start_brace == -1 and start_bracket == -1:
            # No JSON found
            return text
        
        # Use whichever comes first
        if start_brace != -1 and (start_bracket == -1 or start_brace < start_bracket):
            start = start_brace
            open_char = '{'
            close_char = '}'
        else:
            start = start_bracket
            open_char = '['
            close_char = ']'
        
        # Find matching closing bracket
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
        
        # If we get here, JSON is incomplete - return what we have
        logger.warning("JSON extraction: closing bracket not found")
        return text[start:]
    
    @staticmethod
    def clean_json(text: str) -> str:
        """
        Clean common JSON formatting issues.
        
        Fixes:
        - Trailing commas
        - Comments
        - Single quotes to double quotes
        - Unescaped newlines
        """
        # Remove comments (// and /* */)
        text = re.sub(r'//.*?$', '', text, flags=re.MULTILINE)
        text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
        
        # Remove trailing commas before } or ]
        text = re.sub(r',\s*([}\]])', r'\1', text)
        
        # Fix single quotes (be careful with contractions)
        # Only replace single quotes that are clearly JSON string delimiters
        text = re.sub(r"'([^']*?)'(?=\s*[,}\]:])", r'"\1"', text)
        
        # Remove escaped newlines within strings that break JSON
        text = text.replace('\n', '\\n')
        text = text.replace('\r', '\\r')
        text = text.replace('\t', '\\t')
        
        return text.strip()
    
    @staticmethod
    def parse_with_recovery(
        text: str,
        schema: Optional[Type[BaseModel]] = None,
        fallback: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Parse JSON with multiple recovery strategies.
        
        Args:
            text: Text containing JSON
            schema: Optional Pydantic model for validation
            fallback: Default value if all parsing fails
        
        Returns:
            Parsed and validated JSON dict
        """
        if not text or not text.strip():
            logger.warning("Empty text provided to JSON parser")
            return fallback or {}
        
        # Strategy 1: Direct parse
        try:
            data = json.loads(text)
            if schema:
                validated = schema(**data)
                return validated.model_dump()
            return data
        except json.JSONDecodeError:
            logger.debug("Direct JSON parse failed, trying extraction")
        except ValidationError as e:
            logger.warning(f"Schema validation failed: {e}")
            # Continue with extracted data if validation fails
        
        # Strategy 2: Extract and clean
        try:
            extracted = RobustJSONParser.extract_json(text)
            cleaned = RobustJSONParser.clean_json(extracted)
            data = json.loads(cleaned)
            
            if schema:
                try:
                    validated = schema(**data)
                    return validated.model_dump()
                except ValidationError as e:
                    logger.warning(f"Schema validation failed after extraction: {e}")
                    # Return unvalidated data
                    return data
            return data
        except json.JSONDecodeError as e:
            logger.warning(f"JSON parse failed after cleaning: {e}")
        
        # Strategy 3: Try to fix common issues manually
        try:
            fixed = RobustJSONParser._fix_common_issues(text)
            data = json.loads(fixed)
            
            if schema:
                try:
                    validated = schema(**data)
                    return validated.model_dump()
                except ValidationError:
                    return data
            return data
        except Exception as e:
            logger.error(f"All JSON parsing strategies failed: {e}")
        
        # Strategy 4: Partial recovery
        try:
            partial = RobustJSONParser._recover_partial_json(text)
            if partial:
                logger.info("Recovered partial JSON")
                return partial
        except Exception as e:
            logger.error(f"Partial JSON recovery failed: {e}")
        
        # Final fallback
        logger.error("All recovery strategies exhausted, using fallback")
        return fallback or {
            "error": "Failed to parse JSON",
            "raw_text": text[:500]  # Include sample for debugging
        }
    
    @staticmethod
    def _fix_common_issues(text: str) -> str:
        """Fix common LLM JSON generation issues."""
        # Extract JSON if embedded
        text = RobustJSONParser.extract_json(text)
        
        # Clean
        text = RobustJSONParser.clean_json(text)
        
        # Fix missing closing brackets (attempt)
        open_braces = text.count('{') - text.count('}')
        open_brackets = text.count('[') - text.count(']')
        
        if open_braces > 0:
            text += '}' * open_braces
        if open_brackets > 0:
            text += ']' * open_brackets
        
        return text
    
    @staticmethod
    def _recover_partial_json(text: str) -> Optional[Dict[str, Any]]:
        """
        Attempt to recover usable data from malformed JSON.
        
        Extracts key-value pairs even if overall structure is broken.
        """
        result = {}
        
        # Try to find key-value patterns
        # Pattern: "key": "value" or "key": number or "key": boolean
        string_pattern = r'"(\w+)":\s*"([^"]*)"'
        number_pattern = r'"(\w+)":\s*(\d+\.?\d*)'
        bool_pattern = r'"(\w+)":\s*(true|false)'
        
        # Extract string values
        for match in re.finditer(string_pattern, text):
            key, value = match.groups()
            result[key] = value
        
        # Extract number values
        for match in re.finditer(number_pattern, text):
            key, value = match.groups()
            try:
                result[key] = float(value) if '.' in value else int(value)
            except ValueError:
                pass
        
        # Extract boolean values
        for match in re.finditer(bool_pattern, text):
            key, value = match.groups()
            result[key] = value.lower() == 'true'
        
        # Try to extract arrays
        array_pattern = r'"(\w+)":\s*\[([^\]]*)\]'
        for match in re.finditer(array_pattern, text):
            key, array_content = match.groups()
            # Try to parse array items
            items = [item.strip(' "\'') for item in array_content.split(',')]
            result[key] = items
        
        return result if result else None


class GeminiResponseParser:
    """
    Specialized parser for Google Gemini responses.
    Includes domain-specific validation for Englivo analysis.
    """
    
    @staticmethod
    def parse_analysis_response(text: str) -> Dict[str, Any]:
        """
        Parse Gemini analysis response with Englivo-specific defaults.
        
        Expected schema:
        {
          "errors": [...],
          "feedback": "...",
          "strengths": [...],
          "improvement_areas": [...],
          "recommended_tasks": [...]
        }
        """
        # Define fallback structure
        fallback = {
            "errors": [],
            "feedback": "Analysis completed. Continue practicing.",
            "strengths": ["Speaking practice"],
            "improvement_areas": ["Overall fluency"],
            "recommended_tasks": []
        }
        
        # Parse with recovery
        result = RobustJSONParser.parse_with_recovery(
            text,
            schema=None,  # Can add Pydantic schema here
            fallback=fallback
        )
        
        # Ensure required fields exist
        result.setdefault("errors", [])
        result.setdefault("feedback", fallback["feedback"])
        result.setdefault("strengths", fallback["strengths"])
        result.setdefault("improvement_areas", fallback["improvement_areas"])
        result.setdefault("recommended_tasks", [])
        
        # Validate errors structure
        validated_errors = []
        for error in result.get("errors", []):
            if isinstance(error, dict):
                # Ensure required error fields
                validated_error = {
                    "type": error.get("type", "grammar"),
                    "severity": error.get("severity", "medium"),
                    "original_text": error.get("original_text", ""),
                    "corrected_text": error.get("corrected_text", ""),
                    "explanation": error.get("explanation", ""),
                    "suggestion": error.get("suggestion"),
                    "rule": error.get("rule")
                }
                validated_errors.append(validated_error)
        
        result["errors"] = validated_errors
        
        logger.info(f"Parsed Gemini response: {len(validated_errors)} errors found")
        return result


# Convenience functions
def parse_llm_json(text: str, fallback: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Parse JSON from any LLM response."""
    return RobustJSONParser.parse_with_recovery(text, fallback=fallback)


def parse_gemini_analysis(text: str) -> Dict[str, Any]:
    """Parse Gemini analysis response with domain validation."""
    return GeminiResponseParser.parse_analysis_response(text)
