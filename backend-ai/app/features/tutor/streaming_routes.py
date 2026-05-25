import base64
import json
import logging
import time
import asyncio
import traceback

from fastapi import APIRouter, File, Form, UploadFile, WebSocket, WebSocketDisconnect, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.core.config import settings
from app.middleware.rate_limiter import rate_limiter
from app.features.tutor.service import StreamingTutorService
from app.features.tutor.pronunciation_capture import (
    append_pronunciation_issues,
    build_turn_capture,
    session_captured_issue_count,
    strip_pron_tags_for_mobile,
)
from app.features.tutor.pa_streaming import (
    has_usable_phonetic_context,
    phonetic_context_for_capture,
    phonetic_context_for_stream,
    start_phonetic_enrichment_task,
)
from app.features.tutor.trace_timings import TraceTimings
from app.features.transcription.hinglish_stt_service import hinglish_stt_service

logger = logging.getLogger(__name__)

router = APIRouter()
streaming_tutor_service = StreamingTutorService()


async def _generate_stream_response(
    audio_bytes: bytes,
    session_id: str,
    user_id: str,
    conversation_history: list,
    trace_id: str = "",
    cefr_level: str | None = None,
):
    """Yield SSE events: transcript, then sentence chunks (text + audio base64), then done."""
    timings = TraceTimings(trace_id)
    timings.mark("request_start")

    transcription = await asyncio.to_thread(
        hinglish_stt_service.transcribe_hinglish, audio_bytes
    )
    timings.mark("stt_done")
    user_utterance = (transcription.get("text") or "").strip() or "(no speech detected)"

    yield {"type": "transcript", "text": user_utterance}

    pa_task = start_phonetic_enrichment_task(audio_bytes, user_utterance)
    timings.mark("pa_task_started")
    phonetic_context, pa_in_prompt = await phonetic_context_for_stream(
        pa_task, timings=timings
    )

    if pa_in_prompt:
        yield {"type": "phonetic_ready"}

    timings.mark("llm_stream_start")
    full_response_text = ""
    first_sentence = True
    first_audio_marked = False
    async for chunk in streaming_tutor_service.generate_chunked_response(
        user_utterance,
        conversation_history,
        session_id,
        phonetic_context=phonetic_context,
        audio_base64=None,
        cefr_level=cefr_level,
    ):
        if chunk.get("type") == "transcript":
            continue
        if chunk.get("type") == "sentence":
            if first_sentence:
                timings.mark("first_sentence")
                first_sentence = False
            raw_text = chunk.get("text", "") or ""
            full_response_text += raw_text + " "
            payload = {"type": "sentence", "text": strip_pron_tags_for_mobile(raw_text)}
            if chunk.get("audio"):
                if not first_audio_marked:
                    timings.mark("first_audio")
                    first_audio_marked = True
                payload["audio"] = base64.b64encode(chunk["audio"]).decode("utf-8")
            yield payload

    timings.mark("llm_stream_end")
    capture_phonetic = await phonetic_context_for_capture(
        pa_task, phonetic_context, timings=timings
    )

    if full_response_text.strip() and session_id:
        turn_issues = build_turn_capture(
            full_response_text.strip(),
            user_utterance,
            phonetic_context=capture_phonetic,
        )
        if turn_issues:
            append_pronunciation_issues(session_id, turn_issues)
            timings.mark("pron_capture_count")
            logger.info(
                "[SSE] pronunciation issues captured session_id=%s count=%s",
                session_id,
                len(turn_issues),
            )

    timings.mark("done")
    timings.log_summary("maya_sse")
    yield {"type": "done", "timings": timings.to_dict()}


@router.post("/stream-response")
async def stream_tutor_response(
    audio: UploadFile = File(...),
    session_id: str = Form(...),
    user_id: str = Form(...),
    conversation_history: str = Form(default="[]"),
    trace_id: str = Form(default=""),
    cefr_level: str = Form(default=""),
):
    """
    Stream tutor response via SSE. Accepts multipart: audio file + session_id + user_id + conversation_history (JSON array).
    Events: transcript → (optional phonetic_ready) → sentence (text + optional audio base64) → ... → done.
    """
    await rate_limiter.check_turn_rate_limit(
        user_id,
        max_requests_per_minute=settings.rate_limit_per_minute,
    )

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
                audio_bytes,
                session_id,
                user_id,
                history,
                trace_id=trace_id,
                cefr_level=cefr_level or None,
            ):
                yield {"data": json.dumps(event)}
        except Exception as e:
            logger.exception("stream-response error: %s", e)
            yield {"data": json.dumps({"type": "error", "message": str(e)})}

    return EventSourceResponse(event_generator())


