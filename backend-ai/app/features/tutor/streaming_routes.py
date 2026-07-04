import base64
import json
import logging
import time
import asyncio
import traceback

from fastapi import APIRouter, File, Form, UploadFile, WebSocket, WebSocketDisconnect, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.security.internal_auth import verify_ws_token
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
from app.features.tutor.llm.router import get_turn_llm_provider
from app.features.tutor.trace_timings import TraceTimings
from app.features.transcription.hinglish_stt_service import hinglish_stt_service

logger = logging.getLogger(__name__)

try:
    from app.features.coaching.coaching_context import get_context as coaching_get_context
    from app.features.coaching.coaching_context import update_context as coaching_update_context
    from app.features.coaching.hint_engine import get_hint as coaching_get_hint
    from app.features.coaching.learner_profile import (
        build_learner_profile_block,
        user_asks_about_mistakes_or_practice,
    )
    from datetime import datetime, timezone as _tz
    _COACHING_ENABLED = True
except Exception as _coaching_import_err:
    logger.warning("Coaching imports failed — hints disabled: %s", _coaching_import_err)
    _COACHING_ENABLED = False

    def build_learner_profile_block(_ctx):  # type: ignore
        return ""

    def user_asks_about_mistakes_or_practice(_u: str) -> bool:  # type: ignore
        return False

router = APIRouter()
streaming_tutor_service = StreamingTutorService()


def _resolve_coaching_ctx(
    user_id: str,
    session_id: str,
    learner_context: dict | None = None,
) -> dict | None:
    """Sync Redis read — never blocks on an LLM."""
    if not _COACHING_ENABLED:
        return None
    try:
        ctx = coaching_get_context(user_id, session_id)
        if not ctx and learner_context:
            ctx = {
                "userId": user_id,
                "sessionId": session_id,
                "activeTasks": learner_context.get("activeTasks") or [],
                "phraseOfDay": learner_context.get("phraseOfDay"),
                "wordOfDay": learner_context.get("wordOfDay"),
            }
        return ctx
    except Exception as exc:
        logger.warning("coaching context load failed: %s", exc)
        return None


def _consume_pending_coaching_hint(
    user_id: str,
    session_id: str,
    ctx: dict | None,
) -> tuple[dict | None, str | None]:
    """Use last turn's prefetched hint for this turn; clear it from Redis."""
    if not ctx:
        logger.info("[coaching] no context — cannot inject pending hint session=%s", session_id)
        return None, None
    pending = ctx.get("pendingCoachingHint")
    if not isinstance(pending, dict):
        logger.info("[coaching] no pendingCoachingHint to inject session=%s", session_id)
        return None, None
    hint_text = (pending.get("text") or "").strip() or None
    if not hint_text:
        logger.info("[coaching] pendingCoachingHint empty session=%s", session_id)
        return None, None
    try:
        coaching_update_context(user_id, session_id, {"pendingCoachingHint": None})
    except Exception as exc:
        logger.warning("clear pendingCoachingHint failed: %s", exc)
    logger.info(
        "[coaching] pendingCoachingHint injected session=%s trigger=%s",
        session_id,
        pending.get("trigger", "unknown"),
    )
    return pending, hint_text


def _schedule_next_turn_coaching_hint(
    user_id: str,
    session_id: str,
    user_utterance: str,
    ctx: dict | None,
    call_elapsed_seconds: float = 999.0,
) -> None:
    """Prefetch coaching hint for the *next* turn — never awaited on the hot path."""
    if not _COACHING_ENABLED:
        return
    if not ctx:
        # Still prefetch using a minimal shell so Redis upsert can store the hint.
        ctx = {"userId": user_id, "sessionId": session_id}

    async def _prefetch() -> None:
        try:
            payload = await coaching_get_hint(user_utterance, ctx, call_elapsed_seconds)
            if payload and (payload.get("text") or "").strip():
                coaching_update_context(
                    user_id,
                    session_id,
                    {"pendingCoachingHint": payload},
                )
                logger.info(
                    "[coaching] pendingCoachingHint stored for next turn session=%s trigger=%s",
                    session_id,
                    payload.get("trigger", "unknown"),
                )
            else:
                logger.info(
                    "[coaching] no hint to store for next turn session=%s",
                    session_id,
                )
        except Exception as exc:
            logger.warning("next-turn coaching hint prefetch failed: %s", exc)

    asyncio.create_task(_prefetch())


