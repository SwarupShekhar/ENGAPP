import google.generativeai as genai
from typing import AsyncGenerator
import asyncio
import re
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

class StreamingGeminiService:
    def __init__(self):
        if not settings.google_api_key:
            raise RuntimeError("GOOGLE_API_KEY is required but not configured")
        
        genai.configure(api_key=settings.google_api_key)
        self.model_name = 'gemini-2.5-flash'
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
        audio_base64: str | None = None
    ) -> AsyncGenerator[str, None]:
        """
        Stream tokens from Gemini and yield complete sentences as they form.
        If audio_base64 is provided, Gemini receives the raw audio to analyze pronunciation.
        """
        full_prompt = self._build_conversation_prompt(prompt, conversation_history, phonetic_context)
        logger.info(f"GEMINI PROMPT: {prompt[:50]}... context={bool(phonetic_context)}, audio={bool(audio_base64)}")
        
        # Build content: text-only or multimodal (text + audio)
        if audio_base64:
            import base64 as b64
            audio_bytes = b64.b64decode(audio_base64)
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
                {"mime_type": "audio/mp4", "data": audio_bytes}
            ]
            logger.info(f"Sending multimodal prompt to Gemini with {len(audio_bytes)} bytes of audio")
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

    def _build_conversation_prompt(
        self, 
        current_utterance: str, 
        history: list,
        phonetic_context: dict | None = None
    ) -> str:
        """Build full context from conversation history"""

        system_prompt = """
You are Maya, an expert spoken-English coach for Indian learners.
Your tone is calm, sharp, warm, and premium. You sound like a highly skilled real tutor, not a hype friend.

Voice and personality:
- Confident and clear, never dramatic or over-excited.
- Encouraging but grounded (no fake praise).
- Gentle humor is fine; avoid slangy catchphrases and repetitive fillers.
- Use Hinglish lightly and intentionally. Default to clear English with occasional Hindi for warmth.

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
- Never use familial terms like "bhai", "didi", "bro", "brother", "sister".
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
3. NEVER use the word "bhai".

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

        if phonetic_context:
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