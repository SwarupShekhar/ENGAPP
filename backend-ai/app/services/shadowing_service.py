import os
import uuid
import asyncio
import azure.cognitiveservices.speech as speechsdk
from app.core.config import settings
from app.core.logging import logger

class ShadowingService:
    """Service to generate high-quality TTS for shadowing tasks."""
    
    def __init__(self):
        self.speech_config = None
        if settings.azure_speech_key and settings.azure_speech_region:
            self.speech_config = speechsdk.SpeechConfig(
                subscription=settings.azure_speech_key,
                region=settings.azure_speech_region
            )
            self.speech_config.speech_synthesis_voice_name = "en-US-JennyNeural"

    async def generate_shadowing_audio(self, text: str) -> Optional[str]:
        """Generates TTS audio file and returns access URL."""
        if not self.speech_config:
            return None

        try:
            filename = f"shadow_{uuid.uuid4()}.wav"
            output_dir = "static/audio"
            os.makedirs(output_dir, exist_ok=True)
            output_path = os.path.join(output_dir, filename)
            
            audio_config = speechsdk.audio.AudioOutputConfig(filename=output_path)
            synthesizer = speechsdk.SpeechSynthesizer(
                speech_config=self.speech_config, 
                audio_config=audio_config
            )
            
            # Run in executor to avoid blocking
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, lambda: synthesizer.speak_text_async(text).get())
            
            if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
                logger.info("shadowing_audio_generated", filename=filename)
                return f"/static/audio/{filename}"
            
            return None
                
        except Exception as e:
            logger.error("shadowing_failed", error=str(e))
            return None

shadowing_service = ShadowingService()
