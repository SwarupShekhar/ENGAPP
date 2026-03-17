import base64
import httpx
import re
from typing import Optional
from app.core.config import settings
from app.core.logging import logger

class InworldTTSService:
    def __init__(self):
        self.api_key = settings.inworld_api_key
        self.jwt_key = settings.inworld_jwt_key
        self.jwt_secret = settings.inworld_jwt_secret
        self.endpoint = "https://api.inworld.ai/tts/v1/voice"
        self.auth_header: Optional[str] = ""
        
        # Inworld TTS requires Basic Auth with apiKey:apiSecret
        if self.jwt_key and self.jwt_secret:
            auth_str = f"{self.jwt_key}:{self.jwt_secret}"
            self.auth_header = f"Basic {base64.b64encode(auth_str.encode()).decode()}"
        elif self.api_key:
            # If the provided api_key is already the base64 encoded string (starting with 'Basic ' or not)
            if self.api_key.startswith("Basic "):
                self.auth_header = self.api_key
            else:
                self.auth_header = f"Basic {self.api_key}"
        else:
            self.auth_header = None
            logger.warning("Inworld AI credentials (JWT Key or API Key) not configured.")

    def synthesize_hinglish(self, text: str, gender: str = 'female') -> bytes:
        """
        Synthesize text using Inworld AI TTS.
        """
        if not self.auth_header:
            logger.error("Inworld TTS service is not configured.")
            return b""

        # Robust emoji removal - specifically targeting the emoji unicode range
        # Similar to Azure TTS service for consistency
        clean_text = re.sub(r'[\U00010000-\U0010ffff]', '', text)
        clean_text = re.sub(r'[^\w\s,!.?\'"]', '', clean_text)

        payload = {
            "text": clean_text,
            "voiceId": settings.inworld_character_id or "Abbby",
            "modelId": "inworld-tts-1.5-max",
            "timestampType": "WORD"
        }

        headers = {
            "Authorization": self.auth_header,
            "Content-Type": "application/json"
        }

        try:
            with httpx.Client() as client:
                response = client.post(self.endpoint, json=payload, headers=headers, timeout=30.0)
                
                if response.status_code != 200:
                    logger.error(f"Inworld TTS API error: {response.status_code} - {response.text}")
                    return b""
                
                result = response.json()
                audio_content = result.get("audioContent")
                
                if not audio_content:
                    logger.error("Inworld TTS API returned no audio content")
                    return b""
                
                return base64.b64decode(audio_content)
        except Exception as e:
            logger.error(f"Error calling Inworld TTS API: {e}")
            return b""

inworld_tts_service = InworldTTSService()
