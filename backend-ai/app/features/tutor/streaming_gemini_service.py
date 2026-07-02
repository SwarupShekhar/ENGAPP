"""Backward-compatible re-export — implementation lives in llm/streaming_gemini.py."""
from app.features.tutor.llm.streaming_gemini import StreamingGeminiService

__all__ = ["StreamingGeminiService"]