async def _generate_stream_response(
    audio_bytes: bytes,
    session_id: str,
    user_id: str,
    conversation_history: list,
    trace_id: str = "",
    cefr_level: str | None = None,
    learner_context: dict | None = None,
):
    """Yield SSE events: transcript, then sentence chunks (text + audio base64), then done."""
    timings = TraceTimings(trace_id)
    timings.mark("request_start")

    transcription = await asyncio.to_thread(
        hinglish_stt_service.transcribe_hinglish, audio_bytes
    )
    timings.mark("stt_done")
    stt_provider = (transcription.get("provider") or "azure").strip().lower()
    timings.set_meta(stt_provider=stt_provider)
    user_utterance = (transcription.get("text") or "").strip() or "(no speech detected)"

    yield {"type": "transcript", "text": user_utterance}

    # Feedback loop: check if user used the previously hinted phrase
    try:
        if _COACHING_ENABLED and user_id and session_id:
            from app.features.coaching.coaching_context import check_and_clear_pending_hint
            _confirmed_hint = check_and_clear_pending_hint(user_id, session_id, user_utterance)
            if _confirmed_hint:
                import os as _os
                nest_url = _os.getenv("BACKEND_NEST_URL", "http://backend-nest:3000")
                async def _notify_hint_confirmed(_uid=user_id, _sid=session_id, _ch=_confirmed_hint, _url=nest_url):
                    try:
                        import httpx as _httpx
                        async with _httpx.AsyncClient() as _client:
                            await _client.post(
                                f"{_url}/internal/coaching-context/{_uid}/{_sid}/hint-confirmed",
                                json={"taskId": _ch.get("taskId"), "phrase": _ch.get("phrase", "")},
                                timeout=3.0,
                            )
                    except Exception as _ne:
                        logger.warning("[coaching] hint-confirmed notify failed: %s", _ne)
                asyncio.create_task(_notify_hint_confirmed())
                # Mark phrase usage in Redis on confirmed speech
                try:
                    from app.features.coaching.coaching_context import update_context as _upd_ctx
                    _mark = _confirmed_hint.get("markField")
                    _gap_updates: dict = {
                        "adaptiveGapSeconds": max(45, (coaching_get_context(user_id, session_id) or {}).get("adaptiveGapSeconds", 90) - 15),
                        "consecutiveMisses": 0,
                    }
                    if _mark:
                        _gap_updates[_mark] = True
                    _upd_ctx(user_id, session_id, _gap_updates)
                except Exception as _ge:
                    logger.warning("[coaching] adaptive gap reward failed (SSE): %s", _ge)
    except Exception as _e:
        logger.warning("[coaching] feedback loop check failed (SSE): %s", _e)

    # Coaching: inject previous turn's pending hint only (never wait on hint LLM).
    _coaching_ctx = _resolve_coaching_ctx(user_id, session_id, learner_context)
    _coaching_hint_payload, _coaching_hint_text = _consume_pending_coaching_hint(
        user_id, session_id, _coaching_ctx
    )
    _schedule_next_turn_coaching_hint(
        user_id, session_id, user_utterance, _coaching_ctx
    )

    if settings.tutor_defer_pronunciation:
        pa_task = None
        phonetic_context = {}
        pa_in_prompt = False
        timings.mark("pa_deferred")
    else:
        pa_task = start_phonetic_enrichment_task(audio_bytes, user_utterance)
        timings.mark("pa_task_started")
        phonetic_context, pa_in_prompt = await phonetic_context_for_stream(
            pa_task, timings=timings
        )

    # Opportunity prompt: append once per call so Maya creates a natural usage moment
    try:
        if _COACHING_ENABLED and _coaching_ctx and not _coaching_ctx.get("opportunityPromptAdded"):
            _phrase_obj = _coaching_ctx.get("phraseOfDay")
            if _phrase_obj:
                _opp_phrase = _phrase_obj.get("phrase", "")
                _opp_directive = (
                    f'\n\n[LEARNING OPPORTUNITY — apply subtly throughout the call]: '
                    f'The learner is practicing the phrase "{_opp_phrase}". '
                    f'Naturally steer the conversation toward a moment where they could use it. '
                    f'Do NOT tell them to say it — create the situation organically.'
                )
                _coaching_ctx["opportunityDirective"] = _opp_directive
                from app.features.coaching.coaching_context import update_context as _upd_ctx2
                _upd_ctx2(user_id, session_id, {
                    "opportunityPromptAdded": True,
                    "opportunityDirective": _opp_directive,
                })
    except Exception as _oe:
        logger.warning("[coaching] opportunity prompt failed (SSE): %s", _oe)

    # set_pending_hint_check when we inject a hint this turn
    try:
        if _coaching_hint_payload and _COACHING_ENABLED:
            from app.features.coaching.coaching_context import set_pending_hint_check
            set_pending_hint_check(
                user_id, session_id,
                _coaching_hint_payload.get("watchPhrase", ""),
                _coaching_hint_payload.get("taskId"),
                _coaching_hint_payload.get("markField"),
            )
    except Exception as _e:
        logger.warning("[coaching] set_pending_hint_check failed (SSE): %s", _e)

    if pa_in_prompt:
        yield {"type": "phonetic_ready"}

    # Learner profile only when the user asks (avoids inventing past mistakes).
    if phonetic_context is None:
        phonetic_context = {}
    if user_asks_about_mistakes_or_practice(user_utterance):
        phonetic_context["answer_from_profile"] = True
        profile_block = build_learner_profile_block(_coaching_ctx)
        if profile_block:
            phonetic_context["learner_profile"] = profile_block

    # Attach coaching hint and opportunity directive to phonetic_context
    if _coaching_hint_text or (_coaching_ctx and _coaching_ctx.get("opportunityDirective")):
        if _coaching_hint_text:
            phonetic_context["coaching_hint"] = _coaching_hint_text
        _opp_dir = (_coaching_ctx or {}).get("opportunityDirective")
        if _opp_dir:
            phonetic_context["opportunityDirective"] = _opp_dir

    # Push coaching hint to the mobile client over SSE before LLM streaming starts
    if _coaching_hint_text and _coaching_hint_payload:
        yield {
            "type": "coaching_hint",
            "text": _coaching_hint_text,
            "trigger": _coaching_hint_payload.get("trigger", "unknown"),
        }

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
        if chunk.get("type") == "audio" and chunk.get("audio"):
            if not first_audio_marked:
                timings.mark("first_audio")
                first_audio_marked = True
            yield {
                "type": "audio",
                "audio": base64.b64encode(chunk["audio"]).decode("utf-8"),
            }
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
    if not settings.tutor_defer_pronunciation:
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

    # Persist coaching hint state to Redis (hintCount + lastHintAt only — markField is
    # set only on confirmed phrase usage in the feedback loop above, not on hint fire)
    if _COACHING_ENABLED and _coaching_hint_payload:
        try:
            _ctx_now = coaching_get_context(user_id, session_id)
            redis_updates: dict = {
                "hintCount": (_ctx_now.get("hintCount", 0) + 1) if _ctx_now else 1,
                "lastHintAt": datetime.now(_tz.utc).isoformat(),
            }
            coaching_update_context(user_id, session_id, redis_updates)
        except Exception as _ce:
            logger.warning("coaching context update failed (SSE): %s", _ce)
    elif _COACHING_ENABLED and not _coaching_hint_payload:
        # No hint fired — track consecutive misses to widen adaptive gap
        try:
            _miss_ctx = coaching_get_context(user_id, session_id)
            if _miss_ctx and _miss_ctx.get("hintCount", 0) > 0 and not _miss_ctx.get("pendingHintCheck"):
                _misses = _miss_ctx.get("consecutiveMisses", 0) + 1
                _miss_updates: dict = {"consecutiveMisses": _misses}
                if _misses >= 2:
                    _cur_gap = _miss_ctx.get("adaptiveGapSeconds", 90)
                    _miss_updates["adaptiveGapSeconds"] = min(180, _cur_gap + 30)
                coaching_update_context(user_id, session_id, _miss_updates)
        except Exception as _me:
            logger.warning("[coaching] consecutive misses update failed (SSE): %s", _me)

    llm_provider = get_turn_llm_provider()
    timings.set_meta(
        llm_provider=llm_provider or "none",
        coaching_hint_injected=bool(_coaching_hint_text),
    )
    timings.mark("done")
    timings.log_summary("maya_sse")
    done_event: dict = {"type": "done", "timings": timings.to_dict()}
    if llm_provider:
        done_event["llm_provider"] = llm_provider
    yield done_event


