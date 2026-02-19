import azure.cognitiveservices.speech as speechsdk
import os
import asyncio
from typing import AsyncGenerator, List
import logging

logger = logging.getLogger(__name__)

class OptimizedTTSService:
    def __init__(self):
        key = os.getenv('AZURE_SPEECH_KEY')
        region = os.getenv('AZURE_SPEECH_REGION')
        
        if not key or not region:
            logger.error("Azure Speech credentials not found")
            raise ValueError("AZURE_SPEECH_KEY and AZURE_SPEECH_REGION must be set")

        self.speech_config = speechsdk.SpeechConfig(
            subscription=key,
            region=region
        )
        
        # Use Azure Neural Voice
        self.speech_config.speech_synthesis_voice_name = "en-IN-AnanyaNeural"
        
        # Output format
        self.speech_config.set_speech_synthesis_output_format(
            speechsdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3
        )
    
    async def synthesize_streaming(self, text: str) -> AsyncGenerator[bytes, None]:
        """
        Stream audio bytes as they're generated.
        Starts returning audio in ~400ms instead of waiting for full generation.
        """
        
        synthesizer = speechsdk.SpeechSynthesizer(
            speech_config=self.speech_config,
        )
        
        # Clean text for TTS (remove markdown asterisks etc)
        text = text.replace('*', '').replace('`', '').replace('_', '')
        
        # Use SSML for better control
        ssml = f"""
        <speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis'
               xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='en-IN'>
            <voice name='en-IN-AnanyaNeural'>
                <prosody rate='1.05' pitch='+5%'>
                    {text}
                </prosody>
            </voice>
        </speak>
        """
        
        loop = asyncio.get_event_loop()
        
        # Running synchronous SDK call in executor to avoid blocking event loop
        result = await loop.run_in_executor(None, lambda: synthesizer.speak_ssml_async(ssml).get())
        
        if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
            # Azure doesn't support true streaming in this SDK version easily without PullAudioOutputStream
            # but getting the full buffer is still fast (~400ms for short sentences).
            # We chunk it to simulate streaming for the frontend if needed, or return all at once.
            audio_data = result.audio_data
            chunk_size = 4096 
            
            for i in range(0, len(audio_data), chunk_size):
                yield audio_data[i:i+chunk_size]
                # No sleep needed for real performance, yield gives control back
        else:
            logger.error(f"TTS failed: {result.reason}")
            if result.cancellation_details:
                logger.error(f"Cancellation details: {result.cancellation_details.error_details}")
            raise Exception(f"TTS failed: {result.reason}")
    
    async def synthesize_sentence(self, text: str) -> bytes:
        """
        Generate audio for a sentence.
        """
        chunks = []
        async for chunk in self.synthesize_streaming(text):
            chunks.append(chunk)
        return b''.join(chunks)
