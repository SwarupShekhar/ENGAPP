from fastapi import APIRouter

router = APIRouter()

@router.post("/analyze")
async def analyze_transcript():
    return {"message": "Analysis endpoint stub"}
