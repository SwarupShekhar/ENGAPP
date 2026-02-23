from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
from app.middleware.rate_limiter import rate_limiter
from app.services.streaming_tutor_service import StreamingTutorService
import logging
import time
import asyncio
import json

logger = logging.getLogger(__name__)

router = APIRouter()
streaming_tutor_service = StreamingTutorService()

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
                    from app.services.hinglish_stt_service import hinglish_stt_service
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
