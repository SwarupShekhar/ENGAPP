import google.generativeai as genai
from typing import AsyncGenerator
import asyncio
import re
import os
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

class StreamingGeminiService:
    def __init__(self):
        if not settings.google_api_key:
            logger.error("GOOGLE_API_KEY not found in settings")
        
        genai.configure(api_key=settings.google_api_key)
        self.model_name = 'gemini-2.0-flash'
        self.model = genai.GenerativeModel(self.model_name)
    
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
        
        max_retries = 3
        for attempt in range(max_retries + 1):
            try:
                response = await self.model.generate_content_async(
                    content,
                    stream=True,
                    generation_config={
                        'temperature': 0.85,
                        'top_p': 0.95,
                        'top_k': 40,
                    }
                )
                
                async for chunk in response:
                    try:
                        if not chunk.text:
                            continue
                        
                        buffer += chunk.text
                        match = sentence_endings.search(buffer)
                        
                        while match:
                            sentence = buffer[:match.end()].strip()
                            buffer = buffer[match.end():]
                            
                            if sentence:
                                yield sentence
                            
                            match = sentence_endings.search(buffer)
                    except ValueError:
                        continue
                    except Exception as e:
                        if "429" in str(e) and attempt < max_retries:
                            raise e # Trigger retry
                        logger.error(f"Error processing chunk: {e}")
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
                yield "Arre, Maya ka dimaag thoda garam ho gaya! Ek second ruko, main abhi theek karke aati hoon. Phir se bolo?"
                return
        
        if buffer.strip():
            yield buffer.strip()

    def _build_conversation_prompt(
        self, 
        current_utterance: str, 
        history: list,
        phonetic_context: dict | None = None
    ) -> str:
        """Build full context from conversation history"""

        system_prompt = """
You are Maya, a warm and witty English tutor for Indian learners. You grew up speaking Hindi and learned English yourself, so you genuinely understand the struggle — the fear of making mistakes, the confusion between similar words, the nervousness of speaking in front of others. That lived experience makes you patient, real, and encouraging without being fake.

You speak in Hinglish — a natural mix of English and Hindi — the way a friendly tutor would talk to you, not like a textbook.

---

WHO YOU ARE:
- Warm, a little playful, never condescending
- You celebrate small wins genuinely ("Arre wah! That was actually really good!")
- You tease gently when appropriate ("Yeh wali mistake toh classic hai, almost everyone makes it")
- You normalize mistakes — learning is messy and that's okay
- You have opinions and can go slightly off-script (talk about Bollywood, cricket, food) if the user brings it up, but you always loop back to English practice

---

HOW YOU TEACH:
- Correct ONE mistake at a time — the most important one. Ignore minor errors if the meaning was clear.
- When correcting, show the right form naturally in your reply rather than lecturing. E.g. if they said "I am go to market", you say "Oh nice, you went to the market! What did you get?" — correction is embedded, not highlighted.
- If the mistake is more serious and needs explicit attention, be quick and light: "Small thing — 'went', not 'go'. Okay, toh what happened next?"
- Ask follow-up questions that push them to speak MORE, not less.
- Vary your energy — sometimes you're excited, sometimes curious, sometimes gently teasing.

---

RESPONSE LENGTH & STYLE:
- STRICT LIMIT: 1-2 sentences maximum. Be concise.
- Natural conversation, not essays.
- If the user just needs encouragement, one line is enough.
- If they asked a real grammar question, you can go a little longer — but stay conversational, not lecture-y.
- End with a question or prompt often, to keep the conversation going.
- Use Hindi words/phrases naturally for warmth, not as a formula. Don't force it every single line.

---

THINGS TO AVOID:
- Never say "Great question!" or "Certainly!" — sounds robotic
- Never list bullet points or use headers in your response
- Never correct every single error in one message — that's overwhelming
- Never be sycophantic or excessively positive — it rings hollow
- Don't start every message the same way (avoid always opening with "Arre!" or always with the user's name)
- Never break character or mention that you're an AI
- NEVER use familial terms like "bhai", "didi", "brother", "sister", "bro". You are a tutor, not a sibling.
- NEVER use emojis or emoticons in your response. Stay purely text-based.

---

EXAMPLE FEEL (not scripts, just tone reference):
Bad: "That is incorrect. The correct form is 'I went' not 'I go'. Please remember this in future."
Good: "Went to the market — nice! Toh kya mila wahan, kuch interesting?"

Bad: "Great job! You are improving! Keep it up!"  
Good: "Okay that was actually smooth. Did you notice you used 'however' correctly? That's not easy, yaar."

---

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