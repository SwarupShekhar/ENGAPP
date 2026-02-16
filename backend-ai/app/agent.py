import logging
import os
import asyncio
import json
from dotenv import load_dotenv
from livekit import agents, rtc
from livekit.plugins import azure

import certifi

# Load environment variables
load_dotenv()

# SSL certificate fix for macOS
os.environ['SSL_CERT_FILE'] = certifi.where()

logger = logging.getLogger("transcription-agent")
logger.setLevel(logging.INFO)

async def entrypoint(ctx: agents.JobContext):
    logger.info(f"Starting transcription agent for room: {ctx.room.name}")

    # Connect to the room
    await ctx.connect()

    # Create Azure STT instance
    stt = azure.STT(
        api_key=os.getenv("AZURE_SPEECH_KEY"),
        region=os.getenv("AZURE_SPEECH_REGION"),
    )

    # Dictionary to track transcriptions per participant
    transcriptions = {}

    @ctx.room.on("track_subscribed")
    def on_track_subscribed(track: rtc.Track, publication: rtc.TrackPublication, participant: rtc.RemoteParticipant):
        if track.kind == rtc.TrackKind.KIND_AUDIO:
            logger.info(f"Subscribed to audio track from {participant.identity}")
            
            # Start transcription for this track
            asyncio.create_task(transcribe_track(track, participant))

    async def transcribe_track(track: rtc.Track, participant: rtc.RemoteParticipant):
        audio_stream = rtc.AudioStream(track)
        
        # Initialize transcription stream
        stt_stream = stt.stream()
        
        # Bridge audio to STT
        async def push_audio():
            async for frame in audio_stream:
                stt_stream.push_frame(frame)
            stt_stream.end_input()

        asyncio.create_task(push_audio())

        # Listen for transcription results
        async for event in stt_stream:
            if event.type == agents.stt.SpeechEventType.FINAL_TRANSCRIPT:
                text = event.alternatives[0].text
                logger.info(f"[{participant.identity}] Transcription: {text}")
                
                # Publish transcription as data packet to the room
                # In real-time mode, we can send it as a DataPacket
                await ctx.room.local_participant.publish_data(
                    payload=json.dumps({
                        "type": "transcription",
                        "userId": participant.identity,
                        "text": text,
                        "timestamp": event.alternatives[0].start_time # or current time
                    }).encode('utf-8'),
                    reliable=True
                )

    logger.info("Agent is listening for audio tracks...")

if __name__ == "__main__":
    import asyncio
    import json
    
    # Run the worker
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint))
