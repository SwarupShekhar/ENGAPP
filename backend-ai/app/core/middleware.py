import time
import uuid
from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from app.core.logging import logger
from app.core.config import settings

class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        
        # Add to request state so it can be accessed in routes/services
        request.state.request_id = request_id
        
        # Create a logger with context
        structlog_logger = logger.bind(request_id=request_id)
        request.state.logger = structlog_logger
        
        start_time = time.time()
        
        structlog_logger.info(
            "request_started",
            method=request.method,
            path=request.url.path,
        )
        
        try:
            response = await call_next(request)
            
            process_time = time.time() - start_time
            response.headers["X-Request-ID"] = request_id
            response.headers["X-Process-Time"] = str(process_time)
            
            structlog_logger.info(
                "request_finished",
                method=request.method,
                path=request.url.path,
                status_code=response.status_code,
                duration=process_time,
            )
            
            return response
            
        except Exception as e:
            process_time = time.time() - start_time
            
            # DEBUG: Write to file
            try:
                import traceback
                with open("middleware_error.log", "a") as f:
                    f.write(f"\n--- MIDDLEWARE ERROR at {time.time()} ---\n")
                    f.write(f"Path: {request.url.path}\n")
                    f.write(f"Error: {str(e)}\n")
                    f.write(traceback.format_exc())
            except:
                pass

            structlog_logger.error(
                "request_failed",
                method=request.method,
                path=request.url.path,
                error=str(e),
                duration=process_time,
            )
            # Do NOT raise, verify if we can return JSON response here?
            # Re-raising should trigger global handler.
            raise e
class APIKeyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Skip API key check for health and docs
        if request.url.path in ["/api/health", "/docs", "/openapi.json", "/metrics", "/"]:
            return await call_next(request)
        
        api_key = request.headers.get(settings.api_key_header)
        if not api_key or api_key != settings.internal_api_key:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={
                    "success": False,
                    "error": {
                        "code": "UNAUTHORIZED",
                        "message": "Invalid or missing API Key"
                    }
                }
            )
        
        return await call_next(request)
