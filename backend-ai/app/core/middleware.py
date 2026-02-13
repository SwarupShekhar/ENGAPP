import time
import uuid
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from app.core.logging import logger

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
            structlog_logger.error(
                "request_failed",
                method=request.method,
                path=request.url.path,
                error=str(e),
                duration=process_time,
            )
            raise e
