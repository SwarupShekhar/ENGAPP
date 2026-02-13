import os
import httpx
from typing import Tuple
from app.core.config import settings
from app.core.logging import logger

async def validate_audio_url(url: str) -> Tuple[bool, str]:
    """
    Validate audio file metadata before downloading.
    Checks for size, content type, etc.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Only head request to check size/type
            response = await client.head(url)
            
            # If HEAD fails (e.g. 403 from some storage), try GET with stream=True
            if response.status_code >= 400:
                response = await client.get(url, follow_redirects=True)
                
            response.raise_for_status()
            
            # 1. Content Type Check
            content_type = response.headers.get("content-type", "")
            valid_types = settings.supported_audio_formats.split(",")
            if not any(t in content_type for t in valid_types if t):
                 logger.warning("invalid_audio_type", url=url, content_type=content_type)
            
            # 2. Size Check
            content_length = int(response.headers.get("content-length", 0))
            if content_length > settings.max_audio_size_mb * 1024 * 1024:
                return False, f"Audio file too large: {content_length / 1024 / 1024:.1f}MB"
                
            return True, ""
            
    except Exception as e:
        logger.error("audio_validation_failed", url=url, error=str(e))
        # Fallback to true if validation fails due to network (let download attempt decide)
        return True, ""

async def download_audio_streamed(url: str, target_path: str):
    """Download audio using streaming to save memory."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream("GET", url) as response:
            response.raise_for_status()
            with open(target_path, "wb") as f:
                async for chunk in response.aiter_bytes():
                    f.write(chunk)

async def stream_audio_content(url: str):
    """Yield audio content chunks directly from URL."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream("GET", url) as response:
            response.raise_for_status()
            async for chunk in response.aiter_bytes():
                yield chunk
