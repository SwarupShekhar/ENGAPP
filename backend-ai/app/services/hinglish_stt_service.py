import os
import io
import json
import tempfile
import azure.cognitiveservices.speech as speechsdk
from pydub import AudioSegment
from app.core.config import settings
from app.core.logging import logger
from app.models.response import (
    TutorPronunciationAssessmentResult,
    WordAssessment,
    PhonemeDetail,
)


class HinglishSTTService:
    def __init__(self):
        if not settings.azure_speech_key or not settings.azure_speech_region:
            logger.warning("Azure Speech credentials not configured for HinglishSTTService.")
            self.speech_config = None
            return

        self.speech_config = speechsdk.SpeechConfig(
            subscription=settings.azure_speech_key,
            region=settings.azure_speech_region,
        )

        # Enable continuous language identification for Indian English and Hindi
        self.auto_detect_config = speechsdk.languageconfig.AutoDetectSourceLanguageConfig(
            languages=["en-IN", "hi-IN"]
        )

    # ─── Audio Conversion ─────────────────────────────────────

    def _convert_to_wav(self, audio_bytes: bytes) -> bytes:
        """Convert any audio format to 16kHz mono 16-bit WAV for Azure."""
        audio: AudioSegment | None = None
        for fmt in ["m4a", "mp3", "wav", "ogg", "webm", "flac"]:
            try:
                audio = AudioSegment.from_file(io.BytesIO(audio_bytes), format=fmt)
                break
            except Exception:
                continue

        if audio is None:
            raise ValueError("Could not decode audio in any supported format")

        audio = audio.set_frame_rate(16000).set_channels(1).set_sample_width(2)
        wav_buf = io.BytesIO()
        audio.export(wav_buf, format="wav")
        return wav_buf.getvalue()

    # ─── Core Transcription (existing, preserved) ─────────────

    def transcribe_hinglish(self, audio_data: bytes) -> dict:
        """
        Transcribe Hinglish audio with automatic language switching.
        This is the original method kept intact for backward-compat.
        """
        if not self.speech_config:
            raise RuntimeError("Hinglish STT service is not configured.")

        with tempfile.NamedTemporaryFile(delete=True, suffix=".wav") as temp_audio:
            temp_audio.write(audio_data)
            temp_audio.flush()

            audio_config = speechsdk.audio.AudioConfig(filename=temp_audio.name)

            speech_recognizer = speechsdk.SpeechRecognizer(
                speech_config=self.speech_config,
                auto_detect_source_language_config=self.auto_detect_config,
                audio_config=audio_config,
            )

            result = speech_recognizer.recognize_once()

            if result.reason == speechsdk.ResultReason.RecognizedSpeech:
                detected_language = result.properties.get(
                    speechsdk.PropertyId.SpeechServiceConnection_AutoDetectSourceLanguageResult
                )
                return {"text": result.text, "language": detected_language}
            elif result.reason == speechsdk.ResultReason.NoMatch:
                logger.info("No speech could be recognized.")
                return {"text": "", "language": None}
            elif result.reason == speechsdk.ResultReason.Canceled:
                cancellation_details = result.cancellation_details
                logger.error(f"Speech Recognition canceled: {cancellation_details.reason}")
                return {"text": "", "language": None, "error": cancellation_details.error_details}

            return {"text": "", "language": None}

    # ─── Transcription with push-stream (for raw bytes) ───────

    def _transcribe_push_stream(self, wav_bytes: bytes) -> dict:
        """Transcribe using push-stream (no temp file)."""
        if not self.speech_config:
            raise RuntimeError("Hinglish STT service is not configured.")

        audio_stream = speechsdk.audio.PushAudioInputStream()
        audio_config = speechsdk.audio.AudioConfig(stream=audio_stream)

        recognizer = speechsdk.SpeechRecognizer(
            speech_config=self.speech_config,
            auto_detect_source_language_config=self.auto_detect_config,
            audio_config=audio_config,
        )

        audio_stream.write(wav_bytes)
        audio_stream.close()

        result = recognizer.recognize_once()

        if result.reason == speechsdk.ResultReason.RecognizedSpeech:
            detected_language = result.properties.get(
                speechsdk.PropertyId.SpeechServiceConnection_AutoDetectSourceLanguageResult,
                "en-IN",
            )
            return {"text": result.text, "language": detected_language, "success": True}
        elif result.reason == speechsdk.ResultReason.NoMatch:
            return {"text": "", "language": None, "success": False, "error": "No speech detected"}
        else:
            return {"text": "", "language": None, "success": False, "error": str(result.reason)}

    # ─── Feature 1: Pronunciation Assessment ──────────────────

    def assess_pronunciation(
        self,
        audio_bytes: bytes,
        reference_text: str,
    ) -> TutorPronunciationAssessmentResult:
        """
        Assess how well the user pronounced a specific reference phrase.
        Called when Priya asks the user to repeat a corrected phrase.
        """
        if not self.speech_config:
            raise RuntimeError("Hinglish STT service is not configured.")

        try:
            wav_bytes = self._convert_to_wav(audio_bytes)

            # Configure pronunciation assessment
            pronunciation_config = speechsdk.PronunciationAssessmentConfig(
                reference_text=reference_text,
                grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
                granularity=speechsdk.PronunciationAssessmentGranularity.Phoneme,
                enable_miscue=True,
            )
            pronunciation_config.enable_prosody_assessment()

            # Audio via push stream
            audio_stream = speechsdk.audio.PushAudioInputStream()
            audio_config = speechsdk.audio.AudioConfig(stream=audio_stream)

            # Fresh SpeechConfig scoped to this call (en-IN only for assessment)
            speech_cfg = speechsdk.SpeechConfig(
                subscription=settings.azure_speech_key,
                region=settings.azure_speech_region,
            )
            speech_cfg.speech_recognition_language = "en-IN"

            recognizer = speechsdk.SpeechRecognizer(
                speech_config=speech_cfg,
                audio_config=audio_config,
            )
            pronunciation_config.apply_to(recognizer)

            audio_stream.write(wav_bytes)
            audio_stream.close()

            result = recognizer.recognize_once()

            # ── No speech ────────────────────────────────────
            if result.reason == speechsdk.ResultReason.NoMatch:
                return TutorPronunciationAssessmentResult(
                    accuracy_score=0, fluency_score=0, completeness_score=0, prosody_score=0,
                    recognized_text="", reference_text=reference_text,
                    passed=False,
                    priya_feedback="मुझे आपकी आवाज़ सुनाई नहीं दी। Can you try again, a bit louder?",
                )

            if result.reason != speechsdk.ResultReason.RecognizedSpeech:
                return TutorPronunciationAssessmentResult(
                    accuracy_score=0, fluency_score=0, completeness_score=0, prosody_score=0,
                    recognized_text="", reference_text=reference_text,
                    passed=False,
                    priya_feedback="कुछ technical issue हो गया। Let's try once more?",
                )

            # ── Parse assessment result ──────────────────────
            pron_result = speechsdk.PronunciationAssessmentResult(result)

            raw_json_str = result.properties.get(
                speechsdk.PropertyId.SpeechServiceResponse_JsonResult, "{}"
            )
            raw_json = json.loads(raw_json_str)

            words_data: list[WordAssessment] = []
            problem_words: list[str] = []

            nbest = raw_json.get("NBest", [])
            if nbest:
                for word_raw in nbest[0].get("Words", []):
                    word_text = word_raw.get("Word", "")
                    wp = word_raw.get("PronunciationAssessment", {})
                    word_accuracy = wp.get("AccuracyScore", 0)
                    word_error = wp.get("ErrorType", "None")

                    phonemes = [
                        PhonemeDetail(
                            phoneme=p.get("Phoneme", ""),
                            accuracy_score=p.get("PronunciationAssessment", {}).get("AccuracyScore", 0),
                        )
                        for p in word_raw.get("Phonemes", [])
                    ]

                    words_data.append(WordAssessment(
                        word=word_text,
                        accuracy_score=word_accuracy,
                        error_type=word_error,
                        phonemes=phonemes,
                    ))

                    if word_accuracy < 70 or word_error != "None":
                        problem_words.append(word_text)

            accuracy = pron_result.accuracy_score
            fluency = pron_result.fluency_score
            completeness = pron_result.completeness_score
            try:
                prosody = pron_result.prosody_score
            except Exception:
                prosody = 0.0

            passed = accuracy >= 70 and completeness >= 80

            priya_feedback = self._generate_priya_score_feedback(
                accuracy=accuracy,
                passed=passed,
                problem_words=problem_words,
                reference_text=reference_text,
            )

            return TutorPronunciationAssessmentResult(
                accuracy_score=round(accuracy, 1),
                fluency_score=round(fluency, 1),
                completeness_score=round(completeness, 1),
                prosody_score=round(prosody, 1),
                recognized_text=result.text,
                reference_text=reference_text,
                words=words_data,
                passed=passed,
                priya_feedback=priya_feedback,
                problem_words=problem_words,
            )

        except Exception as e:
            logger.error(f"Pronunciation assessment error: {e}", exc_info=True)
            return TutorPronunciationAssessmentResult(
                accuracy_score=0, fluency_score=0, completeness_score=0, prosody_score=0,
                recognized_text="", reference_text=reference_text,
                passed=False,
                priya_feedback="Oops, kuch ho gaya! Let's continue our conversation.",
            )

    def _generate_priya_score_feedback(
        self,
        accuracy: float,
        passed: bool,
        problem_words: list,
        reference_text: str,
    ) -> str:
        """Generate Priya's empathetic response based on pronunciation score."""
        if accuracy >= 90:
            return f"Wah! बिल्कुल perfect! 🎉 Your pronunciation was {accuracy:.0f}/100! Native speakers would be proud!"
        elif accuracy >= 80:
            return f"Bahut acha! {accuracy:.0f}/100 - that's really good! Keep practicing like this!"
        elif accuracy >= 70:
            if problem_words:
                words_str = ", ".join([f"'{w}'" for w in problem_words[:2]])
                return f"Almost there! {accuracy:.0f}/100. Just focus a little more on {words_str}. Try once more?"
            return f"Good effort! {accuracy:.0f}/100. You're getting there! Ek baar aur try karein?"
        elif accuracy >= 50:
            if problem_words:
                words_str = ", ".join([f"'{w}'" for w in problem_words[:2]])
                return f"Keep trying! {accuracy:.0f}/100. The words {words_str} need more practice. Slowly boliye - '{reference_text}'"
            return f"Keep going! {accuracy:.0f}/100. Let's try slowly: '{reference_text}'"
        else:
            return f"Koi baat nahi! Practice makes perfect. Suniye main kaise kehti hoon: '{reference_text}' - ab aap try karein!"

    # ─── Feature 2: Intent Recognition ────────────────────────

    def detect_intent_from_text(self, text: str) -> dict:
        """
        Detect voice command intent from transcribed text.
        Uses keyword matching — no LUIS required.
        """
        text_lower = text.lower().strip()

        intent_map = {
            "end_session": {
                "keywords": [
                    "end session", "stop session", "finish", "end call",
                    "bye", "goodbye", "bye bye", "that's all", "thats all",
                    "band karo", "khatam karo", "bas karo", "done",
                ],
            },
            "repeat_please": {
                "keywords": [
                    "repeat", "say again", "say that again", "can you repeat",
                    "repeat that", "once more", "ek baar aur", "phir se",
                    "phir se bolo", "dobara bolo", "dobara", "again",
                ],
            },
            "dont_understand": {
                "keywords": [
                    "i don't understand", "i dont understand", "don't understand",
                    "samajh nahi aaya", "samajh nahi", "nahi samjha", "nahi samjhi",
                    "what does that mean", "what do you mean", "confused",
                    "explain", "explain please", "matlab kya hai", "matlab",
                ],
            },
            "speak_slower": {
                "keywords": [
                    "slow down", "speak slowly", "too fast", "slowly",
                    "slower please", "speak slower", "dhire", "dhire bolo",
                    "dhire boliye", "aram se", "aram se bolo",
                ],
            },
            "skip_topic": {
                "keywords": [
                    "change topic", "next topic", "something else", "different topic",
                    "boring", "skip", "let's move on", "move on",
                    "alag topic", "kuch aur", "nayi baat", "badlo",
                ],
            },
            "help": {
                "keywords": [
                    "help", "help me", "i need help", "what can i say",
                    "what can you do", "commands", "madad", "madad karo",
                    "kya kar sakte ho",
                ],
            },
            "good_job_response": {
                "keywords": [
                    "thank you", "thanks", "got it", "i understand now",
                    "okay i see", "shukriya", "dhanyavaad", "achha", "theek hai",
                ],
            },
        }

        detected_intent = "none"
        detected_keywords: list[str] = []

        for intent_name, intent_data in intent_map.items():
            for keyword in intent_data["keywords"]:
                if keyword in text_lower:
                    detected_intent = intent_name
                    detected_keywords.append(keyword)
                    break
            if detected_intent != "none":
                break

        confidence = 0.0
        if detected_intent != "none" and detected_keywords:
            keyword_length = len(detected_keywords[0].split())
            total_words = len(text_lower.split()) or 1
            confidence = min(1.0, keyword_length / total_words + 0.5)

        return {
            "intent": detected_intent,
            "confidence": round(confidence, 2),
            "original_text": text,
            "matched_keyword": detected_keywords[0] if detected_keywords else None,
            "is_command": detected_intent != "none" and confidence >= 0.3,
        }

    def transcribe_with_intent(self, audio_data: bytes) -> dict:
        """
        Transcribe audio AND detect intent in one call.
        Combines the regular transcription with keyword-based intent detection.
        """
        transcription_result = self.transcribe_hinglish(audio_data)

        text = transcription_result.get("text", "")
        if not text:
            return {
                **transcription_result,
                "success": False,
                "intent": "none",
                "intent_confidence": 0.0,
                "is_command": False,
                "matched_keyword": None,
            }

        intent_result = self.detect_intent_from_text(text)

        return {
            "text": text,
            "language": transcription_result.get("language"),
            "success": True,
            "intent": intent_result["intent"],
            "intent_confidence": intent_result["confidence"],
            "is_command": intent_result["is_command"],
            "matched_keyword": intent_result["matched_keyword"],
        }


hinglish_stt_service = HinglishSTTService()
