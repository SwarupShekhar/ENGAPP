from fastapi import FastAPI
from app.api.routes import health, transcribe, analyze, pronunciation

app = FastAPI(title="EngR AI Backend", version="1.0.0")

app.include_router(health.router, prefix="/api", tags=["Health"])
app.include_router(transcribe.router, prefix="/api", tags=["Transcribe"])
app.include_router(analyze.router, prefix="/api", tags=["Analyze"])
app.include_router(pronunciation.router, prefix="/api", tags=["Pronunciation"])

@app.get("/")
async def root():
    return {"message": "EngR AI Backend is running"}
