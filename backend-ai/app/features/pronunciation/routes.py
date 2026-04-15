"""
Pronunciation Assessment API.
- POST /pronunciation/assess — run Azure Pronunciation Assessment (optional) + phoneme detector.
  Body: multipart audio + optional reference_text, or JSON { "azure_result": {...} }.
"""
from __future__ import annotations

import logging
import os
import tempfile
import asyncio
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, Request

from app.features.pronunciation.pronunciation_detector import detect_from_azure_result
from app.features.pronunciation.pronunciation_scorer import calculate_pronunciation_score

logger = logging.getLogger(__name__)


def _compute_word_accuracy_average(azure_result: dict[str, Any]) -> float:
    """Average of all word-level AccuracyScore values from the Azure PA result. Default 100 if none."""
    words: list[dict] = []
    nbests = azure_result.get("NBest") or azure_result.get("Nbests") or azure_result.get("nbest")
    if nbests and isinstance(nbests, list) and len(nbests) > 0:
        first = nbests[0]
        words = first.get("Words") or first.get("words") or []
    elif "Words" in azure_result:
        words = azure_result["Words"]
    elif "words" in azure_result:
        words = azure_result["words"]
    if not words:
        return 100.0
    total = 0.0
    count = 0
    for w in words:
        acc = w.get("AccuracyScore") or (w.get("PronunciationAssessment") or {}).get("AccuracyScore")
        if acc is not None:
            total += float(acc)
            count += 1
    return total / count if count else 100.0


def _clean_reference_text(text: str) -> str:
    """Removes speaker labels (e.g. 'User A:', 'Partner:') and empty lines."""
    import re
    if not text:
        return "hello"
    # Remove things like "User 123:", "Partner:", "AnyName:" at start of lines
    cleaned = re.sub(r"^[A-Za-z0-9\s]+:\s*", "", text, flags=re.MULTILINE)
    # Remove punctuation that might confuse PA if it's too heavy
    cleaned = cleaned.replace("\n", " ").strip()
    return cleaned or "hello"


router = APIRouter(prefix="/pronunciation", tags=["pronunciation"])

# Optional: Azure Speech for Pronunciation Assessment (same key as STT)
AZURE_SPEECH_KEY = os.getenv("AZURE_SPEECH_KEY", "")
AZURE_SPEECH_REGION = os.getenv("AZURE_SPEECH_REGION", "eastus")


def _run_continuous_pa_sync(
    audio_path: str,
    reference_text: str,
) -> list[dict]:
    """
    Run Azure PA with continuous recognition so the ENTIRE audio file is assessed,
    not just the first utterance.  Returns a flat list of word dicts with
    PronunciationAssessment / Phonemes from every recognized segment.
    """
    import json as _json
    import azure.cognitiveservices.speech as speechsdk
    import threading

    speech_config = speechsdk.SpeechConfig(subscription=AZURE_SPEECH_KEY, region=AZURE_SPEECH_REGION)
    speech_config.speech_recognition_language = "en-US"

    audio_config = speechsdk.audio.AudioConfig(filename=audio_path)
    recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config, audio_config=audio_config)

    pa_config = speechsdk.PronunciationAssessmentConfig(
        reference_text=reference_text,
        grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
        granularity=speechsdk.PronunciationAssessmentGranularity.Phoneme,
        enable_miscue=True,
    )
    pa_config.enable_prosody_assessment = True
    pa_config.apply_to(recognizer)

    all_words: list[dict] = []
    fluency_scores: list[float] = []
    prosody_scores: list[float] = []
    done = threading.Event()
    errors: list[str] = []

    def on_recognized(evt):
        try:
            if evt.result.reason != speechsdk.ResultReason.RecognizedSpeech:
                return
            detail_str = evt.result.properties.get(speechsdk.PropertyId.SpeechServiceResponse_JsonResult)
            if not detail_str:
                return
            data = _json.loads(detail_str)
            nbests = data.get("NBest") or data.get("nbest") or []
            # Prefer SDK object — ProsodyScore is at full-text level and is often populated here
            # when JSON omits or nests it differently (continuous recognition).
            fluency_val: float | None = None
            prosody_val: float | None = None
            try:
                pa_sdk = speechsdk.PronunciationAssessmentResult(evt.result)
                fluency_val = float(pa_sdk.fluency_score)
                # Available with enable_prosody_assessment + SDK >= 1.35
                prosody_val = float(pa_sdk.prosody_score)
            except Exception:
                pass

            if nbests:
                first = nbests[0]
                segment_words = first.get("Words") or first.get("words") or []
                all_words.extend(segment_words)
                pa_info = (
                    first.get("PronunciationAssessment")
                    or data.get("PronunciationAssessment")
                    or {}
                )
                if fluency_val is None and "FluencyScore" in pa_info:
                    fluency_val = float(pa_info["FluencyScore"])
                if prosody_val is None and "ProsodyScore" in pa_info:
                    prosody_val = float(pa_info["ProsodyScore"])
                if fluency_val is not None:
                    fluency_scores.append(fluency_val)
                if prosody_val is not None:
                    prosody_scores.append(prosody_val)
                logger.info(
                    "PA segment: %d words (total: %d), fluency=%s, prosody=%s",
                    len(segment_words),
                    len(all_words),
                    fluency_val if fluency_val is not None else pa_info.get("FluencyScore", "N/A"),
                    prosody_val if prosody_val is not None else pa_info.get("ProsodyScore", "N/A"),
                )
        except Exception as e:
            logger.warning("PA on_recognized parse error: %s", e)

    def on_canceled(evt):
        if evt.cancellation_details.reason == speechsdk.CancellationReason.Error:
            errors.append(evt.cancellation_details.error_details or "unknown cancellation error")
        done.set()

    def on_stopped(_evt):
        done.set()

    recognizer.recognized.connect(on_recognized)
    recognizer.canceled.connect(on_canceled)
    recognizer.session_stopped.connect(on_stopped)

    recognizer.start_continuous_recognition()
    done.wait(timeout=120)
    recognizer.stop_continuous_recognition()

    if errors:
        logger.error("PA continuous recognition errors: %s", errors)

    avg_fluency = sum(fluency_scores) / len(fluency_scores) if fluency_scores else None
    avg_prosody = sum(prosody_scores) / len(prosody_scores) if prosody_scores else None

    return all_words, avg_fluency, avg_prosody


