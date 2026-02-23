import azure.cognitiveservices.speech as speechsdk
import asyncio
from typing import AsyncGenerator
import logging
import os
from .streaming_gemini_service import StreamingGeminiService
from .optimized_tts_service import OptimizedTTSService

logger = logging.getLogger(__name__)

class StreamingTutorService:
    def __init__(self):
        self.speech_key = os.getenv('AZURE_SPEECH_KEY')
        self.speech_region = os.getenv('AZURE_SPEECH_REGION')
        
        # Initialize sub-services
        self.gemini_service = StreamingGeminiService()
        try:
            self.tts_service = OptimizedTTSService()
        except Exception as e:
            logger.error(f"Failed to initialize OptimizedTTSService: {e}")
            self.tts_service = None
        
        if not self.speech_key or not self.speech_region:
            logger.warning("Azure Speech credentials not found. Streaming features will be disabled.")
            return

        self.speech_config = speechsdk.SpeechConfig(
            subscription=self.speech_key,
            region=self.speech_region
        )
        self.speech_config.speech_recognition_language = "en-IN"
        
        # Enable streaming
        self.speech_config.set_property(
            speechsdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs,
            "3000"
        )
        self.speech_config.set_property(
            speechsdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs,
            "1000"  # Respond after 1 sec silence
        )

    async def stream_recognition(
        self,
        audio_stream,
        on_partial: callable,
        on_final: callable
    ):
        """
        Stream STT with callbacks:
        - on_partial(text): fires during speech (realtime transcription)
        - on_final(text): fires when user stops speaking
        """
        
        # Note: audio_stream needs to be a compatible stream format for Azure SDK
        # This implementation requires strict stream handling which depends on the input source
        pass

    async def generate_chunked_response(
        self,
        user_utterance: str,
        conversation_history: list,
        session_id: str,
        phonetic_context: dict | None = None,
        audio_base64: str | None = None
    ) -> AsyncGenerator[dict, None]:
        """
        Generate AI response in chunks with optional audio for pronunciation analysis.
        """
        
        # STREAM SENTENCES FROM GEMINI
        async for sentence in self.gemini_service.stream_response(
            user_utterance,
            conversation_history,
            phonetic_context,
            audio_base64
        ):
            # Generate TTS for this sentence
            audio_bytes = None
            if self.tts_service:
                try:
                    audio_bytes = await self.tts_service.synthesize_sentence(sentence)
                except Exception as e:
                    logger.error(f"TTS Synthesis failed for sentence '{sentence}': {e}")
            
            yield {
                'type': 'sentence',
                'text': sentence,
                'audio': audio_bytes,
                'is_final': False,
            }
            
            await asyncio.sleep(0.01)

    def get_quick_acknowledgment(self, text: str) -> str:
        """
        Return pre-cached acknowledgment based on text content.
        """
        text_lower = text.lower()
        
        if any(word in text_lower for word in ['hello', 'hi', 'hey', 'namaste']):
            return "Hi there!"
        
        if any(word in text_lower for word in ['thanks', 'thank you', 'shukriya']):
            return "You're welcome!"
            
        return ""
