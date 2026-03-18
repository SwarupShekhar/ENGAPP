import os
import httpx
import aiofiles
from urllib.parse import urlparse
from typing import Tuple
import tempfile
import asyncio
from azure.storage.blob import BlobServiceClient
from azure.core.exceptions import ResourceNotFoundError, ClientAuthenticationError
from app.core.config import settings
from app.core.logger import logger


def _is_azure_blob_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        return parsed.scheme in ("http", "https") and parsed.netloc.endswith(".blob.core.windows.net")
    except Exception:
        return False


def _azure_blob_parts(url: str) -> Tuple[str, str, str]:
    parsed = urlparse(url)
    account = parsed.netloc.split(".")[0]
    path = (parsed.path or "").lstrip("/")
    container, _, blob_path = path.partition("/")
    return account, container, blob_path


def _get_azure_blob_client(url: str):
    account_from_url, container, blob_path = _azure_blob_parts(url)
    if not container or not blob_path:
        raise ValueError("Invalid Azure Blob URL (missing container/blob path)")

    account_name = (
        os.getenv("AZURE_STORAGE_ACCOUNT_NAME")
        or os.getenv("LIVEKIT_EGRESS_AZURE_ACCOUNT_NAME")
        or account_from_url
    )
    account_key = (
        os.getenv("AZURE_STORAGE_ACCOUNT_KEY")
        or os.getenv("LIVEKIT_EGRESS_AZURE_ACCOUNT_KEY")
        or ""
    )

    if account_key:
        account_url = f"https://{account_name}.blob.core.windows.net"
        bsc = BlobServiceClient(account_url=account_url, credential=account_key)
    elif settings.azure_storage_connection_string:
        bsc = BlobServiceClient.from_connection_string(settings.azure_storage_connection_string)
    else:
        raise ClientAuthenticationError(
            "Azure blob download requires AZURE_STORAGE_ACCOUNT_KEY or azure_storage_connection_string"
        )

    return bsc.get_blob_client(container=container, blob=blob_path)


def _azure_download_to_path_sync(url: str, target_path: str) -> None:
    blob = _get_azure_blob_client(url)
    downloader = blob.download_blob()
    with open(target_path, "wb") as f:
        for chunk in downloader.chunks():
            f.write(chunk)


async def _azure_download_to_path(url: str, target_path: str) -> None:
    await asyncio.to_thread(_azure_download_to_path_sync, url, target_path)

async def validate_audio_url(url: str) -> Tuple[bool, str]:
    """
    Validate audio file metadata before downloading.
    Checks for size, content type, etc.
    """
    if _is_azure_blob_url(url):
        return True, ""

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
            
    except (httpx.RequestError, httpx.TimeoutException) as e:
        logger.error("audio_validation_failed", url=url[:100], error=str(e), exc_info=True)
        # Fallback to true if validation fails due to network (let download attempt decide)
        return True, ""
    except Exception as e:
        # Non-recoverable errors should fail validation
        logger.error("audio_validation_failed", url=url[:100], error=str(e), exc_info=True)
        return False, str(e)

async def download_audio_streamed(url: str, target_path: str):
    """Download audio using streaming to save memory."""
    if _is_azure_blob_url(url):
        try:
            await _azure_download_to_path(url, target_path)
            return
        except (ResourceNotFoundError, ClientAuthenticationError) as e:
            logger.error("azure_blob_download_failed", url=url[:200], error=str(e), exc_info=True)
            raise
        except Exception as e:
            logger.error("azure_blob_download_failed", url=url[:200], error=str(e), exc_info=True)
            raise

    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream("GET", url) as response:
            response.raise_for_status()
            try:
                async with aiofiles.open(target_path, "wb") as f:
                    async for chunk in response.aiter_bytes():
                        await f.write(chunk)
            except Exception:
                # Cleanup partial file on failure (after file handle is closed)
                if os.path.exists(target_path):
                    os.remove(target_path)
                raise

async def stream_audio_content(url: str):
    """Yield audio content chunks directly from URL."""
    # Sanitize URL - strip query params and fragment for logging
    parsed = urlparse(url)
    sanitized_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
    logger.info("streaming_audio", url=sanitized_url[:200])

    if _is_azure_blob_url(url):
        fd, tmp_path = tempfile.mkstemp(suffix=os.path.splitext(parsed.path)[1] or ".bin")
        os.close(fd)
        try:
            await _azure_download_to_path(url, tmp_path)
            async with aiofiles.open(tmp_path, "rb") as f:
                while True:
                    chunk = await f.read(64 * 1024)
                    if not chunk:
                        break
                    yield chunk
            return
        finally:
            try:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
            except OSError:
                pass
    
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
