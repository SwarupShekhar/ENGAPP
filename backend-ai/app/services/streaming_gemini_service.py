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
        conversation_history: list
    ) -> AsyncGenerator[str, None]:
        """
        Stream tokens from Gemini and yield complete sentences as they form.
        """
        full_prompt = self._build_conversation_prompt(prompt, conversation_history)
        
        try:
            response = await self.model.generate_content_async(
                full_prompt,
                stream=True,
                generation_config={
                    'temperature': 0.85,
                    'top_p': 0.95,
                    'top_k': 40,
                }
            )
            
            buffer = ""
            sentence_endings = re.compile(r'[.!?]\s')
            
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
                    logger.error(f"Error processing chunk: {e}")
                    continue
            
            if buffer.strip():
                yield buffer.strip()
                
        except Exception as e:
            logger.error(f"Gemini stream failed: {e}")
            yield "Ek second, kuch technical issue aa gaya. Phir se try karte hain!"

    def _build_conversation_prompt(self, current_utterance: str, history: list) -> str:
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

---

EXAMPLE FEEL (not scripts, just tone reference):
Bad: "That is incorrect. The correct form is 'I went' not 'I go'. Please remember this in future."
Good: "Went to the market — nice! Toh kya mila wahan, kuch interesting?"

Bad: "Great job! You are improving! Keep it up!"  
Good: "Okay that was actually smooth. Did you notice you used 'however' correctly? That's not easy, yaar."

---

The conversation so far:
"""

        context = system_prompt

        for turn in history[-16:]:
            role = "User" if turn.get('role') == 'user' else "Maya"
            context += f"{role}: {turn.get('content', '')}\n"

        context += "Maya:"

        return context