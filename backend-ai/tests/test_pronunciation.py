import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_pronunciation_structure():
    """Test the API response structure for pronunciation."""
    payload = {
        "audio_url": "https://example.com/audio.wav",
        "reference_text": "Hello world",
        "user_id": "user_123"
    }
    
    with patch("app.api.routes.pronunciation.pronunciation_service.assess") as mock_assess:
        mock_assess.return_value = {
            "accuracy_score": 85,
            "fluency_score": 80,
            "completeness_score": 100,
            "pronunciation_score": 83,
            "words": [],
            "common_issues": [],
            "improvement_tips": [],
            "processing_time": 0.5,
            "prosody_score": 75,
            "speech_rate_wpm": 120,
            "pitch_variance": 30
        }
        
        response = client.post("/api/pronunciation", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["accuracy_score"] == 85
