"""
Pronunciation Assessment API.
- POST /pronunciation/assess — run Azure Pronunciation Assessment (optional) + phoneme detector.
  Body: multipart audio + optional reference_text, or JSON { "azure_result": {...} }.
"""
from __future__ import annotations

import logging
import os
import tempfile
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, Request

from app.features.pronunciation.pronunciation_detector import detect_from_azure_result
from app.features.pronunciation.pronunciation_scorer import calculate_pronunciation_score

logger = logging.getLogger(__name__)


def _compute_word_accuracy_average(azure_result: dict[str, Any]) -> float:
    """Average of all word-level AccuracyScore values from the Azure PA result. Default 100 if none."""
    words: list[dict] = []
    if "Nbests" in azure_result and azure_result["Nbests"]:
        first = azure_result["Nbests"][0]
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


def _run_azure_pronunciation_assessment(
    audio_path: str,
    reference_text: str | None,
) -> dict[str, Any]:
    """Run Azure Pronunciation Assessment with enable_miscue=True; return raw result dict."""
    try:
        import azure.cognitiveservices.speech as speechsdk
    except ImportError:
        raise HTTPException(503, "Azure Speech SDK not installed")

    if not AZURE_SPEECH_KEY:
        raise HTTPException(503, "AZURE_SPEECH_KEY not set")

    speech_config = speechsdk.SpeechConfig(subscription=AZURE_SPEECH_KEY, region=AZURE_SPEECH_REGION)
    speech_config.speech_recognition_language = "en-US"

    audio_config = speechsdk.audio.AudioConfig(filename=audio_path)
    recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config, audio_config=audio_config)

    # Reference text: required for PA. Tutor = known script; P2P free speech may use first-pass transcript as ref in Phase 2.
    ref = (reference_text or "").strip() or "hello"
    pa_config = speechsdk.PronunciationAssessmentConfig(
        reference_text=ref,
        grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
        granularity=speechsdk.PronunciationAssessmentGranularity.Phoneme,
        enable_miscue=True,
    )
    pa_config.apply_to(recognizer)

    try:
        result = recognizer.recognize_once()
    except Exception as e:
        logger.warning("Azure PA recognize_once failed: %s", e)
        return {"Words": [], "error": str(e)}

    # Parse PronunciationAssessmentResult into Words with AccuracyScore for detector
    words: list[dict] = []
    if result.reason == speechsdk.ResultReason.RecognizedSpeech and result.properties:
        import json as _json
        try:
            detail = result.properties.get(speechsdk.PropertyId.SpeechServiceResponse_JsonResult)
            if detail:
                data = _json.loads(detail)
                # Azure returns NBest[0].Words with AccuracyScore, ErrorType, etc.
                nbests = data.get("NBest") or data.get("nbest") or []
                if nbests:
                    words = nbests[0].get("Words") or nbests[0].get("words") or []
                return {"Nbests": [{"Words": words}], "Words": words}
        except Exception as e:
            logger.debug("Parse Azure PA JSON: %s", e)
    return {"Words": [{"Word": result.text or "", "AccuracyScore": 50}], "Nbests": [{"Words": words}]}


@router.post("/assess")
async def assess_pronunciation(
    request: Request,
    audio: UploadFile | None = File(None),
    reference_text: str | None = Form(None),
    azure_result: str | None = Form(None),
):
    """
    POST /pronunciation/assess
    Accepts EITHER:
    1. Multipart Form Data: `audio` (file) and `reference_text`
    2. JSON Body: `{"audio_base64": "...", "reference_text": "..."}` or `{"azure_result": {...}}`
    """
    content_type = request.headers.get("content-type", "")
    is_json = "application/json" in content_type.lower()
    
    _audio_base64 = None
    _reference_text = reference_text
    _azure_result = azure_result

    if is_json:
        try:
            body = await request.json()
            if "azure_result" in body:
                _azure_result = body["azure_result"]
            _audio_base64 = body.get("audio_base64")
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
        score_result = calculate_pronunciation_score(errors, azure_avg)
        return {"flagged_errors": errors, "pronunciation_score": score_result}

    # Limit audio size to 10MB to prevent resource exhaustion
    MAX_AUDIO_SIZE_BYTES = 10 * 1024 * 1024

    if not audio and not _audio_base64:
        raise HTTPException(400, "Provide audio file or JSON body with audio_base64")

    if audio and audio.filename:
        # Check size if available in headers, otherwise read in chunks or after read
        content = await audio.read()
        if len(content) > MAX_AUDIO_SIZE_BYTES:
            raise HTTPException(413, "Audio file too large (max 10MB)")
    elif _audio_base64:
        # Check base64 length (approximate byte size is 3/4 of base64 length)
        if len(_audio_base64) > (MAX_AUDIO_SIZE_BYTES * 4 / 3):
            raise HTTPException(413, "Audio base64 payload too large (max 10MB)")
            
        import base64
        try:
            content = base64.b64decode(_audio_base64)
        except Exception as e:
            logger.warning("Invalid base64 audio: %s", e)
            raise HTTPException(400, "Invalid audio_base64") from e
    else:
        raise HTTPException(400, "No audio provided")

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
            logger.info("Converted audio to WAV: %s", tmp_wav)
        except Exception as e:
            logger.error("Failed to convert audio via pydub: %s", e)
            # Client usually sends m4a (Expo). pydub needs ffmpeg for m4a.
            raise HTTPException(
                503,
                "Audio conversion failed. Install ffmpeg (e.g. brew install ffmpeg) for m4a support: " + str(e),
            ) from e

        if not wav_ready or not os.path.isfile(tmp_wav) or os.path.getsize(tmp_wav) == 0:
            raise HTTPException(400, "Could not produce valid WAV from audio")

        try:
            import azure.cognitiveservices.speech as speechsdk
            pass_1_transcript = _clean_reference_text(_reference_text or "")
            if pass_1_transcript and pass_1_transcript != "hello":
                logger.info("Using cleaned reference_text for Pass 2: %.60s...", pass_1_transcript)
            else:
                if not AZURE_SPEECH_KEY:
                    logger.error("AZURE_SPEECH_KEY not set; cannot run Pass 1 STT")
                    raise HTTPException(503, "Pronunciation assessment not configured (AZURE_SPEECH_KEY)")
                speech_config = speechsdk.SpeechConfig(subscription=AZURE_SPEECH_KEY, region=AZURE_SPEECH_REGION)
                audio_config = speechsdk.audio.AudioConfig(filename=tmp_wav)
                recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config, audio_config=audio_config)
                stt_result = recognizer.recognize_once()
                if stt_result.reason == speechsdk.ResultReason.RecognizedSpeech and (stt_result.text or "").strip():
                    pass_1_transcript = _clean_reference_text(stt_result.text or "")
                    logger.info("Pass 1 (STT) transcript: %s", pass_1_transcript)
                else:
                    pass_1_transcript = "hello"
                    logger.warning("Pass 1 STT failed or empty; using fallback 'hello'")

            pass_2_result = _run_azure_pronunciation_assessment(tmp_wav, pass_1_transcript)
            if pass_2_result.get("error"):
                logger.warning("Azure PA returned error: %s", pass_2_result.get("error"))
            detector_reference = pass_1_transcript
            errors = detect_from_azure_result(pass_2_result, reference_text=detector_reference)
            azure_avg = _compute_word_accuracy_average(pass_2_result)
            score_result = calculate_pronunciation_score(errors, azure_avg)
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
