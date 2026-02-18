import google.generativeai as genai
from typing import AsyncGenerator
import asyncio
import re
import os
import logging

logger = logging.getLogger(__name__)

class StreamingGeminiService:
    def __init__(self):
        api_key = os.getenv('GEMINI_API_KEY')
        if not api_key:
            logger.error("GEMINI_API_KEY not found in environment variables")
        
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-2.0-flash-exp')
    
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
                    'temperature': 0.9,
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
                    
                    # Check if we have a complete sentence
                    match = sentence_endings.search(buffer)
                    
                    while match:
                        # Extract complete sentence
                        sentence = buffer[:match.end()].strip()
                        buffer = buffer[match.end():]
                        
                        if sentence:
                            yield sentence
                        
                        match = sentence_endings.search(buffer)
                except ValueError:
                    # Handle cases where chunk has no text (e.g. safety blocks)
                    continue
                except Exception as e:
                    logger.error(f"Error processing chunk: {e}")
                    continue
            
            # Yield any remaining text
            if buffer.strip():
                yield buffer.strip()
                
        except Exception as e:
            logger.error(f"Gemini stream failed: {e}")
            yield "I'm having trouble connecting right now. Let's try again."

    def _build_conversation_prompt(self, current_utterance: str, history: list) -> str:
        """Build full context from conversation history"""
        system_prompt = """
You are Priya, a friendly English tutor who speaks Hinglish (Hindi + English mix).

YOUR PERSONALITY:
- Warm, encouraging, patient like a supportive older sister
- You code-switch naturally between Hindi and English
- You celebrate small wins enthusiastically
- You correct errors gently without making the learner feel bad

YOUR TEACHING STYLE:
1. Listen to what the user says
2. If there's an error:
   - Acknowledge what they said
   - Gently correct using the sandwich method: compliment → correction → encouragement
3. Continue the conversation naturally
4. Keep the conversation flowing - don't lecture
"""
        context = system_prompt + "\n\n"
        
        for turn in history[-10:]:  # Last 10 turns
            role = "User" if turn.get('role') == 'user' else "Priya"
            context += f"{role}: {turn.get('content', '')}\n"
        
        context += f"User: {current_utterance}\nPriya:"
        
        return context
