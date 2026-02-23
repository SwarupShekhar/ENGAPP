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
    WordDetail,
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

            import json
            config_json = {
                "referenceText": reference_text,
                "gradingSystem": "HundredMark",
                "granularity": "Phoneme",
                "enableMiscue": True,
                "nbestPhonemeCount": 3
            }
            pronunciation_config = speechsdk.PronunciationAssessmentConfig(
                json_string=json.dumps(config_json)
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
            logger.info(f"AZURE PRONUNCIATION RAW JSON: {json.dumps(raw_json, indent=2)}")

            words_data: list[WordDetail] = []
            problem_words: list[str] = []

            nbest = raw_json.get("NBest", [])
            if nbest:
                for word_raw in nbest[0].get("Words", []):
                    word_text = word_raw.get("Word", "")
                    wp = word_raw.get("PronunciationAssessment", {})
                    word_accuracy = wp.get("AccuracyScore", 0)
                    word_error = wp.get("ErrorType", "None")

                    phonemes = []
                    for p in word_raw.get("Phonemes", []):
                        pa = p.get("PronunciationAssessment", {})
                        phoneme_score = pa.get("AccuracyScore", 0)
                        expected_phoneme = p.get("Phoneme", "")
                        
                        # NBestPhonemes is ordered by confidence — index 0 is what Azure 
                        # actually heard, index 1+ are other candidates
                        nbest_phonemes = pa.get("NBestPhonemes", [])
                        actually_said = nbest_phonemes[0].get("Phoneme", "") if nbest_phonemes else None
                        
                        # FUNDAMENTAL FIX: Ignore Azure's inflated accuracy scores.
                        # Compare what was actually heard vs what was expected.
                        # Only flag if the phonemes are genuinely different AND not 
                        # an acceptable equivalent (like flap T or schwa variants).
                        is_correct = self._is_phoneme_acceptable(
                            expected_phoneme, actually_said
                        )
                        
                        phonemes.append(PhonemeDetail(
                            phoneme=expected_phoneme,
                            accuracy_score=phoneme_score,
                            actually_said=actually_said if not is_correct else None,
                            is_correct=is_correct,
                            nbest=nbest_phonemes
                        ))

                    words_data.append(WordDetail(
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

            # ─── Advanced Phonetic Analysis ──────────────────────────
            phonetic_insights = self._classify_pronunciation_errors(words_data)

            maya_feedback = self._generate_maya_feedback(
                accuracy=accuracy,
                fluency=fluency,
                passed=passed,
                phonetic_insights=phonetic_insights,
                reference_text=reference_text,
            )

            return TutorPronunciationAssessmentResult(
                original_text=reference_text,
                accuracy_score=round(accuracy, 1),
                fluency_score=round(fluency, 1),
                completeness_score=round(completeness, 1),
                pronunciation_score=round(pron_result.pronunciation_score, 1),
                recognized_text=result.text,
                words=words_data,
                maya_feedback=maya_feedback,
                phonetic_insights=phonetic_insights,
                passed=passed,
            )

        except Exception as e:
            logger.error(
                "pronunciation_assessment_failed",
                exc_info=True,
                extra={"reference_text": reference_text, "error_type": type(e).__name__, "error": str(e)}
            )
            return TutorPronunciationAssessmentResult(
                original_text=reference_text,
                accuracy_score=0, fluency_score=0, completeness_score=0, prosody_score=0, pronunciation_score=0,
                recognized_text="", reference_text=reference_text,
                passed=False,
                maya_feedback="Awaz thodi unclear aayi mujhe. Ek baar aur try karo, thoda mic ke paas?",
            )

    # ─── Phoneme Equivalence Table ──────────────────────────────
    # Pairs of phonemes that are "close enough" — don't flag these.
    # Covers natural Indian English variations, regional accents, 
    # and sounds that are genuinely interchangeable.
    PHONEME_EQUIVALENTS = {
        # Vowel variants (schwa, short/long confusion — very common, not errors)
        ("ɪ", "i"): True,
        ("i", "ɪ"): True,
        ("iː", "ɪ"): True,
        ("ɪ", "iː"): True,
        ("uː", "ʊ"): True,
        ("ʊ", "uː"): True,
        ("ɑː", "ɑ"): True,
        ("ɑ", "ɑː"): True,
        ("æ", "ɛ"): True,
        ("ɛ", "æ"): True,
        ("ə", "ʌ"): True,
        ("ʌ", "ə"): True,
        ("ɔː", "ɒ"): True,  # caught/cot — not distinguished in Indian English
        ("ɒ", "ɔː"): True,
        ("ɔ", "ɒ"): True,
        ("ɒ", "ɔ"): True,
        ("eɪ", "e"): True,  # 'say' vowel shortened — acceptable in Indian English
        ("e", "eɪ"): True,
        ("oʊ", "o"): True,  # 'go' vowel simplified — acceptable
        ("o", "oʊ"): True,
        # Flap T — extremely common in Indian English, acceptable
        ("t", "t̬"): True,
        ("t̬", "t"): True,
        ("t", "ɾ"): True,
        ("ɾ", "t"): True,
        ("d", "ɾ"): True,
        ("ɾ", "d"): True,
        # R-coloring variants
        ("ɹ", "r"): True,
        ("r", "ɹ"): True,
        ("ɹ", "ɻ"): True,  # Retroflex r (common in Indian English)
        ("ɻ", "ɹ"): True,
        # Aspiration variants — acceptable in Indian English
        ("p", "pʰ"): True,
        ("pʰ", "p"): True,
        ("k", "kʰ"): True,
        ("kʰ", "k"): True,
        ("t", "tʰ"): True,
        ("tʰ", "t"): True,
        # L variants
        ("l", "ɫ"): True,  # dark L / light L — both acceptable
        ("ɫ", "l"): True,
    }

    def _is_phoneme_acceptable(self, expected: str, actually_said: str | None) -> bool:
        """Check if the spoken phoneme is an acceptable match for the expected one."""
        if actually_said is None:
            return True  # No data, assume correct
        if expected == actually_said:
            return True  # Exact match
        if self.PHONEME_EQUIVALENTS.get((expected, actually_said), False):
            return True  # Known acceptable variant
        return False  # Genuine mispronunciation

    def _classify_pronunciation_errors(self, words_data: list[WordDetail]) -> dict:
        """
        Analyze phoneme-level data to detect specific Indian English patterns.
        FUNDAMENTAL FIX: Ignores Azure's accuracy scores entirely.
        Instead, compares N-Best phonemes (what Azure actually heard) against 
        expected phonemes. If they don't match and aren't acceptable equivalents,
        it's flagged as an error.
        """
        insights = {
            "critical_errors": [],
            "minor_errors": [],
            "indian_english_patterns": [],
        }

        # Pattern-specific hints for common Indian English substitutions
        PATTERN_MAP = {
            # (expected, actually_said) -> (pattern_name, hint)
            # SH/S confusion — very common
            ("ʃ", "s"): ("sh_s_confusion", "Woh 'sh' sound — jaise library mein 'shhh' karte hain — thoda aur strong chahiye."),
            ("ʃ", "ʂ"): ("sh_s_confusion", "Woh 'sh' sound — jaise library mein 'shhh' karte hain — thoda aur strong chahiye."),
            # V/W confusion — very common in Indian English
            ("w", "v"): ("v_w_confusion", "Almost! 'W' sound mein lips round karo, 'v' nahi — like you're about to whistle."),
            ("v", "w"): ("v_w_reverse", "Yahan 'V' chahiye — upper teeth lower lip pe. 'W' nahi, 'V'."),
            # TH confusion — one of the hardest sounds for Indian speakers
            ("θ", "t"): ("th_d_confusion", "Yeh 'th' wala sound tricky hai — tongue ko teeth ke beech rakho. 'Think' bolo slowly?"),
            ("θ", "d"): ("th_d_confusion", "Yeh 'th' wala sound tricky hai — tongue ko teeth ke beech rakho."),
            ("θ", "f"): ("th_f_confusion", "Close! But 'th' mein tongue teeth ke beech — 'f' nahi. Try 'think' slowly."),
            ("ð", "d"): ("th_d_confusion", "'The' mein tongue teeth ke beech — try slowly?"),
            ("ð", "t"): ("th_d_confusion", "'The' mein tongue teeth ke beech — try slowly?"),
            ("ð", "z"): ("th_z_confusion", "Almost! 'The' mein tongue teeth ke beech — 'z' nahi."),
            # Z/S confusion
            ("z", "s"): ("z_s_confusion", "'Z' sound mein vibration chahiye throat mein — like a buzzing bee!"),
            ("z", "dʒ"): ("z_j_confusion", "'Z' aur 'J' alag hain — 'Z' mein buzzing, 'J' mein jaw move hoti hai."),
            # F/P confusion (some regional dialects)
            ("f", "p"): ("f_p_confusion", "'F' mein upper teeth lower lip touch karte hain — hawa bahar aati hai. 'P' nahi."),
            # ZH sound (pleasure, vision)
            ("ʒ", "dʒ"): None,  # Acceptable in Indian English
            ("ʒ", "z"): ("zh_z_confusion", "Yeh 'zh' sound hai — jaise 'pleasure' mein. 'Z' se thoda softer."),
            ("ʒ", "ʃ"): ("zh_sh_confusion", "'Vision' mein 'zh' hai, 'sh' nahi — throat mein vibration feel karo."),
            # Acceptable variants — skip these
            ("ɹ", "ɾ"): None,
            ("ɹ", "ɻ"): None,  # Retroflex r is fine
        }

        for word in words_data:
            # Word-level error detection using error_type
            if word.error_type == "Mispronunciation":
                if word.accuracy_score < 60:
                    insights["critical_errors"].append({
                        "word": word.word, 
                        "score": word.accuracy_score
                    })
                else:
                    insights["minor_errors"].append({
                        "word": word.word, 
                        "score": word.accuracy_score
                    })

            # CORE FIX: Phoneme-level pattern detection using N-Best comparison
            # BEATING FORCED ALIGNMENT:
            # We look at ALL N-Best candidates. If a known substitution is present
            # even as a 2nd or 3rd candidate, and the phoneme score is < 100,
            # we consider it a SUSPICIOUS match and flag it.
            for p in word.phonemes:
                expected = p.phoneme
                heard_top = p.actually_said
                candidates = [c.get("Phoneme") for c in p.nbest]
                
                # Check ALL candidates for known patterns
                found_pattern = False
                for heard in candidates:
                    if heard is None: continue
                    
                    pattern_key = (expected, heard)
                    if pattern_key in PATTERN_MAP:
                        pattern_info = PATTERN_MAP[pattern_key]
                        if pattern_info is not None:  # None means acceptable
                            insights["indian_english_patterns"].append({
                                "word": word.word,
                                "pattern_name": pattern_info[0],
                                "hint": pattern_info[1],
                            })
                            found_pattern = True
                            p.is_correct = False  # Mark as incorrect even if Azure said it's correct
                            p.actually_said = heard
                            break
                
                # If no specific pattern but score is low (< 92 for soft assessment is bad)
                if not found_pattern and not p.is_correct:
                    logger.info(f"Unknown phoneme substitution: expected '{expected}', heard '{heard_top}' in word '{word.word}'")
                    if word.word not in [e["word"] for e in insights["minor_errors"]]:
                        insights["minor_errors"].append({
                            "word": word.word,
                            "score": p.accuracy_score
                        })
                
                # Special check for soft assessment: even if "correct", a lower score (< 82)
                # suggests the alignment was forced or the sound was unclear.
                elif not found_pattern and p.accuracy_score < 82:
                    # In soft assessment, this is a safer threshold to avoid false positives
                    if word.word not in [e["word"] for e in insights["minor_errors"]]:
                        insights["minor_errors"].append({
                            "word": word.word,
                            "score": p.accuracy_score
                        })

            # Consonant Dropping (End of word)
            if word.phonemes and not word.phonemes[-1].is_correct:
                last_p = word.phonemes[-1].phoneme
                if last_p not in ["ə", "ɪ", "ʊ"]:  # Ignore weak vowels at end
                    insights["indian_english_patterns"].append({
                        "word": word.word,
                        "pattern_name": "consonant_dropping",
                        "hint": "Last sound drop ho raha hai — pura word complete karo."
                    })

        # Deduplicate patterns
        unique_patterns = []
        seen = set()
        for p in insights["indian_english_patterns"]:
            key = f"{p['pattern_name']}_{p['word']}"
            if key not in seen:
                seen.add(key)
                unique_patterns.append(p)
        insights["indian_english_patterns"] = unique_patterns
        
        return insights

    def _generate_maya_feedback(
        self,
        accuracy: float,
        fluency: float,
        passed: bool,
        phonetic_insights: dict,
        reference_text: str,
    ) -> str:
        """
        Generate Maya's feedback based on pronunciation scores and phonetic patterns.
        """
        # 1. High Accuracy (>= 90): Celebration
        if accuracy >= 90:
            responses = [
                f"Yaar, that was really clean! {accuracy:.0f}/100 — honestly impressive.",
                f"Arre wah! {accuracy:.0f}/100. Native speakers bolte hain exactly aisa!",
                f"Perfect! {accuracy:.0f}/100. Bilkul sahi tha — keep that energy!",
            ]
            return responses[int(accuracy * 10) % len(responses)]

        # 2. Check for Specific Patterns (Most Impactful)
        patterns = phonetic_insights.get("indian_english_patterns", [])
        if patterns:
            # Maya ignores the score and focuses on the pattern hint
            return patterns[0]["hint"]

        # 3. Check for Critical Errors (< 60 accuracy)
        critical_errors = phonetic_insights.get("critical_errors", [])
        if critical_errors:
            word = critical_errors[0]["word"]
            return (
                f"Almost! {accuracy:.0f}/100. "
                f"Bas '{word}' pe thoda dhyan do. Try karo ek baar aur?"
            )

        # 4. Good Accuracy (>= 80) but Low Fluency
        if accuracy >= 80 and fluency < 70:
            return (
                f"Good pronunciation — {accuracy:.0f}/100! "
                f"Bas thodi fluency improve karo, bich mein ruk mat. "
                f"Ek baar aur, smoothly boliye?"
            )

        # 5. Decent Accuracy (>= 70)
        if accuracy >= 70:
            # Check for minor errors if any
            minor_errors = phonetic_insights.get("minor_errors", [])
            if minor_errors:
                word = minor_errors[0]["word"]
                return (
                    f"Accha attempt! {accuracy:.0f}/100. "
                    f"Thoda '{word}' clear karo. Slowly phir se boliye?"
                )
            return (
                f"Accha attempt! {accuracy:.0f}/100. "
                f"Slowly phir se boliye — '{reference_text}'"
            )

        # 6. Low Accuracy (< 70)
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

    def transcribe_with_soft_assessment(
        self, 
        audio_data: bytes,
    ) -> dict:
        """
        Dual-pass pronunciation detection during normal conversation.
        
        THE PROBLEM WITH TEXT-ONLY:
        Azure STT auto-corrects speech — "vater" becomes "water", hiding the
        mispronunciation. Text-based pattern matching only works if Azure 
        produces a misspelled transcription, which rarely happens.
        
        THE FIX — DUAL-PASS:
        Pass 1: Standard STT → get recognized text
        Pass 2: Azure Pronunciation Assessment with recognized text as reference
                 → extract N-Best phoneme data (what Azure ACTUALLY heard)
        Pass 3: Text-based pattern matching (complementary check)
        
        WHY SELF-REFERENCE WORKS FOR PHONEME DETECTION:
        While overall accuracy/fluency scores are inflated with self-reference,
        the N-Best phoneme data still reveals true substitutions. Our 
        _classify_pronunciation_errors function compares N-Best candidates 
        against expected phonemes to find real patterns (v→w, t→θ, s→ʃ, etc).
        """
        # Pass 1: Standard transcription
        transcription = self.transcribe_hinglish(audio_data)
        text = transcription.get("text", "")
        
        if not text or len(text.split()) < 1:
            return {**transcription, "phonetic_insights": None}
        
        # Pass 2: Phoneme-level pronunciation assessment
        phoneme_insights = None
        if len(text.split()) >= 2:  # Need >= 2 words for meaningful analysis
            try:
                phoneme_insights = self._soft_pronunciation_pass(audio_data, text)
            except Exception as e:
                logger.warning(f"Soft pronunciation pass failed (non-fatal): {e}")
        
        # Pass 3: Text-based detection (complementary)
        text_insights = self._detect_text_mispronunciations(text)
        
        # Merge insights from both passes
        merged = self._merge_insights(phoneme_insights, text_insights)
        
        has_meaningful_errors = bool(
            merged.get("indian_english_patterns") or
            merged.get("critical_errors") or
            merged.get("minor_errors")
        )
        
        pi = merged if has_meaningful_errors else None
        logger.info(f"DUAL-PASS ASSESSMENT: text='{text}', has_errors={has_meaningful_errors}, phoneme_pass={'yes' if phoneme_insights else 'no'}, insights={pi}")
        
        return {
            **transcription,
            "phonetic_insights": pi
        }

    # ─── Text-Based Mispronunciation Detection ─────────────────

    # Common Indian English mispronunciations as text patterns
    # Format: (misspelled/phonetic version, correct word, pattern, hint)
    MISPRONUNCIATION_DICT = [
        # ─── 'English' variations ──────────────────────────────────
        ("engless", "English", "vowel_substitution", "It's 'Ing-lish', not 'engless' — try emphasizing the 'I' at the start."),
        ("inglish", "English", "vowel_substitution", "'English' mein pehle 'I' sound hai, like 'IN-glish'. Try again?"),
        ("anglish", "English", "vowel_substitution", "Almost! It starts with 'In', not 'An'. 'IN-glish' — try?"),
        ("yenglish", "English", "y_insertion", "'English' mein no 'Y' — seedha 'IN-glish' bolo."),
        
        # ─── 'People' variations ──────────────────────────────────
        ("pepul", "people", "vowel_substitution", "'People' mein 'pee-pul' bolo — the 'ee' sound is important, not 'e'."),
        ("pipul", "people", "vowel_substitution", "'People' is 'PEE-pul' — that first vowel needs to be longer."),
        ("peepal", "people", "vowel_substitution", "'People' and 'peepal' sound similar but different! It's 'PEE-pul'."),
        ("peepul", "people", "vowel_substitution", "'People' — close! Just make sure it's 'PEE-pul', not 'peepal' like the tree."),
        
        # ─── V/W confusion ────────────────────────────────────────
        ("vater", "water", "v_w_confusion", "Almost! 'Water' starts with 'W' — lips round karo, like you're about to whistle. 'WA-ter'."),
        ("vhater", "water", "v_w_confusion", "The 'W' in 'water' needs rounded lips — try 'WA-ter' slowly?"),
        ("vork", "work", "v_w_confusion", "'Work' mein 'W' hai — lips round karo. 'WORK', not 'vork'."),
        ("vorld", "world", "v_w_confusion", "'World' starts with 'W' — lips gol karo aur bolo 'WORLD'."),
        ("ven", "when", "v_w_confusion", "'When' mein 'W' — lips round! Not 'ven'."),
        ("vhat", "what", "v_w_confusion", "'What' mein 'W' hai — lips round karo, 'v' nahi."),
        ("vith", "with", "v_w_confusion", "'With' — 'W' se start karo, lips round. Not 'vith'."),
        ("vill", "will", "v_w_confusion", "'Will' mein 'W' hai — round your lips! Not 'vill'."),
        ("vay", "way", "v_w_confusion", "'Way' mein 'W' — lips gol! Not 'vay'."),
        ("vine", "wine", "v_w_confusion", "'Wine' aur 'vine' alag hain! 'Wine' mein lips round karo."),
        ("vest", "west", "v_w_confusion", "'West' aur 'vest' alag hain — 'West' mein lips round."),
        
        # ─── TH confusion (θ/ð → t/d) ────────────────────────────
        ("tink", "think", "th_d_confusion", "'Think' mein tongue teeth ke beech rakho — 'TH-ink', not 'tink'."),
        ("ting", "thing", "th_d_confusion", "'Thing' ka 'th' tricky hai — tongue teeth ke beech. Try 'TH-ing'?"),
        ("tree", "three", "th_d_confusion", "'Three' and 'tree' are different! 'Three' mein tongue teeth ke beech — 'TH-ree'."),
        ("tru", "through", "th_d_confusion", "'Through' starts with 'th' — tongue teeth ke beech. Not 'tru'."),
        ("dey", "they", "th_d_confusion", "'They' ka 'th' — tongue teeth ke beech, soft breath. Not 'dey'."),
        ("dat", "that", "th_d_confusion", "'That' mein 'th' sound — tongue teeth ke beech. Not 'dat'."),
        ("dis", "this", "th_d_confusion", "'This' mein 'th' — tongue teeth ke beech. Not 'dis'."),
        ("der", "there", "th_d_confusion", "'There' mein 'th' — tongue teeth ke beech, not 'd'."),
        ("dem", "them", "th_d_confusion", "'Them' mein 'th' — tongue teeth ke beech."),
        ("tankyou", "thank you", "th_d_confusion", "'Thank' mein 'TH' — tongue teeth ke beech. Almost everyone struggles with this one!"),
        ("tanks", "thanks", "th_d_confusion", "'Thanks' mein 'TH' — not 'tanks'. Tongue teeth ke beech!"),
        
        # ─── Initial vowel addition (epenthesis) ─────────────────
        ("ischool", "school", "initial_vowel_addition", "'School' seedha 'sk' se start hota hai — no extra 'i' at the start."),
        ("eschool", "school", "initial_vowel_addition", "'School' — no extra vowel needed at the start. Just 'SKOOL'."),
        ("istation", "station", "initial_vowel_addition", "'Station' seedha 'st' se start karo — no 'i' at the beginning."),
        ("ispecial", "special", "initial_vowel_addition", "'Special' seedha 'sp' se start — no 'i' needed."),
        ("ispeak", "speak", "initial_vowel_addition", "'Speak' directly 'sp' se — no 'i' at the start."),
        
        # ─── South Indian patterns ────────────────────────────────
        ("wonly", "only", "w_insertion", "'Only' mein no 'W' at the start — seedha 'OWN-lee' bolo."),
        ("yonly", "only", "y_insertion", "'Only' mein no 'Y' — seedha 'OWN-lee'."),
        ("yexam", "exam", "y_insertion", "'Exam' mein no 'Y' — seedha 'ig-ZAM'."),
        
        # ─── Common word mispronunciations ────────────────────────
        ("pronounciation", "pronunciation", "spelling_pronunciation", "Classic one! It's 'pro-NUN-ciation', not 'pro-NOUN-ciation'. The 'noun' changes to 'nun'."),
        ("cumfortable", "comfortable", "vowel_substitution", "'Comfortable' — it starts with 'COM', not 'CUM'. Try 'KUMF-ter-bul'."),
        ("prablem", "problem", "vowel_substitution", "'Problem' mein 'o' sound hai, 'a' nahi — 'PROB-lem'."),
        ("divelopment", "development", "vowel_substitution", "'Development' mein 'de' hai, 'di' nahi — 'di-VEL-up-ment'."),
        ("aksed", "asked", "consonant_metathesis", "'Asked' mein 'sk' hai, 'ks' nahi — try 'ASKT' slowly."),
        ("axed", "asked", "consonant_metathesis", "'Asked' mein 'sk' order important hai — 'ASKT', not 'AXED'."),
        ("pitcher", "picture", "consonant_confusion", "'Picture' aur 'pitcher' alag hain! 'PIC-cher' — the 'k' sound matters."),
        ("libary", "library", "consonant_dropping", "'Library' mein dono 'r' bolo — 'LY-brer-ee', not 'ly-berry'."),
        ("libery", "library", "consonant_dropping", "'Library' — 'LY-brer-ee'. Dono 'r' important hain."),
        ("expresso", "espresso", "spelling_pronunciation", "'Espresso' — no 'X'! It's 'es-PRESS-oh'."),
        ("eckcetera", "etcetera", "spelling_pronunciation", "'Etcetera' — 'et-SET-era', not 'eck-cetera'."),
        ("exetera", "etcetera", "spelling_pronunciation", "'Etcetera' — 'et-SET-era', not 'exe-tera'."),
        
        # ─── Vowel shortening ─────────────────────────────────────
        ("fil", "feel", "vowel_shortening", "'Feel' has a long 'ee' — 'FEEL', not 'fil'. Stretch it out!"),
        ("shit", "sheet", "vowel_shortening", "Careful! 'Sheet' has a long 'ee' — 'SHEET'. Short 'i' changes the meaning completely!"),
        ("bich", "beach", "vowel_shortening", "'Beach' has a long 'ee' — 'BEECH'. The short version is a different word!"),
        
        # ─── Z/S confusion ────────────────────────────────────────
        ("iss", "is", "z_s_confusion", "'Is' ends with a 'Z' sound, not 'S'. Try buzzing at the end — 'IZZ'."),
        ("wass", "was", "z_s_confusion", "'Was' ends with a 'Z' buzz — 'WUZ', not 'WASS'."),
        ("hass", "has", "z_s_confusion", "'Has' ends with 'Z' — 'HAZ', not 'HASS'."),
    ]

    def _detect_text_mispronunciations(self, text: str) -> dict:
        """
        Detect mispronunciations by checking the recognized text against 
        a dictionary of common Indian English mispronunciation patterns.
        
        Works because Azure STT sometimes produces phonetic spellings 
        of mispronounced words (e.g., 'engless' for 'English').
        """
        insights = {
            "critical_errors": [],
            "minor_errors": [],
            "indian_english_patterns": [],
        }
        
        text_lower = text.lower()
        words_lower = text_lower.split()
        
        seen_patterns = set()
        
        for misspelling, correct_word, pattern_name, hint in self.MISPRONUNCIATION_DICT:
            misspelling_lower = misspelling.lower()
            
            # Check both word-level and substring matches
            found = False
            if misspelling_lower in words_lower:
                found = True
            elif misspelling_lower in text_lower:
                # Substring match for compound words or run-together speech
                found = True
            
            if found:
                pattern_key = f"{pattern_name}_{correct_word}"
                if pattern_key not in seen_patterns:
                    seen_patterns.add(pattern_key)
                    insights["indian_english_patterns"].append({
                        "word": correct_word,
                        "detected_as": misspelling,
                        "pattern_name": pattern_name,
                        "hint": hint,
                    })
                    logger.info(f"MISPRONUNCIATION DETECTED: '{misspelling}' -> should be '{correct_word}' [pattern: {pattern_name}]")
        
        return insights

    # ─── Pass 2: Phoneme-Level Pronunciation Assessment ─────────

    def _soft_pronunciation_pass(self, audio_data: bytes, recognized_text: str) -> dict | None:
        """
        Run Azure Pronunciation Assessment using the recognized text as reference.
        Extracts N-Best phoneme data to detect actual sound substitutions.
        
        KEY INSIGHT: Even with self-reference text, Azure's N-Best phoneme candidates 
        reveal what was ACTUALLY spoken at the phoneme level. For example:
        - User says "vater" → Azure STT transcribes "water" (auto-corrected)
        - But Pronunciation Assessment's N-Best shows the first phoneme was 'v' not 'w'
        - Our _classify_pronunciation_errors catches this as v_w_confusion
        
        This is the critical layer that text-based detection misses.
        """
        if not self.speech_config:
            return None

        try:
            wav_bytes = self._convert_to_wav(audio_data)

            config_json = {
                "referenceText": recognized_text,
                "gradingSystem": "HundredMark",
                "granularity": "Phoneme",
                "enableMiscue": True,
                "nbestPhonemeCount": 3,
            }
            pronunciation_config = speechsdk.PronunciationAssessmentConfig(
                json_string=json.dumps(config_json)
            )

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

            if result.reason != speechsdk.ResultReason.RecognizedSpeech:
                logger.info(f"Soft pronunciation pass: no speech recognized ({result.reason})")
                return None

            raw_json_str = result.properties.get(
                speechsdk.PropertyId.SpeechServiceResponse_JsonResult, "{}"
            )
            raw_json = json.loads(raw_json_str)
            logger.debug(f"SOFT PA RAW (truncated): {json.dumps(raw_json, indent=2)[:800]}")

            # Extract word and phoneme data
            words_data: list[WordDetail] = []
            nbest = raw_json.get("NBest", [])
            if not nbest:
                return None

            for word_raw in nbest[0].get("Words", []):
                word_text = word_raw.get("Word", "")
                wp = word_raw.get("PronunciationAssessment", {})
                word_accuracy = wp.get("AccuracyScore", 0)
                word_error = wp.get("ErrorType", "None")

                phonemes = []
                for p in word_raw.get("Phonemes", []):
                    pa = p.get("PronunciationAssessment", {})
                    phoneme_score = pa.get("AccuracyScore", 0)
                    expected_phoneme = p.get("Phoneme", "")
                    nbest_phonemes = pa.get("NBestPhonemes", [])
                    actually_said = nbest_phonemes[0].get("Phoneme", "") if nbest_phonemes else None

                    is_correct = self._is_phoneme_acceptable(expected_phoneme, actually_said)

                    phonemes.append(PhonemeDetail(
                        phoneme=expected_phoneme,
                        accuracy_score=phoneme_score,
                        actually_said=actually_said if not is_correct else None,
                        is_correct=is_correct,
                        nbest=nbest_phonemes,
                    ))

                words_data.append(WordDetail(
                    word=word_text,
                    accuracy_score=word_accuracy,
                    error_type=word_error,
                    phonemes=phonemes,
                ))

            if not words_data:
                return None

            # Run pattern classification on extracted phoneme data
            insights = self._classify_pronunciation_errors(words_data)
            
            detected_count = (
                len(insights.get("indian_english_patterns", []))
                + len(insights.get("critical_errors", []))
                + len(insights.get("minor_errors", []))
            )
            logger.info(f"SOFT PA RESULT: {detected_count} issue(s) found in '{recognized_text}'")
            return insights

        except Exception as e:
            logger.warning(f"Soft pronunciation pass error (non-fatal): {e}")
            return None

    # ─── Merge Insights from Both Passes ────────────────────────

    def _merge_insights(self, phoneme_insights: dict | None, text_insights: dict | None) -> dict:
        """
        Merge insights from phoneme-level analysis (Pass 2) and text-based detection (Pass 3).
        Deduplicates by word+pattern_name to avoid double-reporting.
        """
        merged = {
            "critical_errors": [],
            "minor_errors": [],
            "indian_english_patterns": [],
        }

        for source in [phoneme_insights, text_insights]:
            if source is None:
                continue
            for key in merged:
                merged[key].extend(source.get(key, []))

        # Deduplicate patterns by word + pattern_name
        seen = set()
        unique_patterns = []
        for p in merged["indian_english_patterns"]:
            key = f"{p.get('pattern_name', '')}_{p.get('word', '')}"
            if key not in seen:
                seen.add(key)
                unique_patterns.append(p)
        merged["indian_english_patterns"] = unique_patterns

        # Deduplicate errors by word
        for error_type in ["critical_errors", "minor_errors"]:
            seen_words = set()
            unique = []
            for e in merged[error_type]:
                word = e.get("word", "")
                if word not in seen_words:
                    seen_words.add(word)
                    unique.append(e)
            merged[error_type] = unique

        return merged

    def transcribe_with_intent(self, audio_data: bytes) -> dict:
        """
        Transcribe audio AND detect intent in one call, along with soft pronunciation assessment.
        """
        transcription_result = self.transcribe_with_soft_assessment(audio_data)

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
            "phonetic_insights": transcription_result.get("phonetic_insights"),
        }


    def debug_phoneme_scores(self, audio_bytes: bytes, test_phrase: str) -> dict:
        """
        Raw dump of everything Azure returns — no processing, no thresholds.
        Use this to see exactly what Azure is giving us before any filtering.
        """
        if not self.speech_config:
            raise RuntimeError("Hinglish STT service is not configured.")
            
        wav_bytes = self._convert_to_wav(audio_bytes)
        
        pronunciation_config = speechsdk.PronunciationAssessmentConfig(
            reference_text=test_phrase,
            grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
            granularity=speechsdk.PronunciationAssessmentGranularity.Phoneme,
            enable_miscue=True,
        )
        pronunciation_config.json_string = json.dumps({
            "EnableMiscue": True,
            "PhonemeAlphabet": "IPA",
            "NBestPhonemeCount": 5,  # get 5 candidates so we can see full picture
        })

        audio_stream = speechsdk.audio.PushAudioInputStream()
        audio_config = speechsdk.audio.AudioConfig(stream=audio_stream)
        
        recognizer = speechsdk.SpeechRecognizer(
            speech_config=self.speech_config,
            audio_config=audio_config,
        )
        pronunciation_config.apply_to(recognizer)
        audio_stream.write(wav_bytes)
        audio_stream.close()

        result = recognizer.recognize_once()

        raw_json_str = result.properties.get(
            speechsdk.PropertyId.SpeechServiceResponse_JsonResult, "{}"
        )
        raw_json = json.loads(raw_json_str)
        logger.info(f"AZURE DEBUG PHONEMES RAW JSON: {json.dumps(raw_json, indent=2)}")

        # Return everything unfiltered
        debug_output = {
            "recognized_text": result.text,
            "words": []
        }

        nbest = raw_json.get("NBest", [])
        if nbest:
            for word in nbest[0].get("Words", []):
                word_pa = word.get("PronunciationAssessment", {})
                word_debug = {
                    "word": word.get("Word"),
                    "accuracy": word_pa.get("AccuracyScore"),
                    "error_type": word_pa.get("ErrorType"),
                    "phonemes": []
                }
                for p in word.get("Phonemes", []):
                    pa = p.get("PronunciationAssessment", {})
                    word_debug["phonemes"].append({
                        "expected": p.get("Phoneme"),
                        "score": pa.get("AccuracyScore"),
                        "nbest_heard": pa.get("NBestPhonemes", [])
                    })
                debug_output["words"].append(word_debug)

        return debug_output


hinglish_stt_service = HinglishSTTService()