@router.post("/stream-response")
async def stream_tutor_response(
    audio: UploadFile = File(...),
    session_id: str = Form(...),
    user_id: str = Form(...),
    conversation_history: str = Form(default="[]"),
    trace_id: str = Form(default=""),
    cefr_level: str = Form(default=""),
    learner_context: str = Form(default=""),
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
    parsed_learner_ctx: dict | None = None
    if learner_context:
        try:
            parsed_learner_ctx = json.loads(learner_context)
        except json.JSONDecodeError:
            parsed_learner_ctx = None

    async def event_generator():
        try:
            async for event in _generate_stream_response(
                audio_bytes,
                session_id,
                user_id,
                history,
                trace_id=trace_id,
                cefr_level=cefr_level or None,
                learner_context=parsed_learner_ctx,
            ):
                yield {"data": json.dumps(event)}
        except Exception as e:
            logger.exception("stream-response error: %s", e)
            yield {"data": json.dumps({"type": "error", "message": str(e)})}

    return EventSourceResponse(event_generator())


@router.websocket("/ws/{session_id}")
async def websocket_tutor_session(websocket: WebSocket, session_id: str):
    query_user_id = websocket.query_params.get("user_id")
    user_id = (query_user_id or "").strip() or f"session:{session_id}"

    try:
        verify_ws_token(
            websocket.query_params.get("ws_token"),
            session_id,
            query_user_id.strip() if query_user_id else None,
        )
    except HTTPException as exc:
        await websocket.close(code=1008, reason=exc.detail)
        return

    await websocket.accept()
    print(f"[Pulse DEBUG] WebSocket connected session_id={session_id}", flush=True)

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
        ws_session_start = time.time()

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

                        if (
                            not has_usable_phonetic_context(client_phonetic)
                            and not settings.tutor_defer_pronunciation
                        ):
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

                # Feedback loop: check if user used the previously hinted phrase
                try:
                    if _COACHING_ENABLED and user_id and session_id:
                        from app.features.coaching.coaching_context import check_and_clear_pending_hint
                        _ws_confirmed = check_and_clear_pending_hint(user_id, session_id, user_utterance)
                        if _ws_confirmed:
                            import os as _os2
                            _ws_nest_url = _os2.getenv("BACKEND_NEST_URL", "http://backend-nest:3000")
                            async def _ws_notify(_uid=user_id, _sid=session_id, _ch=_ws_confirmed, _url=_ws_nest_url):
                                try:
                                    import httpx as _httpx2
                                    async with _httpx2.AsyncClient() as _cl2:
                                        await _cl2.post(
                                            f"{_url}/internal/coaching-context/{_uid}/{_sid}/hint-confirmed",
                                            json={"taskId": _ch.get("taskId"), "phrase": _ch.get("phrase", "")},
                                            timeout=3.0,
                                        )
                                except Exception as _ne2:
                                    logger.warning("[coaching] hint-confirmed notify failed (WS): %s", _ne2)
                            asyncio.create_task(_ws_notify())
                            # Mark phrase usage in Redis on confirmed speech
                            try:
                                from app.features.coaching.coaching_context import update_context as _ws_upd
                                _ws_mark = _ws_confirmed.get("markField")
                                _ws_gap_ctx = coaching_get_context(user_id, session_id)
                                _ws_gap_upd: dict = {
                                    "adaptiveGapSeconds": max(45, (_ws_gap_ctx or {}).get("adaptiveGapSeconds", 90) - 15),
                                    "consecutiveMisses": 0,
                                }
                                if _ws_mark:
                                    _ws_gap_upd[_ws_mark] = True
                                _ws_upd(user_id, session_id, _ws_gap_upd)
                            except Exception as _wge:
                                logger.warning("[coaching] adaptive gap reward failed (WS): %s", _wge)
                except Exception as _wfe:
                    logger.warning("[coaching] feedback loop check failed (WS): %s", _wfe)

                # Coaching: previous-turn pending hint only (never wait on hint LLM).
                _ws_coaching_ctx = _resolve_coaching_ctx(user_id, session_id)
                _ws_hint_payload, _ws_hint_text = _consume_pending_coaching_hint(
                    user_id, session_id, _ws_coaching_ctx
                )
                _schedule_next_turn_coaching_hint(
                    user_id,
                    session_id,
                    user_utterance,
                    _ws_coaching_ctx,
                    call_elapsed_seconds=time.time() - ws_session_start,
                )

                # Opportunity prompt: append once per call
                try:
                    if _COACHING_ENABLED and _ws_coaching_ctx and not _ws_coaching_ctx.get("opportunityPromptAdded"):
                        _ws_phrase_obj = _ws_coaching_ctx.get("phraseOfDay")
                        if _ws_phrase_obj:
                            _ws_opp_phrase = _ws_phrase_obj.get("phrase", "")
                            _ws_opp_dir = (
                                f'\n\n[LEARNING OPPORTUNITY — apply subtly throughout the call]: '
                                f'The learner is practicing the phrase "{_ws_opp_phrase}". '
                                f'Naturally steer the conversation toward a moment where they could use it. '
                                f'Do NOT tell them to say it — create the situation organically.'
                            )
                            _ws_coaching_ctx["opportunityDirective"] = _ws_opp_dir
                            from app.features.coaching.coaching_context import update_context as _ws_upd2
                            _ws_upd2(user_id, session_id, {
                                "opportunityPromptAdded": True,
                                "opportunityDirective": _ws_opp_dir,
                            })
                except Exception as _woe:
                    logger.warning("[coaching] opportunity prompt failed (WS): %s", _woe)

                # set_pending_hint_check when we inject a hint this turn
                try:
                    if _ws_hint_payload and _COACHING_ENABLED:
                        from app.features.coaching.coaching_context import set_pending_hint_check
                        set_pending_hint_check(
                            user_id, session_id,
                            _ws_hint_payload.get("watchPhrase", ""),
                            _ws_hint_payload.get("taskId"),
                            _ws_hint_payload.get("markField"),
                        )
                except Exception as _wpe:
                    logger.warning("[coaching] set_pending_hint_check failed (WS): %s", _wpe)

                stream_phonetic, pa_in_prompt = await phonetic_context_for_stream(
                    pa_task,
                    client_phonetic=client_phonetic,
                    timings=ws_timings,
                )
                if pa_in_prompt:
                    await websocket.send_json({"type": "phonetic_ready"})

                # Push coaching hint to the mobile client before streaming starts
                if _ws_hint_text and _ws_hint_payload:
                    await websocket.send_json({
                        "type": "coaching_hint",
                        "text": _ws_hint_text,
                        "trigger": _ws_hint_payload.get("trigger", "unknown"),
                    })

                # Attach coaching hint and opportunity directive to stream_phonetic
                if _ws_hint_text or (_ws_coaching_ctx and _ws_coaching_ctx.get("opportunityDirective")):
                    if stream_phonetic is None:
                        stream_phonetic = {}
                    if _ws_hint_text:
                        stream_phonetic["coaching_hint"] = _ws_hint_text
                    _ws_opp_d = (_ws_coaching_ctx or {}).get("opportunityDirective")
                    if _ws_opp_d:
                        stream_phonetic["opportunityDirective"] = _ws_opp_d

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
                ws_done: dict = {"type": "done", "timings": ws_timings.to_dict()}
                ws_llm = get_turn_llm_provider()
                if ws_llm:
                    ws_done["llm_provider"] = ws_llm
                await websocket.send_json(ws_done)

                # Persist coaching hint state to Redis (hintCount + lastHintAt only —
                # markField is set only on confirmed phrase usage in the feedback loop above)
                if _COACHING_ENABLED and _ws_hint_payload:
                    try:
                        _ws_ctx_now = coaching_get_context(user_id, session_id)
                        _ws_redis_updates: dict = {
                            "hintCount": (_ws_ctx_now.get("hintCount", 0) + 1) if _ws_ctx_now else 1,
                            "lastHintAt": datetime.now(_tz.utc).isoformat(),
                        }
                        coaching_update_context(user_id, session_id, _ws_redis_updates)
                    except Exception as _wce2:
                        logger.warning("coaching context update failed (WS): %s", _wce2)
                elif _COACHING_ENABLED and not _ws_hint_payload:
                    # No hint fired — track consecutive misses to widen adaptive gap
                    try:
                        _ws_miss_ctx = coaching_get_context(user_id, session_id)
                        if _ws_miss_ctx and _ws_miss_ctx.get("hintCount", 0) > 0 and not _ws_miss_ctx.get("pendingHintCheck"):
                            _ws_misses = _ws_miss_ctx.get("consecutiveMisses", 0) + 1
                            _ws_miss_upd: dict = {"consecutiveMisses": _ws_misses}
                            if _ws_misses >= 2:
                                _ws_cgap = _ws_miss_ctx.get("adaptiveGapSeconds", 90)
                                _ws_miss_upd["adaptiveGapSeconds"] = min(180, _ws_cgap + 30)
                            coaching_update_context(user_id, session_id, _ws_miss_upd)
                    except Exception as _wme:
                        logger.warning("[coaching] consecutive misses update failed (WS): %s", _wme)

                if not settings.tutor_defer_pronunciation:
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
                elif full_response_text:
                    assistant_clean = strip_pron_tags_for_mobile(
                        full_response_text.strip()
                    )
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
