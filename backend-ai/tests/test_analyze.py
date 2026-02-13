import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_analyze_structure():
    """Test the API response structure for analysis."""
    payload = {
        "text": "I is a student",
        "user_id": "user_123",
        "session_id": "session_456"
    }
    
    with patch("app.api.routes.analyze.analysis_service.analyze") as mock_analyze:
        mock_analyze.return_value = {
            "cefr_assessment": {"level": "A1", "score": 20, "confidence": 0.9, "strengths": [], "weaknesses": [], "next_level_requirements": []},
            "errors": [],
            "metrics": {"wpm": 0, "unique_words": 0, "grammar_score": 0, "vocabulary_score": 0},
            "feedback": "Keep practicing",
            "strengths": [],
            "improvement_areas": [],
            "recommended_tasks": [],
            "processing_time": 0.1
        }
        
        response = client.post("/api/analyze", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["cefr_assessment"]["level"] == "A1"
