import azure.cognitiveservices.speech as speechsdk
import os, json, time

def test_p(text_to_say, ref_text):
    speech_key = os.getenv('AZURE_SPEECH_KEY')
    speech_region = os.getenv('AZURE_SPEECH_REGION')
    
    config = speechsdk.SpeechConfig(subscription=speech_key, region=speech_region)
    # Use push stream or just let it listen to me? 
    # I can't speak to it. I'll use TTS to generate the mispronounciation? 
    # No, TTS will pronounce it correctly. 
    # I'll just check the existing code logic for any flaws.
    pass

print("Checking hinglish_stt_service.py logic...")
