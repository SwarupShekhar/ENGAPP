"""
Application configuration using Pydantic Settings.
Loads from environment variables and .env file.
"""
from typing import List, Optional, Any
from pydantic import Field, field_validator, ConfigDict
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings using Pydantic V2."""
    
    model_config = ConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore"
    )
    
    # Application
    app_name: str = "engR-ai-engine"
    environment: str = "development"
    debug: bool = True
    log_level: str = "INFO"
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8001
    workers: int = 4
    reload: bool = False
    
    # API Keys
    openai_api_key: Optional[str] = None
    google_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    
    # Azure
    azure_speech_key: Optional[str] = None
    azure_speech_region: str = "eastus"
    azure_storage_connection_string: Optional[str] = None
    azure_storage_container: str = "audio-files"
    
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
    transcription_model: str = "azure"
    analysis_model: str = "gemini"
    pronunciation_model: str = "azure"
    cefr_model: str = "huggingface"
    
    # Feature Flags
    enable_pronunciation_scoring: bool = True
    enable_cefr_classification: bool = True
    enable_error_tagging: bool = True
    enable_cross_session_analysis: bool = True
    enable_feature_extraction: bool = True
    
    # Rate Limiting
    rate_limit_per_minute: int = 60
    rate_limit_per_hour: int = 1000
    
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


# Global settings instance
settings = Settings()
