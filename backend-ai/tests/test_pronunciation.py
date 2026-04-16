from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_pronunciation_assess_json_azure_result_path():
    """POST /api/pronunciation/assess with JSON azure_result avoids Azure audio calls."""
    payload = {
        "azure_result": {
            "NBest": [{"Words": [{"AccuracyScore": 90, "Word": "hello"}]}],
        }
    }
    with (
        patch(
            "app.features.pronunciation.routes.detect_from_azure_result",
            return_value=[],
        ) as mock_detect,
        patch(
            "app.features.pronunciation.routes.calculate_pronunciation_score",
            return_value={"overall": 83.0},
        ) as mock_score,
    ):
        response = client.post("/api/pronunciation/assess", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert "flagged_errors" in data
        assert "pronunciation_score" in data
        assert data["pronunciation_score"] == {"overall": 83.0}
        mock_detect.assert_called_once()
        mock_score.assert_called_once()
