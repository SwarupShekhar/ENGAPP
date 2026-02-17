import re
import io
from google.cloud import texttospeech
from pydub import AudioSegment
from app.core.config import settings
from app.core.logging import logger

class HinglishTTSService:
    def __init__(self):
        if not settings.google_tts_api_key:
            logger.warning("Google TTS API key not configured for HinglishTTSService.")
            self.client = None
            return
            
        # Using the API key directly if needed, or relying on environmental credentials
        # For this setup, we'll assume the client can be initialized.
        # Note: Google Cloud SDK usually expects GOOGLE_APPLICATION_CREDENTIALS path.
        # If using API key, we might need to pass it differently or use a different client.
        try:
            self.client = texttospeech.TextToSpeechClient(
                client_options={"api_key": settings.google_tts_api_key}
            )
        except Exception as e:
            logger.error(f"Failed to initialize Google TTS Client: {e}")
            self.client = None
    
    def synthesize_hinglish(self, text: str, gender: str = 'female') -> bytes:
        """
        Convert Hinglish text to speech by splitting into language chunks.
        """
        if not self.client:
            raise RuntimeError("Hinglish TTS service is not configured or failed to initialize.")
            
        segments = self._split_hinglish_text(text)
        audio_segments = []
        
        for segment in segments:
            if segment['language'] == 'hindi':
                voice = texttospeech.VoiceSelectionParams(
                    language_code='hi-IN',
                    name='hi-IN-Wavenet-A' if gender == 'female' else 'hi-IN-Wavenet-B',
                    ssml_gender=texttospeech.SsmlVoiceGender.FEMALE if gender == 'female' else texttospeech.SsmlVoiceGender.MALE
                )
            else:  # English
                voice = texttospeech.VoiceSelectionParams(
                    language_code='en-IN',
                    name='en-IN-Wavenet-D' if gender == 'female' else 'en-IN-Wavenet-B',
                    ssml_gender=texttospeech.SsmlVoiceGender.FEMALE if gender == 'female' else texttospeech.SsmlVoiceGender.MALE
                )
            
            audio_config = texttospeech.AudioConfig(
                audio_encoding=texttospeech.AudioEncoding.MP3,
                speaking_rate=0.95,
                pitch=0.0
            )
            
            synthesis_input = texttospeech.SynthesisInput(text=segment['text'])
            
            response = self.client.synthesize_speech(
                input=synthesis_input,
                voice=voice,
                audio_config=audio_config
            )
            
            audio_segments.append(response.audio_content)
        
        return self._concatenate_audio(audio_segments)
    
    def _split_hinglish_text(self, text: str) -> list:
        # Regex for Devanagari script
        hindi_pattern = re.compile(r'[\u0900-\u097F]+')
        
        segments = []
        words = text.split()
        if not words:
            return []
            
        current_segment = {'text': '', 'language': None}
        
        for word in words:
            is_hindi = bool(hindi_pattern.search(word))
            lang = 'hindi' if is_hindi else 'english'
            
            if current_segment['language'] is None:
                current_segment['language'] = lang
                current_segment['text'] = word
            elif current_segment['language'] == lang:
                current_segment['text'] += ' ' + word
            else:
                segments.append(current_segment)
                current_segment = {'text': word, 'language': lang}
        
        segments.append(current_segment)
        return segments
    
    def _concatenate_audio(self, audio_segments: list) -> bytes:
        if not audio_segments:
            return b""
            
        combined = AudioSegment.empty()
        for audio_data in audio_segments:
            segment = AudioSegment.from_file(io.BytesIO(audio_data), format='mp3')
            combined += segment
            
        output = io.BytesIO()
        combined.export(output, format='mp3')
        return output.getvalue()

hinglish_tts_service = HinglishTTSService()
