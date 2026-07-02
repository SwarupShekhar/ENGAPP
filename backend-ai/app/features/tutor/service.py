import azure.cognitiveservices.speech as speechsdk
import asyncio
import io
from typing import AsyncGenerator
import logging
import os
from .llm.router import TutorLLMRouter
from .pronunciation_capture import strip_pron_tags_for_mobile
from app.core.config import settings

try:
    from ..transcription.optimized_tts_service import OptimizedTTSService
except ImportError:
    OptimizedTTSService = None  # type: ignore

try:
    from ..transcription.inworld_tts_service import InworldTTSService
except ImportError:
    InworldTTSService = None  # type: ignore

try:
    from ..transcription.google_gemini_tts_service import GoogleGeminiTTSService
except ImportError:
    GoogleGeminiTTSService = None  # type: ignore

logger = logging.getLogger(__name__)

class StreamingTutorService:
    def __init__(self):
        self.speech_key = os.getenv('AZURE_SPEECH_KEY')
        self.speech_region = os.getenv('AZURE_SPEECH_REGION')

        # Initialize sub-services
        self.llm_router = TutorLLMRouter()

        # Maya tutor (Pulse) MUST use Inworld TTS. Azure is only for prosody / PA / STT.
        # Order: honor settings.tts_provider first; legacy USE_INWORLD_TTS env kept as override.
        env_use_inworld = os.getenv('USE_INWORLD_TTS', '').lower() in ('1', 'true', 'yes')
        prefer_inworld = (
            settings.tts_provider == "inworld"
            or settings.disable_azure_tts
            or env_use_inworld
        )
        azure_tts_disabled = settings.disable_azure_tts or prefer_inworld
        if azure_tts_disabled:
            logger.info("Azure TTS disabled for tutor (Inworld primary)")

        tts_service_candidates: list[tuple[str, type]] = []
        if prefer_inworld:
            if InworldTTSService is not None:
                tts_service_candidates.append(("InworldTTS", InworldTTSService))
            if GoogleGeminiTTSService is not None:
                tts_service_candidates.append(("GoogleGeminiTTS", GoogleGeminiTTSService))
            if not azure_tts_disabled and OptimizedTTSService is not None:
                tts_service_candidates.append(("OptimizedTTS", OptimizedTTSService))
        else:
            if not azure_tts_disabled and OptimizedTTSService is not None:
                tts_service_candidates.append(("OptimizedTTS", OptimizedTTSService))
            if InworldTTSService is not None:
                tts_service_candidates.append(("InworldTTS", InworldTTSService))
            if GoogleGeminiTTSService is not None:
                tts_service_candidates.append(("GoogleGeminiTTS", GoogleGeminiTTSService))

        self.tts_services: list[tuple[str, object]] = []
        for service_name, service_class in tts_service_candidates:
            try:
                instance = service_class()
                if hasattr(instance, "is_configured") and not instance.is_configured():
                    logger.info("%s skipped (not configured)", service_name)
                    continue
                self.tts_services.append((service_name, instance))
                logger.info("Initialized %s for TTS", service_name)
            except Exception as e:
                logger.error("Failed to initialize %s: %s", service_name, e)

        # Primary for legacy callers
        self.tts_service = self.tts_services[0][1] if self.tts_services else None
        if self.tts_services:
            chain = " -> ".join(name for name, _ in self.tts_services)
            logger.info("Maya TTS chain: %s", chain)
        
        if not self.speech_key or not self.speech_region:
            logger.warning("Azure Speech credentials not found. Streaming features will be disabled.")
            return

        self.speech_config = speechsdk.SpeechConfig(
            subscription=self.speech_key,
            region=self.speech_region
        )
        self.speech_config.speech_recognition_language = "en-US"
        
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
        Run STT in-process using Azure Speech (same locale as pronunciation assessment).
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

    async def _synthesize_tts_sentence(self, text: str) -> bytes | None:
        """Try each TTS provider in order until one returns audio."""
        for service_name, svc in self.tts_services:
            try:
                audio_bytes = await svc.synthesize_sentence(text)
                if audio_bytes:
                    return audio_bytes
                logger.warning("%s returned empty audio for sentence", service_name)
            except Exception as e:
                logger.error("%s synthesis failed: %s", service_name, e)
        return None

    async def generate_chunked_response(
        self,
        user_utterance: str,
        conversation_history: list,
        session_id: str,
        phonetic_context: dict | None = None,
        audio_base64: str | None = None,
        cefr_level: str | None = None,
    ) -> AsyncGenerator[dict, None]:
        """
        Generate AI response in chunks. Emits transcript first so mobile can show it immediately.
        cefr_level (A1..C2) tunes Maya's vocabulary + sentence complexity to the learner.
        """
        # Emit transcript immediately — mobile can show it while audio loads
        yield {
            "type": "transcript",
            "text": user_utterance,
            "is_final": True,
        }

        # Stream Gemini text first; overlap TTS so sentence 2 synth runs during sentence 1 playback prep.
        pending_tts: asyncio.Task | None = None
        async for sentence in self.llm_router.stream_response(
            user_utterance,
            conversation_history,
            phonetic_context,
            audio_base64,
            cefr_level=cefr_level,
        ):
            tts_input = strip_pron_tags_for_mobile(sentence)
            yield {
                "type": "sentence",
                "text": sentence,
                "audio": None,
                "is_final": False,
            }
            if pending_tts is not None:
                try:
                    prev_audio = await pending_tts
                    if prev_audio:
                        yield {
                            "type": "audio",
                            "audio": prev_audio,
                            "is_final": False,
                        }
                except Exception as e:
                    logger.warning("TTS task failed: %s", e)
            if self.tts_services and tts_input:
                pending_tts = asyncio.create_task(self._synthesize_tts_sentence(tts_input))
            else:
                pending_tts = None
            await asyncio.sleep(0)

        if pending_tts is not None:
            try:
                last_audio = await pending_tts
                if last_audio:
                    yield {
                        "type": "audio",
                        "audio": last_audio,
                        "is_final": False,
                    }
            except Exception as e:
                logger.warning("Final TTS task failed: %s", e)

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
