"""
Application configuration using Pydantic Settings.
Loads from environment variables and .env file.
"""
from typing import List, Optional, Any
from pydantic import field_validator, model_validator, ConfigDict
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings using Pydantic V2."""
    
    model_config = ConfigDict(
        env_file=(".env", "backend-ai/.env"),
        case_sensitive=False,
        extra="ignore"
    )
    
    # Application
    app_name: str = "englivo-ai-engine"
    environment: str = "development"
    debug: bool = False
    log_level: str = "INFO"
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8001
    workers: int = 4
    reload: bool = False
    
    # API Keys
    openai_api_key: Optional[str] = None
    google_api_key: Optional[str] = None
    google_tts_api_key: Optional[str] = None
    # Gemini TTS (generativelanguage.googleapis.com) — Maya fallback when Inworld fails
    google_tts_model: str = "gemini-2.5-flash-tts"
    google_tts_voice: str = "Kore"
    google_tts_prompt: str = (
        "Say the following in a calm, clear, neutral English voice suitable for a language tutor. "
        "Speak at a steady, natural pace without being overly expressive."
    )
    # Maya streaming tutor + analysis (gemini-2.0-flash-lite retired for new API keys)
    google_gemini_chat_model: str = "gemini-2.0-flash"
    anthropic_api_key: Optional[str] = None
    
    # Azure
    azure_speech_key: Optional[str] = None
    azure_speech_region: str = "eastus"
    azure_storage_connection_string: Optional[str] = None
    azure_storage_container: str = "audio-files"

    # Deepgram
    deepgram_api_key: Optional[str] = None
    deepgram_model: str = "nova-3"
    deepgram_language: str = "en-IN"
    # When true and Deepgram is configured, run Nova-3 alongside Azure for a secondary
    # display transcript. Azure stays authoritative for pronunciation / PA alignment.
    deepgram_secondary_transcript: bool = True
    # When true, use Deepgram Nova-3 as primary STT (bypasses Azure ~2000ms → ~300ms).
    # Azure is still used for pronunciation assessment (PA) — only plain transcription is rerouted.
    deepgram_primary_stt: bool = False
    
    # Inworld AI
    inworld_api_key: Optional[str] = None
    inworld_workspace: Optional[str] = None
    inworld_scene: Optional[str] = None
    inworld_character_id: Optional[str] = "Abby"
    inworld_jwt_key: Optional[str] = None
    inworld_jwt_secret: Optional[str] = None
    inworld_enabled: bool = False
    
    # Database
    database_url: str = "postgresql+asyncpg://user:password@localhost:5432/englivo"
    db_pool_size: int = 20
    db_max_overflow: int = 10
    
    # Redis
    redis_url: str = "redis://localhost:6379/0"
    redis_cache_ttl: int = 3600
    redis_max_connections: int = 50
    
    # Celery
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"
    celery_task_track_started: bool = True
    celery_task_time_limit: int = 300
    
    # Caching
    enable_cache: bool = True
    cache_ttl_transcription: int = 86400
    cache_ttl_analysis: int = 3600
    cache_ttl_pronunciation: int = 7200
    disk_cache_dir: str = "/tmp/englivo-cache"
    disk_cache_size_limit: int = 10 * 1024 * 1024 * 1024  # 10GB
    
    # Model Configuration
    # Primary STT for pronunciation-aligned flows remains Azure unless explicitly overridden.
    # Optional: use Deepgram Nova-3 as a secondary transcript (see deepgram_secondary_transcript).
    transcription_model: str = "azure"
    analysis_model: str = "gemini"
    pronunciation_model: str = "azure"
    cefr_model: str = "huggingface"
    tts_provider: str = "inworld"  # "azure" or "inworld"
    disable_azure_tts: bool = False
    
    # Feature Flags
    enable_pronunciation_scoring: bool = True
    enable_cefr_classification: bool = True
    enable_error_tagging: bool = True
    enable_cross_session_analysis: bool = True
    enable_feature_extraction: bool = True
    
    # Rate Limiting
    rate_limit_per_minute: int = 60
    rate_limit_per_hour: int = 1000

    # Tutor streaming: pronunciation enrichment (Phase 2.1)
    # Max ms to wait for PA before starting Gemini (0 = never wait, stream immediately).
    pa_stream_wait_ms: int = 0
    # Max concurrent Azure PA enrichments process-wide (protects single-node Vultr).
    pa_enrich_max_concurrent: int = 8
    
    # Monitoring
    sentry_dsn: Optional[str] = None
    enable_prometheus: bool = True
    prometheus_port: int = 9090
    
    # Audio Processing
    max_audio_size_mb: int = 50
    supported_audio_formats: List[str] = ["wav", "mp3", "m4a", "ogg", "flac", "webm"]
    audio_sample_rate: int = 16000
    
    # CEFR Thresholds
    cefr_a1_max_score: int = 30
    cefr_a2_max_score: int = 45
    cefr_b1_max_score: int = 60
    cefr_b2_max_score: int = 75
    cefr_c1_max_score: int = 90
    
    # Security
    api_key_header: str = "X-API-Key"
    internal_api_key: str = "change-me-in-production"
    cors_origins: List[str] = ["http://localhost:3000", "http://localhost:3001"]
    
    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> List[str]:
        """Parse CORS origins from comma-separated string."""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v
    
    @field_validator("supported_audio_formats", mode="before")
    @classmethod
    def parse_audio_formats(cls, v: Any) -> List[str]:
        """Parse supported audio formats from comma-separated string."""
        if isinstance(v, str):
            return [fmt.strip() for fmt in v.split(",") if fmt.strip()]
        return v

    @model_validator(mode="after")
    def reject_default_api_key_in_prod(self) -> "Settings":
        if self.environment not in ("development", "dev", "local", "test") and \
                self.internal_api_key == "change-me-in-production":
            raise ValueError(
                "internal_api_key must be changed from the default in production. "
                "Set INTERNAL_API_KEY in your .env file."
            )
        return self


# Global settings instance
settings = Settings()
