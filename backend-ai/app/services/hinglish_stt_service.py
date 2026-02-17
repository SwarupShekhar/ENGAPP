import os
import azure.cognitiveservices.speech as speechsdk
from app.core.config import settings
from app.core.logging import logger

class HinglishSTTService:
    def __init__(self):
        if not settings.azure_speech_key or not settings.azure_speech_region:
            logger.warning("Azure Speech credentials not configured for HinglishSTTService.")
            self.speech_config = None
            return

        self.speech_config = speechsdk.SpeechConfig(
            subscription=settings.azure_speech_key,
            region=settings.azure_speech_region
        )
        
        # Enable continuous language identification for Indian English and Hindi
        self.auto_detect_config = speechsdk.languageconfig.AutoDetectSourceLanguageConfig(
            languages=["en-IN", "hi-IN"]
        )
    
    def transcribe_hinglish(self, audio_data: bytes):
        """
        Transcribe Hinglish audio with automatic language switching.
        Note: This is a basic implementation. For production, consider using
        push streams as seen in TranscriptionService for better memory management.
        """
        if not self.speech_config:
            raise RuntimeError("Hinglish STT service is not configured.")

        # Create a temporary file for the audio data as Azure SDK works best with files or streams
        # Simplified for now, using a push stream would be better
        import tempfile
        with tempfile.NamedTemporaryFile(delete=True, suffix=".wav") as temp_audio:
            temp_audio.write(audio_data)
            temp_audio.flush()
            
            audio_config = speechsdk.audio.AudioConfig(filename=temp_audio.name)
            
            speech_recognizer = speechsdk.SpeechRecognizer(
                speech_config=self.speech_config,
                auto_detect_source_language_config=self.auto_detect_config,
                audio_config=audio_config
            )
            
            result = speech_recognizer.recognize_once()
            
            if result.reason == speechsdk.ResultReason.RecognizedSpeech:
                detected_language = result.properties.get(
                    speechsdk.PropertyId.SpeechServiceConnection_AutoDetectSourceLanguageResult
                )
                return {
                    'text': result.text,
                    'language': detected_language,
                }
            elif result.reason == speechsdk.ResultReason.NoMatch:
                logger.info("No speech could be recognized.")
                return {'text': "", 'language': None}
            elif result.reason == speechsdk.ResultReason.Canceled:
                cancellation_details = result.cancellation_details
                logger.error(f"Speech Recognition canceled: {cancellation_details.reason}")
                return {'text': "", 'language': None, 'error': cancellation_details.error_details}
            
            return {'text': "", 'language': None}

hinglish_stt_service = HinglishSTTService()
