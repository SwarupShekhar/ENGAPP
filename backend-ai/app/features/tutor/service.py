import azure.cognitiveservices.speech as speechsdk
import asyncio
import io
from typing import AsyncGenerator
import logging
import os
from .streaming_gemini_service import StreamingGeminiService

try:
    from .optimized_tts_service import OptimizedTTSService
except ImportError:
    OptimizedTTSService = None  # type: ignore

logger = logging.getLogger(__name__)

class StreamingTutorService:
    def __init__(self):
        self.speech_key = os.getenv('AZURE_SPEECH_KEY')
        self.speech_region = os.getenv('AZURE_SPEECH_REGION')
        
        # Initialize sub-services
        self.gemini_service = StreamingGeminiService()
        try:
            self.tts_service = OptimizedTTSService() if OptimizedTTSService else None
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

    def _convert_to_wav(self, audio_bytes: bytes) -> bytes:
        """Convert to 16kHz mono 16-bit WAV for Azure. Reuses same logic as HinglishSTTService."""
        try:
            from pydub import AudioSegment
        except ImportError:
            return audio_bytes
        audio = None
        for fmt in ["m4a", "mp3", "wav", "ogg", "webm", "flac"]:
            try:
                audio = AudioSegment.from_file(io.BytesIO(audio_bytes), format=fmt)
                break
            except Exception:
                continue
        if audio is None:
            return audio_bytes
        audio = audio.set_frame_rate(16000).set_channels(1).set_sample_width(2)
        wav_buf = io.BytesIO()
        audio.export(wav_buf, format="wav")
        return wav_buf.getvalue()

    async def recognize_audio_bytes(self, audio_bytes: bytes) -> str:
        """
        Run STT in-process via Azure push stream. Saves a full HTTP round-trip vs calling /stt.
        Returns recognized text or empty string on failure.
        """
        if not getattr(self, "speech_config", None):
            logger.warning("Azure Speech not configured, cannot recognize audio")
            return ""
        wav_bytes = self._convert_to_wav(audio_bytes)

        def _sync_recognize() -> str:
            stream = speechsdk.audio.PushAudioInputStream()
            audio_config = speechsdk.audio.AudioConfig(stream=stream)
            recognizer = speechsdk.SpeechRecognizer(
                speech_config=self.speech_config,
                audio_config=audio_config,
            )
            stream.write(wav_bytes)
            stream.close()
            result = recognizer.recognize_once()
            if result.reason == speechsdk.ResultReason.RecognizedSpeech:
                return result.text or ""
            return ""

        return await asyncio.to_thread(_sync_recognize)

    async def stream_recognition(
        self,
        audio_stream,
        on_partial: callable,
        on_final: callable
    ):
        """
        Stream STT with callbacks (optional future use).
        For single-shot transcript use recognize_audio_bytes instead.
        """
        # Real-time streaming would require continuous recognition; use recognize_audio_bytes for request/response.
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
        Generate AI response in chunks. Emits transcript first so mobile can show it immediately.
        """
        # Emit transcript immediately — mobile can show it while audio loads
        yield {
            "type": "transcript",
            "text": user_utterance,
            "is_final": True,
        }

        # Stream Gemini + TTS sentence by sentence
        async for sentence in self.gemini_service.stream_response(
            user_utterance,
            conversation_history,
            phonetic_context,
            audio_base64,
        ):
            audio_bytes = None
            if self.tts_service:
                try:
                    audio_bytes = await self.tts_service.synthesize_sentence(sentence)
                except Exception as e:
                    logger.error("TTS synthesis failed for sentence: %s", e)
            yield {
                "type": "sentence",
                "text": sentence,
                "audio": audio_bytes,
                "is_final": False,
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