async def _run_azure_pronunciation_assessment(
    audio_path: str,
    reference_text: str | None,
) -> dict[str, Any]:
    """
    Run Azure Pronunciation Assessment against the full audio file.

    Strategy:
    - Always use continuous recognition so ALL speech in the recording is assessed
      (recognize_once only handles the first ~15s utterance).
    - enable_miscue is applied so Azure does forced alignment against the reference.
    - For continuous mode, Azure may not report Omission/Insertion ErrorType; the
      detector compensates by comparing recognized words against the reference.
    """
    try:
        import azure.cognitiveservices.speech as speechsdk  # noqa: F401
    except ImportError:
        raise HTTPException(503, "Azure Speech SDK not installed")

    if not AZURE_SPEECH_KEY:
        raise HTTPException(503, "AZURE_SPEECH_KEY not set")

    ref = (reference_text or "").strip()  # empty = free-speech mode

    try:
        all_words, avg_fluency, avg_prosody = await asyncio.to_thread(
            _run_continuous_pa_sync, audio_path, ref
        )
    except Exception as e:
        logger.warning("Azure PA continuous failed: %s", e)
        return {"Words": [], "error": str(e), "fallback": False}

    if not all_words:
        logger.error("Azure PA returned 0 words for audio %s (ref len=%d)", audio_path, len(ref))
        return {"Words": [], "error": "No words recognized by Azure PA", "fallback": False}

    logger.info(
        "Azure PA assessed %d words total, fluency=%.1f, prosody=%s",
        len(all_words),
        avg_fluency if avg_fluency is not None else -1,
        f"{avg_prosody:.1f}" if avg_prosody is not None else "N/A",
    )
    result: dict[str, Any] = {
        "Nbests": [{"Words": all_words}],
        "Words": all_words,
    }
    if avg_fluency is not None:
        result["fluency_score"] = avg_fluency
    if avg_prosody is not None:
        result["prosody_score"] = avg_prosody
    return result