@router.websocket("/ws/{session_id}")
async def websocket_tutor_session(websocket: WebSocket, session_id: str):
    await websocket.accept()
    print(f"[Pulse DEBUG] WebSocket connected session_id={session_id}", flush=True)

    query_user_id = websocket.query_params.get("user_id")
    user_id = (query_user_id or "").strip() or f"session:{session_id}"

    try:
        await rate_limiter.check_rate_limit(
            user_id,
            max_requests_per_minute=settings.rate_limit_per_minute,
        )
        await rate_limiter.start_session(user_id)

        last_activity = time.time()
        IDLE_TIMEOUT = 600

        async def check_idle():
            while True:
                await asyncio.sleep(60)
                if time.time() - last_activity > IDLE_TIMEOUT:
                    try:
                        await websocket.send_json({
                            "type": "timeout",
                            "message": "Session closed due to inactivity",
                        })
                        await websocket.close()
                    except Exception:
                        pass
                    break

        idle_task = asyncio.create_task(check_idle())
        conversation_history = []

        while True:
            data = await websocket.receive_text()
            last_activity = time.time()

            try:
                message = json.loads(data)
                print(
                    f"[Pulse DEBUG] WS message received keys={list(message.keys())} "
                    f"has_audio_base64={bool(message.get('audio_base64'))}",
                    flush=True,
                )
                user_utterance = message.get("text")
                client_phonetic = message.get("phonetic_context")
                audio_base64 = message.get("audio_base64")
                cefr_level = (message.get("cefr_level") or "").strip() or None
                pa_task = None
                ws_timings = TraceTimings(str(message.get("trace_id") or ""))
                ws_timings.mark("ws_message")

                if has_usable_phonetic_context(client_phonetic):
                    logger.info("Using client phonetic_context for stream (skip server PA)")
                elif audio_base64:
                    logger.info(
                        "Received audio_base64 for pronunciation analysis (%s chars)",
                        len(audio_base64),
                    )

                if not user_utterance and audio_base64:
                    try:
                        audio_bytes = base64.b64decode(audio_base64)
                        logger.info("Transcribing audio on the fly via WebSocket (fast STT)...")
                        transcription = await asyncio.to_thread(
                            hinglish_stt_service.transcribe_hinglish, audio_bytes
                        )
                        user_utterance = transcription.get("text")

                        if not has_usable_phonetic_context(client_phonetic):
                            pa_task = start_phonetic_enrichment_task(
                                audio_bytes,
                                user_utterance or "",
                            )

                        if user_utterance:
                            await websocket.send_json({
                                "type": "transcription",
                                "text": user_utterance,
                            })
                    except Exception as e:
                        logger.error("WebSocket on-the-fly STT error: %s", e)
                        pa_task = None

                if not user_utterance:
                    continue

                conversation_history.append({"role": "user", "content": user_utterance})

                stream_phonetic, pa_in_prompt = await phonetic_context_for_stream(
                    pa_task,
                    client_phonetic=client_phonetic,
                    timings=ws_timings,
                )
                if pa_in_prompt:
                    await websocket.send_json({"type": "phonetic_ready"})

                full_response_text = ""
                async for chunk in streaming_tutor_service.generate_chunked_response(
                    user_utterance,
                    conversation_history,
                    session_id,
                    stream_phonetic,
                    audio_base64,
                    cefr_level=cefr_level,
                ):
                    out_chunk = dict(chunk)
                    if out_chunk.get("audio"):
                        out_chunk["audio"] = base64.b64encode(chunk["audio"]).decode("utf-8")

                    if out_chunk.get("type") == "sentence":
                        raw_sentence = chunk.get("text", "") or ""
                        full_response_text += raw_sentence + " "
                        out_chunk["text"] = strip_pron_tags_for_mobile(raw_sentence)

                    await websocket.send_json(out_chunk)

                ws_timings.mark("done")
                ws_timings.log_summary("maya_ws")
                await websocket.send_json({
                    "type": "done",
                    "timings": ws_timings.to_dict(),
                })

                capture_phonetic = await phonetic_context_for_capture(
                    pa_task, stream_phonetic, timings=ws_timings
                )

                if full_response_text:
                    assistant_raw = full_response_text.strip()
                    assistant_clean = strip_pron_tags_for_mobile(assistant_raw)
                    if audio_base64:
                        print(
                            f"[Pulse DEBUG] about to call build_turn_capture "
                            f"audio_base64={'present' if audio_base64 else 'MISSING'} "
                            f"phonetic_context={'present' if capture_phonetic else 'MISSING'} "
                            f"transcript='{(user_utterance or '')[:30] if user_utterance else 'NONE'}'",
                            flush=True,
                        )
                        turn_issues = build_turn_capture(
                            assistant_raw,
                            (user_utterance or "").strip(),
                            phonetic_context=capture_phonetic or {},
                            conversation_history=conversation_history,
                        )
                        if turn_issues:
                            append_pronunciation_issues(session_id, turn_issues)
                    conversation_history.append(
                        {"role": "assistant", "content": assistant_clean}
                    )

            except json.JSONDecodeError:
                logger.error("Invalid JSON received")
            except Exception as e:
                print(
                    f"Error processing message: {type(e).__name__}: {e}",
                    flush=True,
                )
                traceback.print_exc()
                logger.error("Error processing message: %s", e)
                await websocket.send_json({"type": "error", "message": str(e)})

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for session %s", session_id)
    except HTTPException as e:
        logger.warning("Connection refused: %s", e.detail)
        await websocket.close(code=1008, reason=e.detail)
    except Exception as e:
        logger.error("WebSocket connection error: %s", e)
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
    finally:
        try:
            n = session_captured_issue_count(session_id)
            logger.info(
                "[Pulse] pronunciation issues captured session_id=%s count=%s",
                session_id,
                n,
            )
            print(
                f"[Pulse] pronunciation issues captured session_id={session_id} count={n}",
                flush=True,
            )
        except Exception:
            pass
        await rate_limiter.end_session(user_id)
        if "idle_task" in locals():
            idle_task.cancel()
