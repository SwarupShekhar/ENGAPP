from typing import List, Dict, Any
from app.core.logging import logger
from app.models.base import CEFRLevel

class AggregationService:
    """
    Service for aggregating AI insights across multiple sessions.
    """

    async def analyze_user_progress(self, user_id: str, session_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Analyze trends in CEFR levels and error patterns.
        """
        if not session_data:
            return {"status": "no_data"}

        # Sort by timestamp/sequence if available
        # Placeholder for real DB aggregation logic
        
        cefr_trend = []
        error_patterns = {}
        
        for session in session_data:
            cefr = session.get("cefr_level")
            if cefr:
                cefr_trend.append(cefr)
            
            errors = session.get("errors", [])
            for error in errors:
                error_type = error.get("type")
                error_patterns[error_type] = error_patterns.get(error_type, 0) + 1

        # Identify most common error
        top_errors = sorted(error_patterns.items(), key=lambda x: x[1], reverse=True)[:3]

        return {
            "user_id": user_id,
            "sessions_analyzed": len(session_data),
            "cefr_trend": cefr_trend,
            "common_errors": [e[0] for e in top_errors],
            "improvement_indices": {
                "fluency": 0.05, # Placeholder
                "grammar": 0.02
            }
        }

aggregation_service = AggregationService()
