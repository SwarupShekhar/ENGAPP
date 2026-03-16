import base64
import json
import logging
import time
import asyncio

from fastapi import APIRouter, File, Form, UploadFile, WebSocket, WebSocketDisconnect, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.middleware.rate_limiter import rate_limiter
from app.features.tutor.service import StreamingTutorService

logger = logging.getLogger(__name__)

router = APIRouter()
streaming_tutor_service = StreamingTutorService()


async def _generate_stream_response(
    audio_bytes: bytes,
    session_id: str,
    user_id: str,
    conversation_history: list,
):
    """Yield SSE events: transcript, then sentence chunks (text + audio base64), then done."""
    # STT in-process (no extra HTTP hop)
    user_utterance = await streaming_tutor_service.recognize_audio_bytes(audio_bytes)
    if not user_utterance:
        user_utterance = "(no speech detected)"

    # Emit transcript first so mobile can show it immediately
    yield {"type": "transcript", "text": user_utterance}

    # Stream Gemini + TTS sentence by sentence
    async for chunk in streaming_tutor_service.generate_chunked_response(
        user_utterance,
        conversation_history,
        session_id,
        phonetic_context=None,
        audio_base64=None,
    ):
        if chunk.get("type") == "transcript":
            # Already sent above; skip duplicate
            continue
        if chunk.get("type") == "sentence":
            payload = {"type": "sentence", "text": chunk.get("text", "")}
            if chunk.get("audio"):
                payload["audio"] = base64.b64encode(chunk["audio"]).decode("utf-8")
            yield payload
    yield {"type": "done"}


@router.post("/stream-response")
async def stream_tutor_response(
    audio: UploadFile = File(...),
    session_id: str = Form(...),
    user_id: str = Form(...),
    conversation_history: str = Form(default="[]"),
):
    """
    Stream tutor response via SSE. Accepts multipart: audio file + session_id + user_id + conversation_history (JSON array).
    Events: transcript → sentence (text + optional audio base64) → ... → done.
    Mobile can play first sentence audio as soon as it arrives (~2–3s) while rest streams.
    """
    try:
        audio_bytes = await audio.read()
    except Exception as e:
        logger.error("stream-response read audio: %s", e)
        raise HTTPException(status_code=400, detail="Invalid audio upload")
    try:
        history = json.loads(conversation_history) if conversation_history else []
    except json.JSONDecodeError:
        history = []

    async def event_generator():
        try:
            async for event in _generate_stream_response(
                audio_bytes, session_id, user_id, history
            ):
                yield {"data": json.dumps(event)}
        except Exception as e:
            logger.exception("stream-response error: %s", e)
            yield {"data": json.dumps({"type": "error", "message": str(e)})}

    return EventSourceResponse(event_generator())

@router.websocket("/ws/{session_id}")
async def websocket_tutor_session(websocket: WebSocket, session_id: str):
    await websocket.accept()
    
    # In a real app, validate session/auth here. 
    # For now, we assume session_id implies a user.
    # Ideally extracting user_id from token query param or session lookup
    user_id = "test_user" # Placeholder: extract real user_id
    
    # Extract user_id from query params if available
    if "user_id" in websocket.query_params:
        user_id = websocket.query_params["user_id"]
    
    try:
        # Check rate limit (temporarily disabled for testing)
        # await rate_limiter.check_rate_limit(user_id)
        
        # Mark session as active
        rate_limiter.start_session(user_id)
        
        # Set idle timeout (auto-close after 10 min of inactivity)
        last_activity = time.time()
        IDLE_TIMEOUT = 600  # 10 minutes
        
        async def check_idle():
            while True:
                await asyncio.sleep(60)  # Check every minute
                if time.time() - last_activity > IDLE_TIMEOUT:
                    try:
                        await websocket.send_json({
                            'type': 'timeout',
                            'message': 'Session closed due to inactivity'
                        })
                        await websocket.close()
                    except:
                        pass
                    break
        
        # Start idle checker
        idle_task = asyncio.create_task(check_idle())
        
        # Conversation history for context
        conversation_history = []
        
        # Main loop
        while True:
            data = await websocket.receive_text()
            last_activity = time.time()
            
            try:
                message = json.loads(data)
                user_utterance = message.get("text")
                phonetic_context = message.get("phonetic_context") # Optional context from assessment
                audio_base64 = message.get("audio_base64") # Raw audio for Gemini pronunciation analysis
                
                if phonetic_context:
                    logger.info("Received phonetic_context for next turn")
                if audio_base64:
                    logger.info(f"Received audio_base64 for pronunciation analysis ({len(audio_base64)} chars)")
                
                if not user_utterance and audio_base64:
                    import base64
                    from app.features.transcription.hinglish_stt_service import hinglish_stt_service
                    try:
                        audio_bytes = base64.b64decode(audio_base64)
                        logger.info("Transcribing audio on the fly via WebSocket...")
                        stt_res = hinglish_stt_service.transcribe_with_soft_assessment(audio_bytes)
                        user_utterance = stt_res.get("text")
                        
                        if stt_res.get("phonetic_insights"):
                            phonetic_context = stt_res["phonetic_insights"]
                            
                        # Immediately send transcription back to UI
                        if user_utterance:
                            await websocket.send_json({
                                "type": "transcription",
                                "text": user_utterance,
                                "assessmentResult": {"phonetic_insights": phonetic_context} if phonetic_context else None
                            })
                    except Exception as e:
                        logger.error(f"WebSocket on-the-fly STT error: {e}")
                
                if not user_utterance:
                    continue
                    
                # Store user turn
                conversation_history.append({"role": "user", "content": user_utterance})
                
                # Stream response
                full_response_text = ""
                async for chunk in streaming_tutor_service.generate_chunked_response(
                    user_utterance, 
                    conversation_history, 
                    session_id,
                    phonetic_context,
                    audio_base64
                ):
                    # Convert bytes to base64 if audio present (JSON safe)
                    if chunk.get('audio'):
                        import base64
                        chunk['audio'] = base64.b64encode(chunk['audio']).decode('utf-8')
                    
                    if chunk.get('type') == 'sentence':
                        full_response_text += (chunk.get('text', '') + " ")
                        
                    await websocket.send_json(chunk)
                
                # Store assistant turn after completion
                if full_response_text:
                     conversation_history.append({"role": "assistant", "content": full_response_text.strip()})
                     
            except json.JSONDecodeError:
                logger.error("Invalid JSON received")
            except Exception as e:
                logger.error(f"Error processing message: {e}")
                await websocket.send_json({"type": "error", "message": str(e)})

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for session {session_id}")
    except HTTPException as e:
        logger.warning(f"Connection refused: {e.detail}")
        await websocket.close(code=1008, reason=e.detail) # Policy Violation
    except Exception as e:
        logger.error(f"WebSocket connection error: {e}")
        try:
             await websocket.close(code=1011) # Internal Error
        except:
            pass
    finally:
        # Always decrement session count
        rate_limiter.end_session(user_id)
        if 'idle_task' in locals():
            idle_task.cancel()
