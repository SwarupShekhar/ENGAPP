import google.generativeai as genai
from typing import AsyncGenerator
import asyncio
import re
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

class StreamingGeminiService:
    def __init__(self):
        self.enabled = bool(settings.google_api_key)
        if not settings.google_api_key:
            logger.warning("GOOGLE_API_KEY is not configured; Gemini tutor responses are disabled.")
            self.model = None
            self.model_name = ""
            return

        genai.configure(api_key=settings.google_api_key)
        self.model_name = (settings.google_gemini_chat_model or "gemini-2.5-flash").strip()
        self.model = genai.GenerativeModel(self.model_name)

    def _sanitize_sentence(self, text: str) -> str:
        """Normalize model output for cleaner speech + UI rendering."""
        if not text:
            return ""
        # Remove markdown artifacts that make TTS sound odd.
        text = re.sub(r"[*_`#]+", "", text)
        text = re.sub(r"\s+", " ", text).strip()
        return text
    
    async def stream_response(
        self,
        prompt: str,
        conversation_history: list,
        phonetic_context: dict | None = None,
        audio_base64: str | None = None,
        cefr_level: str | None = None,
    ) -> AsyncGenerator[str, None]:
        """
        Stream tokens from Gemini and yield complete sentences as they form.
        If audio_base64 is provided, Gemini receives the raw audio to analyze pronunciation.
        cefr_level (A1..C2) tunes vocabulary + sentence complexity to the learner.
        """
        if not self.enabled or self.model is None:
            yield "I'm not fully configured yet. Please set GOOGLE_API_KEY and restart the AI service."
            return

        full_prompt = self._build_conversation_prompt(
            prompt, conversation_history, phonetic_context, cefr_level
        )
        logger.info(f"GEMINI PROMPT: {prompt[:50]}... context={bool(phonetic_context)}, audio={bool(audio_base64)}")
        
        # Build content: text-only or multimodal (text + audio)
        if audio_base64:
            import base64 as b64
            audio_bytes = b64.b64decode(audio_base64)
            # Auto-detect mime: Silero path uploads WAV (RIFF header); expo-av path uploads M4A.
            if len(audio_bytes) >= 12 and audio_bytes[:4] == b"RIFF" and audio_bytes[8:12] == b"WAVE":
                audio_mime = "audio/wav"
            else:
                audio_mime = "audio/mp4"
            # Add pronunciation instruction when audio is present
            audio_instruction = (
                "\n\n[AUDIO ATTACHED: Listen to the user's audio carefully. "
                "The text transcription above may have been auto-corrected by the speech engine. "
                "If you hear any pronunciation errors (e.g., 'engless' for 'English', 'pepul' for 'people', "
                "'vater' for 'water', 'tink' for 'think'), gently correct them in your response. "
                "The audio is the ground truth — trust what you HEAR over what the text says.]"
            )
            content = [
                full_prompt + audio_instruction,
                {"mime_type": audio_mime, "data": audio_bytes}
            ]
            logger.info(
                "Sending multimodal prompt to Gemini with %d bytes (%s)",
                len(audio_bytes),
                audio_mime,
            )
        else:
            content = full_prompt
        
        buffer = ""
        sentence_endings = re.compile(r'[.!?]\s')
        emitted_sentences = 0
        max_sentences = 2
        
        max_retries = 3
        for attempt in range(max_retries + 1):
            has_yielded = False
            try:
                response = await self.model.generate_content_async(
                    content,
                    stream=True,
                    generation_config={
                        'temperature': 0.5,
                        'top_p': 0.9,
                        'top_k': 40,
                        'max_output_tokens': 140,
                    }
                )
                
                async for chunk in response:
                    try:
                        if emitted_sentences >= max_sentences:
                            break
                        if not chunk.text:
                            continue
                        
                        buffer += chunk.text
                        match = sentence_endings.search(buffer)
                        
                        while match:
                            sentence = buffer[:match.end()].strip()
                            buffer = buffer[match.end():]
                            
                            if sentence:
                                sentence = self._sanitize_sentence(sentence)
                                has_yielded = True
                                if sentence:
                                    yield sentence
                                    emitted_sentences += 1
                                    if emitted_sentences >= max_sentences:
                                        buffer = ""
                                        break
                            
                            match = sentence_endings.search(buffer)
                    except ValueError as ve:
                        logger.warning(f"ValueError in chunk processing: {ve}")
                        continue
                    except Exception as e:
                        # Log full exception with traceback instead of silently continuing
                        logger.exception(f"Error processing chunk: {e}")
                        if "429" in str(e):
                            # Only re-raise if we haven't yielded anything yet
                            if not has_yielded:
                                raise
                            # Otherwise log and stop gracefully
                            logger.warning("Rate limited after partial response, stopping stream")
                            break
                        continue
                
                # If we got here, we're done
                break

            except Exception as e:
                if "429" in str(e) and attempt < max_retries:
                    import random
                    # Exponential backoff: 2s, 4s, 8s + jitter
                    wait_time = (2 ** (attempt + 1)) + random.uniform(0, 1)
                    logger.warning(f"Gemini 429 received, retrying in {wait_time:.1f}s... (Attempt {attempt + 1}/{max_retries})")
                    await asyncio.sleep(wait_time)
                    continue
                
                logger.error(f"Gemini stream failed: {e}")
                yield "I'm having a little trouble connecting right now. Could you please say that again in a moment?"
                return
        
        if buffer.strip() and emitted_sentences < max_sentences:
            tail = self._sanitize_sentence(buffer.strip())
            if tail:
                yield tail

    @staticmethod
    def _cefr_style_block(cefr_level: str | None) -> str:
        """Return CEFR-adapted style + vocabulary directives. Defaults to A2 when unknown."""
        level = (cefr_level or "").strip().upper()
        if level not in {"A1", "A2", "B1", "B2", "C1", "C2"}:
            level = "A2"
        guides = {
            "A1": (
                "- Learner level: A1 (beginner). Use only the most common 500 English words.\n"
                "- Sentences: 4-8 words. Present simple tense. No idioms, no phrasal verbs.\n"
                "- Speak slowly, one idea per sentence. Repeat key words when helpful."
            ),
            "A2": (
                "- Learner level: A2 (elementary). Use common everyday vocabulary.\n"
                "- Sentences: 6-12 words. Simple past and present. Light use of common phrasal verbs.\n"
                "- Keep ideas concrete and familiar (food, work, family, daily life)."
            ),
            "B1": (
                "- Learner level: B1 (intermediate). Use a broader everyday vocabulary.\n"
                "- Sentences: up to 15 words. Past, present, future, conditionals OK.\n"
                "- You may use common phrasal verbs and a few simple idioms with light explanation."
            ),
            "B2": (
                "- Learner level: B2 (upper-intermediate). Use natural conversational English.\n"
                "- Sentences: natural length. Most tenses, phrasal verbs, common idioms allowed.\n"
                "- Lightly challenge the learner with more nuanced vocabulary."
            ),
            "C1": (
                "- Learner level: C1 (advanced). Use rich, varied English.\n"
                "- Idioms, nuance, register shifts encouraged when natural.\n"
                "- Push the learner with precise word choice and complex structures."
            ),
            "C2": (
                "- Learner level: C2 (proficient). Speak at near-native fluency.\n"
                "- Full range of idiom, register, and abstract vocabulary is welcome.\n"
                "- Treat the learner as a peer; refine subtle errors of nuance and style."
            ),
        }
        return f"CEFR ADAPTATION (mandatory):\n{guides[level]}\n"

    def _build_conversation_prompt(
        self,
        current_utterance: str,
        history: list,
        phonetic_context: dict | None = None,
        cefr_level: str | None = None,
    ) -> str:
        """Build full context from conversation history"""

        cefr_block = self._cefr_style_block(cefr_level)

        system_prompt = f"""
You are Maya, an expert spoken-English coach for adult learners.
Your tone is calm, sharp, warm, and premium. You sound like a highly skilled real tutor, not a hype friend.

LANGUAGE RULE (absolute):
- Speak in clear, natural ENGLISH ONLY. Do NOT use Hindi, Hinglish, Urdu, or any other language.
- No Hindi words at all (no "namaste", "arre", "shabash", "bhai", "koi baat nahi", "acha", etc.).
- If the learner uses Hindi, respond in English and gently model the English version.

{cefr_block}

Voice and personality:
- Confident and clear, never dramatic or over-excited.
- Encouraging but grounded (no fake praise).
- Gentle humor is fine; avoid slangy catchphrases and repetitive fillers.

Teaching behavior:
- Correct only ONE high-impact issue per turn.
- Prefer embedded correction (model the right phrasing naturally in your reply).
- If explicit correction is needed, keep it short and move forward quickly.
- Ask one focused follow-up that makes the learner speak more.
- Prioritize clarity, fluency, and confidence over perfection.

Response style:
- STRICT LIMIT: 1-2 sentences.
- Keep sentences clean and natural for speech synthesis.
- Avoid long dashes, heavy punctuation, or text that sounds theatrical when spoken.
- Avoid repeating the same opener pattern every turn.

Hard constraints:
- Never use bullet points, headers, or list formatting in your reply.
- Never say robotic phrases like "Great question", "Certainly", "As an AI", etc.
- Never over-praise basic output.
- Never use any non-English words (no Hindi, no Hinglish, no familial terms like "bhai", "didi", "bro").
- Never use emojis or emoticons.
- Never break character.

PRONUNCIATION VIGILANCE & ANTI-HALLUCINATION:
You must scan the user's message for common Indian English mispronunciations. If you spot them, gently correct them in your reply.

Common patterns to watch for:
- "engless/inglish/anglish" -> "English"
- "pepul/pipul/peepal" -> "people"  
- "vater/vhater" -> "water"
- "tink/ting" -> "think/thing"
- "tree" when they mean "three"
- "dey/dat/dis" -> "they/that/this"

IMPORTANT: The user's speech is STT-transcribed and normalized.
1. If the sentence sounds grammatically odd (e.g., "People English" instead of "English people"), the user likely mispronounced words and the STT cleaned them up.
2. If the user's message is complete gibberish (e.g., "English speaking is people making people"), DO NOT invent context or stories. Just say: "I didn't quite catch that. Could you say it again?"

STRICT OUTPUT: 1-2 sentences maximum. No emojis.

Additionally, when audio is attached for this turn OR pronunciation context lists issues below, and you detect any pronunciation error (from audio or from that context),
append ONE tag per error at the very end of your response (after your natural 1-2 sentences):

[PRON: heard="<what they said>" correct="<correct word>" rule="<category>"]

Examples:
[PRON: heard="vater" correct="water" rule="w_to_v"]
[PRON: heard="englis" correct="English" rule="vowel_substitution"]
[PRON: heard="tink" correct="think" rule="th_fronting"]

Rules for tagging:
- Only tag genuine errors, not acceptable accent variation
- Use the user's transcription and pronunciation context to judge intent
- Maximum 3 tags per turn
- Tags are for the system only — place them after your conversational reply so they do not interrupt the user-facing text

---

The conversation so far:
"""

        coaching_hint = (phonetic_context or {}).get("coaching_hint")
        if coaching_hint:
            system_prompt += (
                f"\n\n[COACHING HINT — weave into your next response naturally, max 1 sentence]: "
                f"{coaching_hint}\n"
            )

        learner_profile = (phonetic_context or {}).get("learner_profile")
        if learner_profile:
            system_prompt += learner_profile

        if (phonetic_context or {}).get("answer_from_profile"):
            system_prompt += (
                "\n\nThe user is asking about their mistakes or what to practice. "
                "Answer using LEARNER PROFILE above with specific examples. "
                "Do not give generic praise.\n"
            )

        opportunity_directive = (phonetic_context or {}).get("opportunityDirective")
        if opportunity_directive:
            system_prompt += opportunity_directive

        _pa_keys = set(phonetic_context or {}) - {
            "coaching_hint",
            "opportunityDirective",
            "learner_profile",
            "answer_from_profile",
        }
        if phonetic_context and _pa_keys:
            context_str = "\n---\nCURRENT PRONUNCIATION CONTEXT:\n"

            is_wrapped = "phonetic_insights" in phonetic_context
            insights = phonetic_context.get('phonetic_insights') if is_wrapped else phonetic_context
            insights = insights or {}
            
            ref_text = phonetic_context.get('reference_text', "what they just said") if is_wrapped else "what they just said"
            acc_score = phonetic_context.get('accuracy_score', None) if is_wrapped else None
            
            context_str += f"The user just attempted to say: \"{ref_text}\"\n"
            if acc_score is not None:
                context_str += f"Their overall accuracy: {acc_score}/100\n\n"
            else:
                context_str += "\n"
            
            crit = insights.get('critical_errors', [])
            minor = insights.get('minor_errors', [])
            if crit or minor:
                context_str += "Issues detected:\n"
                for err in crit:
                    context_str += f"- \"{err.get('word', '')}\" was significantly mispronounced (accuracy: {err.get('score', 0)})\n"
                for err in minor:
                    context_str += f"- \"{err.get('word', '')}\" was slightly mispronounced or unclear (accuracy: {err.get('score', 0)})\n"
                
            pats = insights.get('indian_english_patterns', [])
            if pats:
                for p in pats:
                    context_str += f"- Detected {p.get('pattern_name', '')}: {p.get('hint', '')}\n"
                
            context_str += "\nHow to handle this in your NEXT response:\n"
            context_str += "- Do NOT report the score number to the user\n"
            context_str += "- Weave the correction naturally into conversation\n"
            context_str += "- If there is an indian_english_pattern, use the hint to guide your phrasing\n"
            context_str += "- If a word is in the 'minor' list (especially common words like 'English', 'people', 'what'), weave a gentle correction into your reply. DON'T ignore them.\n"
            context_str += "- Maximum ONE pronunciation correction per message\n---\n"
            
            system_prompt += context_str

        context = system_prompt

        for turn in history[-16:]:
            role = "User" if turn.get('role') == 'user' else "Maya"
            context += f"{role}: {turn.get('content', '')}\n"

        context += "Maya:"

        return context