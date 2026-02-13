import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_transcribe_structure():
    """Test the API response structure for transcription."""
    payload = {
        "audio_url": "https://example.com/audio.wav",
        "user_id": "user_123",
        "session_id": "session_456"
    }
    
    # Mock the service to avoid actual Azure calls
    with patch("app.api.routes.transcribe.transcription_service.transcribe") as mock_transcribe:
        mock_transcribe.return_value = AsyncMock()
        mock_transcribe.return_value = {
            "text": "Hello world",
            "confidence": 0.95,
            "words": [],
            "duration": 2.5,
            "processing_time": 0.5
        }
        
        response = client.post("/api/transcribe", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "data" in data
        assert "meta" in data
        assert data["data"]["text"] == "Hello world"
