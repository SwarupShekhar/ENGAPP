import io
import azure.cognitiveservices.speech as speechsdk
from app.core.config import settings
from app.core.logging import logger

class HinglishTTSService:
    def __init__(self):
        if not settings.azure_speech_key or not settings.azure_speech_region:
            logger.warning("Azure Speech credentials not configured for HinglishTTSService.")
            self.speech_config = None
            return

        self.speech_config = speechsdk.SpeechConfig(
            subscription=settings.azure_speech_key,
            region=settings.azure_speech_region,
        )
        self.speech_config.set_speech_synthesis_output_format(
            speechsdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3
        )

    def synthesize_hinglish(self, text: str, gender: str = 'female') -> bytes:
        """
        Synthesize mixed Hindi-English text using Azure Neural TTS.
        Azure's multi-lingual voices like en-IN-AnanyaNeural handle Hinglish naturally.
        """
        if not self.speech_config:
            logger.error("Hinglish TTS service is not configured.")
            return b""

        # Use Ananya (Neural) which is excellent for Indian English and handles Hindi words well
        voice_name = "en-IN-AnanyaNeural" 
        self.speech_config.speech_synthesis_voice_name = voice_name

        synthesizer = speechsdk.SpeechSynthesizer(speech_config=self.speech_config, audio_config=None)
        
        # Robust emoji removal - specifically targeting the emoji unicode range
        import re
        # Remove characters in the emoji/pictographic range
        clean_text = re.sub(r'[\U00010000-\U0010ffff]', '', text)
        # Also apply a general safety filter for other non-alphanumeric chars (excluding punctuation)
        clean_text = re.sub(r'[^\w\s,!.?\'"]', '', clean_text)
        
        # Wrap text in SSML to ensure proper handling if needed, 
        # but for Neerja/Ananya, plain text often works surprisingly well for Hinglish.
        # Let's use simple synthesis first.
        result = synthesizer.speak_text_async(clean_text).get()

        if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
            return result.audio_data
        elif result.reason == speechsdk.ResultReason.Canceled:
            cancellation_details = result.cancellation_details
            logger.error(f"Speech synthesis canceled: {cancellation_details.reason}")
            if cancellation_details.reason == speechsdk.CancellationReason.Error:
                logger.error(f"Error details: {cancellation_details.error_details}")
            return b""
        
        return b""

hinglish_tts_service = HinglishTTSService()
