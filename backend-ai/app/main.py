import time
from dotenv import load_dotenv

# Load env vars explicitly before importing settings / telemetry
load_dotenv()

from app.telemetry import configure as configure_otel, instrument_fastapi

configure_otel()

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, Response
from contextlib import asynccontextmanager
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from app.core.config import settings
from app.core.logger import configure_logging, logger
from app.core.middleware import RequestIDMiddleware
from app.security.internal_auth import require_internal_api_key
from app.cache.manager import cache
from app.features.transcription.async_azure_speech import shutdown_executor
from app.features.transcription.deepgram_service import deepgram_transcription_service
from app.middleware.rate_limiter import rate_limiter
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
    stt_primary = (
        "deepgram"
        if settings.deepgram_primary_stt and deepgram_transcription_service.configured
        else "azure"
    )
    cerebras_configured = bool((settings.cerebras_api_key or "").strip())
    logger.info(
        "stt_configuration",
        stt_primary=stt_primary,
        deepgram_primary_stt=settings.deepgram_primary_stt,
        deepgram_secondary_transcript=settings.deepgram_secondary_transcript,
        azure_speech_configured=bool(settings.azure_speech_key and settings.azure_speech_region),
        deepgram_configured=deepgram_transcription_service.configured,
    )
    logger.info(
        "maya_llm_configuration",
        maya_llm_provider=settings.maya_llm_provider,
        cerebras_configured=cerebras_configured,
        text_llm_expected=(
            "cerebras"
            if cerebras_configured
            and (settings.maya_llm_provider or "auto").strip().lower() in ("auto", "cerebras")
            else "gemini"
        ),
        coaching_hint_budget_ms=settings.coaching_hint_budget_ms,
        coaching_next_turn_only=True,
    )

    await cache.initialize()
    rate_limiter.start_cleanup_task()

    yield

    # Shutdown
    logger.info("application_shutdown")
    await rate_limiter.stop_cleanup_task()
    await cache.close()
    await shutdown_executor()


app = FastAPI(
    title="EngR AI Backend",
    version="1.1.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url=None,
    debug=False,  # MUST be False so custom exception handlers work correctly
)

instrument_fastapi(app)

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


@app.middleware("http")
async def internal_api_key_middleware(request: Request, call_next):
    await require_internal_api_key(request)
    return await call_next(request)


# 3. Global Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_msg = str(exc)
    logger.error(
        "unhandled_exception",
        error=error_msg,
        error_type=type(exc).__name__,
        path=request.url.path,
    )

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
            error=ErrorResponse(code="INTERNAL_SERVER_ERROR", message=message),
            meta=Meta(
                request_id=getattr(request.state, "request_id", None),
                processing_time_ms=0,
            ),
        ).model_dump(),
    )


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    logger.error("value_error_validation_failed", error=str(exc), path=request.url.path)
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content=StandardResponse(
            success=False,
            error=ErrorResponse(code="VALIDATION_ERROR", message=str(exc)),
            meta=Meta(
                request_id=getattr(request.state, "request_id", None),
                processing_time_ms=0,
            ),
        ).model_dump(),
    )


# 4. Routers
from app.features.health.routes import router as health_router
from app.features.transcription.routes import router as transcribe_router
from app.features.assessment.routes import router as analyze_router
from app.features.pronunciation.routes import router as pronunciation_router
from app.features.tutor.routes import router as tutor_router
from app.features.tutor.streaming_routes import router as streaming_tutor_router
from app.features.admin.routes import router as admin_router
from app.features.scoring.routes import router as scoring_router
from app.features.tts.routes import router as tts_router
from app.features.practice.routes import router as practice_router

app.include_router(health_router, prefix="/api", tags=["Health"])
app.include_router(transcribe_router, prefix="/api", tags=["Transcribe"])
app.include_router(analyze_router, prefix="/api", tags=["Analyze"])
app.include_router(pronunciation_router, prefix="/api", tags=["Pronunciation"])
app.include_router(scoring_router, prefix="/api", tags=["Scoring"])
app.include_router(tts_router, prefix="/api", tags=["TTS"])
app.include_router(tutor_router, prefix="/api/tutor", tags=["Tutor"])
app.include_router(streaming_tutor_router, prefix="/api/tutor", tags=["Streaming"])
app.include_router(admin_router, prefix="/api/admin", tags=["Admin"])
app.include_router(practice_router)

# 5. Monitoring (Prometheus — scraped by config/prometheus/prometheus.yml)
if settings.enable_prometheus:

    @app.get("/metrics", include_in_schema=False)
    async def prometheus_metrics():
        return Response(
            content=generate_latest(),
            media_type=CONTENT_TYPE_LATEST,
        )


@app.get("/")
async def root():
    return {"status": "running", "version": "1.1.0"}