@router.post("/assess")
async def assess_pronunciation(
    request: Request,
    audio: UploadFile | None = File(None),
    reference_text: str | None = Form(None),
    azure_result: str | None = Form(None),
    audio_url: str | None = Form(None),
):
    """
    POST /pronunciation/assess
    Accepts EITHER:
    1. Multipart Form Data: `audio` (file) and `reference_text`
    2. Multipart Form Data: `audio_url` (URL) and `reference_text` — backend downloads the audio
    3. JSON Body: `{"audio_base64": "...", "reference_text": "..."}` or `{"azure_result": {...}}`
    """
    content_type = request.headers.get("content-type", "")
    is_json = "application/json" in content_type.lower()
    
    _audio_base64 = None
    _reference_text = reference_text
    _azure_result = azure_result
    _audio_url = audio_url

    if is_json:
        try:
            body = await request.json()
            if "azure_result" in body:
                _azure_result = body["azure_result"]
            _audio_base64 = body.get("audio_base64")
            _audio_url = body.get("audio_url", _audio_url)
            _reference_text = body.get("reference_text", _reference_text)
        except Exception as e:
            raise HTTPException(400, f"Invalid JSON body: {e}")

    # JSON-only: { "azure_result": { ... } }
    if _azure_result:
        try:
            import json as _json
            data = _json.loads(_azure_result) if isinstance(_azure_result, str) else _azure_result
        except Exception as e:
            raise HTTPException(400, f"Invalid azure_result JSON: {e}")
        raw = data.get("azure_result") or data
        errors = detect_from_azure_result(raw)
        azure_avg = _compute_word_accuracy_average(raw)
        fluency = raw.get("fluency_score")
        prosody = raw.get("prosody_score")
        score_result = calculate_pronunciation_score(
            errors, azure_avg, fluency_score=fluency, prosody_score=prosody,
        )
        return {"flagged_errors": errors, "pronunciation_score": score_result}

    MAX_AUDIO_SIZE_BYTES = 10 * 1024 * 1024

    content: bytes | None = None

    if audio:
        content = await audio.read()
        if len(content) > MAX_AUDIO_SIZE_BYTES:
            raise HTTPException(413, "Audio file too large (max 10MB)")
    elif _audio_base64:
        if len(_audio_base64) > (MAX_AUDIO_SIZE_BYTES * 4 / 3):
            raise HTTPException(413, "Audio base64 payload too large (max 10MB)")
        import base64
        try:
            content = base64.b64decode(_audio_base64)
        except Exception as e:
            logger.warning("Invalid base64 audio: %s", e)
            raise HTTPException(400, "Invalid audio_base64") from e
    elif _audio_url:
        from app.features.transcription.audio_utils import download_audio_streamed
        ext = os.path.splitext(_audio_url.split("?")[0])[-1] or ".mp4"
        fd, tmp_dl = tempfile.mkstemp(suffix=ext)
        os.close(fd)
        try:
            await download_audio_streamed(_audio_url, tmp_dl)
            with open(tmp_dl, "rb") as f:
                content = f.read()
            logger.info("Downloaded audio from URL for PA: %d bytes", len(content))
        except Exception as e:
            logger.error("Failed to download audio_url for PA: %s", e, exc_info=True)
            raise HTTPException(502, f"Could not download audio from URL: {e}")
        finally:
            try:
                os.unlink(tmp_dl)
            except OSError:
                pass
    else:
        raise HTTPException(400, "Provide audio file, audio_url, or JSON body with audio_base64")

    if not content:
        raise HTTPException(400, "No audio content received")

    # Expo/React Native typically sends m4a. Write to temp with extension so pydub can detect format.
    fd_in = tempfile.NamedTemporaryFile(delete=False, suffix=".m4a")
    fd_in.write(content)
    fd_in.close()
    tmp_in = fd_in.name
    fd_wav, tmp_wav = tempfile.mkstemp(suffix=".wav")
    os.close(fd_wav)

    try:
        import io
        wav_ready = False
        try:
            from pydub import AudioSegment
            # Prefer loading from file with .m4a so pydub/ffmpeg detects format (Expo records m4a).
            try:
                seg = AudioSegment.from_file(tmp_in)
            except Exception as e1:
                logger.warning("pydub from_file(m4a) failed: %s; trying from BytesIO", e1)
                seg = AudioSegment.from_file(io.BytesIO(content))
            seg = seg.set_frame_rate(16000).set_channels(1).set_sample_width(2)
            seg.export(tmp_wav, format="wav")
            wav_ready = True
            duration_s = len(seg) / 1000.0
            logger.info("Converted audio to WAV: %s (%.1fs, %d samples)", tmp_wav, duration_s, len(seg.raw_data))
        except Exception as e:
            logger.error("Failed to convert audio via pydub: %s", e, exc_info=True)
            # Client usually sends m4a (Expo). pydub needs ffmpeg for m4a.
            raise HTTPException(
                503,
                "Audio conversion failed; ensure ffmpeg is installed for m4a support.",
            )

        if not wav_ready or not os.path.isfile(tmp_wav) or os.path.getsize(tmp_wav) == 0:
            raise HTTPException(400, "Could not produce valid WAV from audio")

        try:
            import azure.cognitiveservices.speech as speechsdk
            # Use caller-supplied reference_text for read-aloud tasks.
            # When empty/absent, use "" (free-speech mode) — do NOT run STT first
            # and feed the transcript back as reference: that creates a self-reference
            # trap where Azure compares speech against itself and returns 100% scores.
            if _reference_text and _reference_text.strip():
                pass_1_transcript = _clean_reference_text(_reference_text)
            else:
                pass_1_transcript = ""

            logger.info(
                "[PA] reference_text='%s' audio_len=%d",
                pass_1_transcript[:60] if pass_1_transcript else "(free-speech mode)",
                len(content),
            )

            pass_2_result = await _run_azure_pronunciation_assessment(
                tmp_wav, pass_1_transcript
            )
            if pass_2_result.get("error"):
                logger.warning("Azure PA returned error: %s", pass_2_result.get("error"))
            detector_reference = pass_1_transcript
            errors = detect_from_azure_result(pass_2_result, reference_text=detector_reference)
            azure_avg = _compute_word_accuracy_average(pass_2_result)
            fluency = pass_2_result.get("fluency_score")
            prosody = pass_2_result.get("prosody_score")
            score_result = calculate_pronunciation_score(
                errors,
                azure_avg,
                fluency_score=fluency,
                prosody_score=prosody,
            )
            return {
                "flagged_errors": errors,
                "pronunciation_score": score_result,
                "azure_result": pass_2_result,
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Pronunciation assess failed: %s", e)
            raise HTTPException(500, f"Pronunciation assessment failed: {e!s}") from e
    finally:
        for p in (tmp_in, tmp_wav):
            try:
                if p and os.path.isfile(p):
                    os.unlink(p)
            except OSError:
                pass
