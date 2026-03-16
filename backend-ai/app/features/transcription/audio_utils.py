import os
import httpx
import aiofiles
from urllib.parse import urlparse
from urllib.error import URLError
import socket
from typing import Tuple
from app.core.config import settings
from app.core.logging import logger

async def validate_audio_url(url: str) -> Tuple[bool, str]:
    """
    Validate audio file metadata before downloading.
    Checks for size, content type, etc.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            # Only head request to check size/type
            response = await client.head(url)
            
            # If HEAD fails (e.g. 403 from some storage), try GET with stream=True
            if response.status_code >= 400:
                logger.warning("head_request_failed", url=url, status=response.status_code)
                response = await client.get(url)
                
            response.raise_for_status()
            
            # 1. Content Type Check
            content_type = response.headers.get("content-type", "")
            valid_types = settings.supported_audio_formats
            if isinstance(valid_types, str):
                valid_types = [t.strip() for t in valid_types.split(",") if t.strip()]
            if not any(t in content_type for t in valid_types if t):
                 logger.warning("invalid_audio_type", url=url, content_type=content_type)
                 return False, f"Unsupported audio format: {content_type}"
            
            # 2. Size Check
            content_length = int(response.headers.get("content-length", 0))
            if content_length > settings.max_audio_size_mb * 1024 * 1024:
                return False, f"Audio file too large: {content_length / 1024 / 1024:.1f}MB"
                
            return True, ""
            
    except (httpx.RequestError, URLError, socket.timeout) as e:
        logger.error("audio_validation_failed", url=url[:100], error=str(e), exc_info=True)
        # Fallback to true if validation fails due to network (let download attempt decide)
        return True, ""
    except Exception as e:
        # Non-recoverable errors should fail validation
        logger.error("audio_validation_failed", url=url[:100], error=str(e), exc_info=True)
        return False, str(e)

async def download_audio_streamed(url: str, target_path: str):
    """Download audio using streaming to save memory."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream("GET", url) as response:
            response.raise_for_status()
            async with aiofiles.open(target_path, "wb") as f:
                try:
                    async for chunk in response.aiter_bytes():
                        await f.write(chunk)
                except Exception:
                    # Cleanup partial file on failure
                    if os.path.exists(target_path):
                        os.remove(target_path)
                    raise

async def stream_audio_content(url: str):
    """Yield audio content chunks directly from URL."""
    # Sanitize URL - strip query params and fragment for logging
    parsed = urlparse(url)
    sanitized_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
    logger.info("streaming_audio", url=sanitized_url[:200])
    
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        async with client.stream("GET", url) as response:
            if response.status_code >= 400:
                body = await response.aread()
                # Truncate body to safe length and redact sensitive data
                body_str = body.decode('utf-8', errors='replace')[:200]
                logger.error("stream_audio_failed", status=response.status_code, body=body_str)
            response.raise_for_status()
            async for chunk in response.aiter_bytes():
                yield chunk
