import time
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from prometheus_client import make_asgi_app

from app.core.config import settings
from app.core.logging import configure_logging, logger
from app.core.middleware import RequestIDMiddleware
from app.cache.manager import cache
from app.api.routes import health, transcribe, analyze, pronunciation
from app.utils.async_azure_speech import shutdown_executor
from app.models.response import StandardResponse, ErrorResponse, Meta

# 1. Initialize Sentry
if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        integrations=[FastApiIntegration()],
        environment=settings.environment,
        traces_sample_rate=0.1 if settings.environment == "production" else 1.0,
    )

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    configure_logging()
    logger.info("application_startup", app_name=settings.app_name)
    
    await cache.initialize()
    
    yield
    
    # Shutdown
    logger.info("application_shutdown")
    await cache.close()
    await shutdown_executor()

app = FastAPI(
    title="EngR AI Backend", 
    version="1.1.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url=None,
    debug=False  # MUST be False so custom exception handlers work correctly
)

# 2. Middleware Stack (Order matters: Bottom-up execution)
app.add_middleware(RequestIDMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Global Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_msg = str(exc)
    logger.error("unhandled_exception", error=error_msg, error_type=type(exc).__name__, path=request.url.path)
    
    # Provide a more specific message for HTTP errors (e.g., audio download failures)
    message = "An unexpected error occurred"
    if "HTTPStatusError" in type(exc).__name__:
        message = f"Failed to fetch remote resource: {error_msg[:200]}"
    elif "ConnectError" in type(exc).__name__:
        message = f"Could not connect to remote service: {error_msg[:200]}"
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=StandardResponse(
            success=False,
            error=ErrorResponse(
                code="INTERNAL_SERVER_ERROR",
                message=message
            ),
            meta=Meta(
                request_id=getattr(request.state, "request_id", None)
            )
        ).model_dump()
    )

@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content=StandardResponse(
            success=False,
            error=ErrorResponse(
                code="VALIDATION_ERROR",
                message=str(exc)
            ),
            meta=Meta(
                request_id=getattr(request.state, "request_id", None)
            )
        ).model_dump()
    )

# 4. Routers
from app.api.routes import health, transcribe, analyze, pronunciation, tutor
# ...
app.include_router(health.router, prefix="/api", tags=["Health"])
app.include_router(transcribe.router, prefix="/api", tags=["Transcribe"])
app.include_router(analyze.router, prefix="/api", tags=["Analyze"])
app.include_router(pronunciation.router, prefix="/api", tags=["Pronunciation"])
app.include_router(tutor.router, prefix="/api/tutor", tags=["Tutor"])

# 5. Monitoring
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)

@app.get("/")
async def root():
    return {"status": "running", "version": "1.1.0"}
