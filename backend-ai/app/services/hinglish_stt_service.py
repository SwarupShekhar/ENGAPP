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
        self.speech_config.speech_recognition_language = "en-IN"
        self.auto_detect_config = None

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

    # ─── Core Transcription ───────────────────────────────────

    def transcribe_hinglish(self, audio_data: bytes) -> dict:
        if not self.speech_config:
            raise RuntimeError("Hinglish STT service is not configured.")

        try:
            wav_bytes = self._convert_to_wav(audio_data)
        except Exception as e:
            logger.error(f"Audio conversion failed: {e}")
            return {"text": "", "language": None, "error": "Invalid audio format"}

        return self._transcribe_push_stream(wav_bytes)

    def _transcribe_push_stream(self, wav_bytes: bytes) -> dict:
        if not self.speech_config:
            raise RuntimeError("Hinglish STT service is not configured.")

        audio_stream = speechsdk.audio.PushAudioInputStream()
        audio_config = speechsdk.audio.AudioConfig(stream=audio_stream)

        recognizer = speechsdk.SpeechRecognizer(
            speech_config=self.speech_config,
            audio_config=audio_config,
        )

        audio_stream.write(wav_bytes)
        audio_stream.close()

        result = recognizer.recognize_once()

        if result.reason == speechsdk.ResultReason.RecognizedSpeech:
            return {"text": result.text, "language": "en-IN", "success": True}
        elif result.reason == speechsdk.ResultReason.NoMatch:
            return {"text": "", "language": None, "success": False, "error": "No speech detected"}
        else:
            return {"text": "", "language": None, "success": False, "error": str(result.reason)}

    # ─── Pronunciation Assessment ──────────────────────────────

    def assess_pronunciation(
        self,
        audio_bytes: bytes,
        reference_text: str,
    ) -> TutorPronunciationAssessmentResult:
        """
        Assess how well the user pronounced a specific reference phrase.
        Called when Maya asks the user to repeat a corrected phrase.
        """
        if not self.speech_config:
            raise RuntimeError("Hinglish STT service is not configured.")

        try:
            wav_bytes = self._convert_to_wav(audio_bytes)

            pronunciation_config = speechsdk.PronunciationAssessmentConfig(
                reference_text=reference_text,
                grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
                granularity=speechsdk.PronunciationAssessmentGranularity.Phoneme,
                enable_miscue=True,
            )
            pronunciation_config.enable_prosody_assessment()

            audio_stream = speechsdk.audio.PushAudioInputStream()
            audio_config = speechsdk.audio.AudioConfig(stream=audio_stream)

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

            if result.reason == speechsdk.ResultReason.NoMatch:
                return TutorPronunciationAssessmentResult(
                    accuracy_score=0, fluency_score=0, completeness_score=0, prosody_score=0,
                    recognized_text="", reference_text=reference_text,
                    passed=False,
                    maya_feedback="Aapki awaaz nahi aayi mujhe. Thoda aur loud boliye?",
                )

            if result.reason != speechsdk.ResultReason.RecognizedSpeech:
                return TutorPronunciationAssessmentResult(
                    accuracy_score=0, fluency_score=0, completeness_score=0, prosody_score=0,
                    recognized_text="", reference_text=reference_text,
                    passed=False,
                    maya_feedback="Kuch technical issue ho gaya, koi baat nahi. Phir se try karein?",
                )

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

            maya_feedback = self._generate_maya_feedback(
                accuracy=accuracy,
                fluency=fluency,
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
                maya_feedback=maya_feedback,
                problem_words=problem_words,
            )

        except Exception as e:
            logger.error(f"Pronunciation assessment error: {e}", exc_info=True)
            return TutorPronunciationAssessmentResult(
                accuracy_score=0, fluency_score=0, completeness_score=0, prosody_score=0,
                recognized_text="", reference_text=reference_text,
                passed=False,
                maya_feedback="Oops, kuch ho gaya! Koi baat nahi, chalte hain aage.",
            )

    def _generate_maya_feedback(
        self,
        accuracy: float,
        fluency: float,
        passed: bool,
        problem_words: list[str],
        reference_text: str,
    ) -> str:
        """
        Generate Maya's feedback based on pronunciation scores.
        Uses both accuracy AND fluency to give more nuanced responses.
        Varies phrasing so it doesn't feel like a template every time.
        """
        if accuracy >= 90:
            # Vary high-score responses so they don't feel identical each time
            responses = [
                f"Yaar, that was really clean! {accuracy:.0f}/100 — honestly impressive.",
                f"Arre wah! {accuracy:.0f}/100. Native speakers bolte hain exactly aisa!",
                f"Perfect! {accuracy:.0f}/100. Bilkul sahi tha — keep that energy!",
            ]
            # Deterministic variation based on score decimal to avoid randomness issues
            return responses[int(accuracy * 10) % len(responses)]

        elif accuracy >= 80:
            if fluency < 70:
                return (
                    f"Good pronunciation — {accuracy:.0f}/100! "
                    f"Bas thodi fluency improve karo, bich mein ruk mat. "
                    f"Ek baar aur, smoothly boliye?"
                )
            return (
                f"Bahut acha! {accuracy:.0f}/100. "
                f"Thoda aur practice karo aur yeh perfect ho jaayega."
            )

        elif accuracy >= 70:
            if problem_words:
                focus = " aur ".join([f"'{w}'" for w in problem_words[:2]])
                return (
                    f"Almost! {accuracy:.0f}/100. "
                    f"Bas {focus} pe thoda dhyan do. Try karo ek baar aur?"
                )
            return (
                f"Accha attempt! {accuracy:.0f}/100. "
                f"Slowly phir se boliye — '{reference_text}'"
            )

        elif accuracy >= 50:
            if problem_words:
                focus = problem_words[0]
                return (
                    f"Haan, {accuracy:.0f}/100 — getting there! "
                    f"'{focus}' pe focus karo. Break it down: "
                    f"'{reference_text}' — slowly, ek ek word."
                )
            return (
                f"Keep going! {accuracy:.0f}/100. "
                f"Aram se boliye: '{reference_text}'. No rush."
            )

        else:
            return (
                f"Koi baat nahi, yahi toh practice ke liye hai! "
                f"Suniye main kaise kehti hoon: '{reference_text}' — "
                f"ab aap try karein, bilkul slowly."
            )

    # ─── Intent Detection ──────────────────────────────────────

    def detect_intent_from_text(self, text: str) -> dict:
        """
        Detect voice command intent from transcribed text.
        Intents are ordered by priority — higher priority intents are checked first.
        """
        text_lower = text.lower().strip()

        # Ordered by priority: critical commands first, passive reactions last
        intent_map = [
            (
                "end_session",
                [
                    "end session", "stop session", "end call", "finish session",
                    "bye", "goodbye", "bye bye", "that's all", "thats all",
                    "band karo", "khatam karo", "bas karo", "done",
                ],
            ),
            (
                "speak_slower",
                [
                    "slow down", "speak slowly", "too fast", "slower please",
                    "speak slower", "dhire", "dhire bolo", "dhire boliye",
                    "aram se", "aram se bolo",
                ],
            ),
            (
                "repeat_please",
                [
                    "repeat", "say again", "say that again", "can you repeat",
                    "repeat that", "once more", "ek baar aur", "phir se",
                    "phir se bolo", "dobara bolo", "dobara", "again",
                ],
            ),
            (
                "dont_understand",
                [
                    "i don't understand", "i dont understand", "don't understand",
                    "samajh nahi aaya", "samajh nahi", "nahi samjha", "nahi samjhi",
                    "what does that mean", "what do you mean", "confused",
                    "explain please", "matlab kya hai", "matlab",
                ],
            ),
            (
                "skip_topic",
                [
                    "change topic", "next topic", "something else", "different topic",
                    "skip", "let's move on", "move on",
                    "alag topic", "kuch aur", "nayi baat", "badlo",
                ],
            ),
            (
                "help",
                [
                    "help", "help me", "i need help", "what can i say",
                    "what can you do", "madad", "madad karo", "kya kar sakte ho",
                ],
            ),
            (
                "good_job_response",
                [
                    "thank you", "thanks", "got it", "i understand now",
                    "okay i see", "shukriya", "dhanyavaad", "achha", "theek hai",
                ],
            ),
        ]

        detected_intent = "none"
        matched_keyword = None

        for intent_name, keywords in intent_map:
            for keyword in keywords:
                if keyword in text_lower:
                    detected_intent = intent_name
                    matched_keyword = keyword
                    break
            if detected_intent != "none":
                break

        # Confidence: longer keyword match relative to utterance = more confident
        confidence = 0.0
        if matched_keyword:
            keyword_word_count = len(matched_keyword.split())
            total_word_count = max(len(text_lower.split()), 1)
            # Base confidence 0.6 for any match, boosted by how specific the keyword is
            confidence = min(1.0, 0.6 + (keyword_word_count / total_word_count) * 0.4)

        return {
            "intent": detected_intent,
            "confidence": round(confidence, 2),
            "original_text": text,
            "matched_keyword": matched_keyword,
            "is_command": detected_intent != "none" and confidence >= 0.3,
        }

    def transcribe_with_intent(self, audio_data: bytes) -> dict:
        """
        Transcribe audio AND detect intent in one call.
        """
        transcription_result = self.transcribe_hinglish(audio_data)

        if transcription_result is None:
            logger.error("transcribe_hinglish returned None")
            transcription_result = {"text": "", "language": None, "error": "Transcription failed"}

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
