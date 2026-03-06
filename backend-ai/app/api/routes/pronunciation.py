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

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.services.pronunciation_detector import detect_from_azure_result
from app.services.pronunciation_scorer import calculate_pronunciation_score

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
    audio: UploadFile | None = File(None),
    reference_text: str | None = Form(None),
    azure_result: str | None = Form(None),  # JSON string if client sends precomputed Azure result
):
    """
    POST /pronunciation/assess
    - If body is JSON with "azure_result": run detector only and return flagged errors.
    - If multipart with audio file: run Azure Pronunciation Assessment then detector (reference_text optional for tutor).
    """
    # JSON-only: { "azure_result": { ... } }
    if azure_result:
        try:
            import json as _json
            data = _json.loads(azure_result)
        except Exception as e:
            raise HTTPException(400, f"Invalid azure_result JSON: {e}")
        raw = data.get("azure_result") or data
        errors = detect_from_azure_result(raw)
        azure_avg = _compute_word_accuracy_average(raw)
        score_result = calculate_pronunciation_score(errors, azure_avg)
        return {"flagged_errors": errors, "pronunciation_score": score_result}

    if not audio or not audio.filename:
        raise HTTPException(400, "Provide audio file or JSON body with azure_result")

    # Create a temp file path but don't keep it open
    content = await audio.read()
    fd, tmp_path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    
    try:
        import io
        from pydub import AudioSegment
        audio_segment = AudioSegment.from_file(io.BytesIO(content))
        # Azure Pronunciation Assessment prefers 16kHz, 16-bit, Mono PCM
        audio_segment = audio_segment.set_frame_rate(16000).set_channels(1).set_sample_width(2)
        audio_segment.export(tmp_path, format="wav")
        logger.info(f"Converted audio to WAV: {tmp_path}")
    except Exception as e:
        logger.error(f"Failed to convert audio via pydub: {e}")
        # Fallback to writing original content (might still fail in Azure if not WAV)
        with open(tmp_path, "wb") as f:
            f.write(content)

    try:
        # Fix C: Two-pass — use client reference_text when provided (e.g. test_01 "water"), else Pass 1 STT then Pass 2 PA
        import azure.cognitiveservices.speech as speechsdk
        pass_1_transcript = (reference_text or "").strip()
        if pass_1_transcript:
            logger.info(f"Using client reference_text for Pass 2: {pass_1_transcript[:60]}...")
        else:
            speech_config = speechsdk.SpeechConfig(subscription=AZURE_SPEECH_KEY, region=AZURE_SPEECH_REGION)
            audio_config = speechsdk.audio.AudioConfig(filename=tmp_path)
            recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config, audio_config=audio_config)
            stt_result = recognizer.recognize_once()
            if stt_result.reason == speechsdk.ResultReason.RecognizedSpeech and (stt_result.text or "").strip():
                pass_1_transcript = (stt_result.text or "").strip()
                logger.info(f"Pass 1 (STT) transcript: {pass_1_transcript}")
            else:
                pass_1_transcript = "hello"
                logger.warning("Pass 1 STT failed or empty; using fallback 'hello'")

        pass_2_result = _run_azure_pronunciation_assessment(tmp_path, pass_1_transcript or "hello")
        # Pass original client reference_text to detector when provided (e.g. "I vision a better future");
        # else STT transcript. Avoids "bijan" in reference_words when client sent "vision".
        detector_reference = (reference_text or "").strip() or pass_1_transcript or ""
        errors = detect_from_azure_result(pass_2_result, reference_text=detector_reference)
        azure_avg = _compute_word_accuracy_average(pass_2_result)
        score_result = calculate_pronunciation_score(errors, azure_avg)
        return {
            "flagged_errors": errors,
            "pronunciation_score": score_result,
            "azure_result": pass_2_result,
        }
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
