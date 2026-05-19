import json
import re

import google.generativeai as genai
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.logger import logger

router = APIRouter(prefix="/api/practice", tags=["practice"])


class JudgeRequest(BaseModel):
    original_error: str
    target: str
    spoken: str
    kind: str  # "grammar" | "vocabulary"


class JudgeResponse(BaseModel):
    pass_: bool = Field(alias="pass")
    reason: str

    model_config = {"populate_by_name": True}


async def _simple_completion(prompt: str) -> str:
    genai.configure(api_key=settings.google_api_key)
    model = genai.GenerativeModel("gemini-2.0-flash")
    response = await model.generate_content_async(prompt)
    return (response.text or "").strip()


@router.post("/judge", response_model=JudgeResponse)
async def judge_correction(req: JudgeRequest) -> JudgeResponse:
    prompt = (
        "You judge whether a learner fixed a specific English mistake when speaking.\n"
        f"Original mistake: \"{req.original_error}\"\n"
        f"Target correction: \"{req.target}\"\n"
        f"What the learner just said: \"{req.spoken}\"\n"
        "Pass if the learner's sentence fixes the target error and is grammatical, "
        "even if wording differs (paraphrase is fine). Fail if the same error is "
        "still present or speech is empty/unrelated.\n"
        'Reply with strict JSON: {"pass": true|false, "reason": "<short>"}'
    )
    try:
        raw = await _simple_completion(prompt)
        m = re.search(r"\{.*\}", raw, re.S)
        if not m:
            return JudgeResponse(pass_=False, reason="judge_error")
        data = json.loads(m.group(0))
        if str(data.get("reason", "")).lower() == "unparseable":
            return JudgeResponse(pass_=False, reason="judge_error")
        return JudgeResponse(pass_=bool(data.get("pass")), reason=str(data.get("reason", "")))
    except Exception as e:
        logger.error(f"practice/judge failed: {e}")
        return JudgeResponse(pass_=False, reason="judge_error")
