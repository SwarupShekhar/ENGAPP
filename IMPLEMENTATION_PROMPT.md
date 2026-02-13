# Backend-AI Implementation Prompt for IDE AI Assistant

## Context
You are implementing the **Englivo AI Engine** - a production-ready FastAPI microservice that serves as the intelligence layer for an English learning platform. This service handles ALL AI/ML operations including transcription, analysis, CEFR classification, and pronunciation scoring.

## Current State
- **Skeleton exists**: FastAPI app with stub routes in `app/api/routes/` (health, transcribe, analyze, pronunciation)
- **Empty services**: `app/services/` directory exists but is empty
- **Empty utils**: `app/utils/` directory exists but is empty
- **No business logic**: All routes return placeholder responses
- **Problem**: AI logic currently lives in backend-nest (NestJS), but should be moved here

## Goal
Transform this into a **first-class AI engine** that is the proprietary intelligence brain of Englivo.

---

## Architecture Requirements

### Service Separation Principle
```
backend-nest (Orchestrator)          backend-ai (Intelligence)
├── Auth & Users                     ├── Transcription Pipeline
├── Session Management               ├── CEFR Classification
├── Matchmaking                      ├── Error Detection & Tagging
├── Data Persistence                 ├── Pronunciation Scoring
├── API Gateway                      ├── Cross-Session Analysis
└── Calls backend-ai                 └── ML Model Management
```

### Tech Stack Requirements
- **Framework**: FastAPI 0.110.0 (async/await throughout)
- **AI Providers**:
  - Azure Cognitive Services Speech (transcription + pronunciation)
  - Google Gemini Pro (text analysis)
  - Custom CEFR classifier (ML-based)
- **Caching**: 2-tier strategy (Redis + Disk cache)
- **Jobs**: Celery with Redis broker
- **Monitoring**: Prometheus metrics + Sentry error tracking
- **Logging**: Structured logging with `structlog`
- **Database**: Async PostgreSQL (shared schema with Nest)

---

## Implementation Checklist

### Phase 1: Foundation (Do First)
- [ ] Create `app/config.py` - Pydantic Settings for all config
- [ ] Create `app/utils/logging.py` - Structured logging with structlog
- [ ] Create `app/utils/cache.py` - Dual-tier caching (Redis + Disk)
- [ ] Create `app/models.py` - All Pydantic request/response models
- [ ] Update `requirements.txt` with all dependencies
- [ ] Create `.env.example` with all configuration options

### Phase 2: Core Services
- [ ] Create `app/services/transcription.py` - Azure Speech transcription
- [ ] Create `app/services/cefr_classifier.py` - ML-based CEFR classification
- [ ] Create `app/services/analysis.py` - Gemini-powered text analysis
- [ ] Create `app/services/pronunciation.py` - Azure pronunciation assessment
- [ ] Create `app/services/audio_processor.py` - Audio feature extraction
- [ ] Create `app/services/aggregation.py` - Cross-session analytics

### Phase 3: Background Jobs
- [ ] Create `app/tasks/celery_app.py` - Celery configuration
- [ ] Create `app/tasks/transcription_tasks.py` - Async transcription jobs
- [ ] Create `app/tasks/analysis_tasks.py` - Async analysis jobs
- [ ] Create `app/tasks/batch_tasks.py` - Batch processing jobs

### Phase 4: API Routes (Update Existing)
- [ ] Update `app/api/routes/transcribe.py` - Use real service
- [ ] Update `app/api/routes/analyze.py` - Use real service
- [ ] Update `app/api/routes/pronunciation.py` - Use real service
- [ ] Create `app/api/routes/batch.py` - Batch operations
- [ ] Create `app/api/routes/sessions.py` - Cross-session analysis

### Phase 5: Main Application
- [ ] Update `app/main.py` - Wire everything together
  - Lifespan events (startup/shutdown)
  - CORS middleware
  - Authentication middleware (API key from Nest)
  - Request logging middleware
  - Prometheus metrics
  - Error handling

### Phase 6: Production Readiness
- [ ] Create `app/middleware/auth.py` - API key validation
- [ ] Create `app/middleware/rate_limit.py` - Rate limiting
- [ ] Create `app/utils/metrics.py` - Prometheus metrics helpers
- [ ] Create comprehensive README.md
- [ ] Create Docker configuration
- [ ] Write tests

---

## Detailed Requirements

### 1. Configuration (`app/config.py`)

**Must include:**
```python
class Settings(BaseSettings):
    # App
    app_name: str
    environment: str  # dev, staging, prod
    debug: bool
    
    # API Keys
    azure_speech_key: str
    azure_speech_region: str
    google_api_key: str
    
    # Database
    database_url: str
    
    # Redis
    redis_url: str
    
    # Celery
    celery_broker_url: str
    celery_result_backend: str
    
    # Feature Flags
    enable_caching: bool = True
    enable_pronunciation: bool = True
    enable_cefr: bool = True
    
    # Cache TTLs
    cache_ttl_transcription: int = 86400  # 24h
    cache_ttl_analysis: int = 3600  # 1h
    cache_ttl_pronunciation: int = 7200  # 2h
    
    # CEFR Thresholds
    cefr_a1_max_score: int = 30
    cefr_a2_max_score: int = 45
    # ... etc
    
    class Config:
        env_file = ".env"
```

### 2. Models (`app/models.py`)

**Define all contracts:**
```python
# Requests
class TranscriptionRequest(BaseModel):
    audio_url: HttpUrl
    language: str = "en-US"
    user_id: str
    session_id: str
    enable_diarization: bool = False

class AnalysisRequest(BaseModel):
    text: str
    user_id: str
    session_id: str
    context: Optional[str]
    user_native_language: Optional[str]

class PronunciationRequest(BaseModel):
    audio_url: HttpUrl
    reference_text: str
    user_id: str
    language: str = "en-US"

# Responses
class TranscriptionResponse(BaseModel):
    text: str
    confidence: float
    words: List[Word]  # Word-level timing
    duration: float
    processing_time: float

class AnalysisResponse(BaseModel):
    cefr_assessment: CEFRAssessment
    errors: List[ErrorDetail]
    metrics: AnalysisMetrics
    feedback: str
    strengths: List[str]
    improvement_areas: List[str]
    recommended_tasks: List[Dict[str, Any]]
    processing_time: float

class PronunciationResponse(BaseModel):
    accuracy_score: float
    fluency_score: float
    completeness_score: float
    pronunciation_score: float
    words: List[WordPronunciation]
    common_issues: List[str]
    improvement_tips: List[str]
    processing_time: float

# Supporting Models
class CEFRLevel(str, Enum):
    A1 = "A1"
    A2 = "A2"
    B1 = "B1"
    B2 = "B2"
    C1 = "C1"
    C2 = "C2"

class ErrorType(str, Enum):
    GRAMMAR = "grammar"
    VOCABULARY = "vocabulary"
    PRONUNCIATION = "pronunciation"
    TENSE = "tense"
    ARTICLE = "article"
    # ... etc

class ErrorDetail(BaseModel):
    type: ErrorType
    severity: ErrorSeverity
    original_text: str
    corrected_text: str
    explanation: str
    suggestion: str
    rule: Optional[str]
```

### 3. Caching Strategy (`app/utils/cache.py`)

**Two-tier caching:**
1. **Redis** - Fast in-memory cache (primary)
2. **Disk Cache** - Persistent fallback (secondary)

**Requirements:**
```python
class CacheManager:
    def __init__(self):
        self.redis_client: Optional[Redis] = None
        self.disk_cache: Optional[Cache] = None
    
    async def initialize(self):
        # Connect to Redis
        # Initialize disk cache
        pass
    
    async def get(self, key: str) -> Optional[Any]:
        # Try Redis first
        # Fallback to disk
        # Auto-promote disk→Redis on hit
        pass
    
    async def set(self, key: str, value: Any, ttl: int):
        # Set in both Redis AND disk
        pass
    
    async def delete(self, key: str):
        # Delete from both
        pass

# Decorator for easy caching
@cached(prefix="transcription", ttl=86400)
async def transcribe(...):
    # Function automatically cached
    pass
```

**Key hashing:**
- Generate deterministic keys from function args
- Use MD5 hash of serialized arguments
- Include service version in key to invalidate on updates

### 4. Transcription Service (`app/services/transcription.py`)

**Requirements:**
```python
class TranscriptionService:
    def __init__(self):
        # Initialize Azure Speech SDK
        self.speech_config = speechsdk.SpeechConfig(...)
        self.speech_config.request_word_level_timestamps()
    
    async def download_audio(self, url: str) -> bytes:
        # Download from URL (S3, Azure Blob, etc.)
        pass
    
    @cached(prefix="transcription")
    async def transcribe(self, request: TranscriptionRequest) -> TranscriptionResponse:
        # 1. Download audio
        # 2. Configure recognizer
        # 3. Perform transcription
        # 4. Extract word-level timing
        # 5. Return structured response
        # Results cached for 24h
        pass
    
    async def transcribe_with_diarization(self, request) -> TranscriptionResponse:
        # Speaker diarization for multi-speaker audio
        pass
```

### 5. CEFR Classification (`app/services/cefr_classifier.py`)

**ML-based classification:**
```python
class CEFRClassifier:
    def __init__(self):
        # Load vocabulary lists by level
        # Load grammar pattern matchers
        pass
    
    def classify(self, text: str, context: Dict) -> CEFRAssessment:
        # Feature extraction:
        # - Lexical diversity (type-token ratio)
        # - Average word length
        # - Sentence complexity
        # - Advanced vocabulary usage
        # - Grammar structure complexity
        
        # Scoring algorithm:
        # - Calculate features
        # - Weight and combine
        # - Map to CEFR level (A1-C2)
        # - Calculate confidence
        
        # Return assessment with:
        # - Level
        # - Score (0-100)
        # - Confidence
        # - Strengths
        # - Weaknesses
        # - Next level requirements
        pass
```

### 6. Analysis Service (`app/services/analysis.py`)

**Gemini-powered analysis:**
```python
class AnalysisService:
    def __init__(self):
        genai.configure(api_key=settings.google_api_key)
        self.model = genai.GenerativeModel('gemini-pro')
    
    def _create_analysis_prompt(self, request: AnalysisRequest) -> str:
        # Create detailed prompt for Gemini
        # Include: text, context, native language, target level
        # Request JSON output with errors, feedback, tasks
        pass
    
    @cached(prefix="analysis")
    async def analyze(self, request: AnalysisRequest) -> AnalysisResponse:
        # 1. Get CEFR classification
        # 2. Call Gemini for error detection
        # 3. Parse AI response (JSON)
        # 4. Calculate metrics
        # 5. Generate recommendations
        # Results cached for 1h
        pass
```

### 7. Pronunciation Service (`app/services/pronunciation.py`)

**Azure pronunciation assessment:**
```python
class PronunciationService:
    def __init__(self):
        self.speech_config = speechsdk.SpeechConfig(...)
    
    @cached(prefix="pronunciation")
    async def assess(self, request: PronunciationRequest) -> PronunciationResponse:
        # 1. Download audio
        # 2. Configure pronunciation assessment
        # 3. Set reference text
        # 4. Perform assessment
        # 5. Extract phoneme-level scores
        # 6. Generate improvement tips
        # Results cached for 2h
        pass
```

### 8. Cross-Session Aggregation (`app/services/aggregation.py`)

**Analytics across sessions:**
```python
class AggregationService:
    async def analyze_user_progress(
        self,
        user_id: str,
        session_ids: List[str]
    ) -> CrossSessionAnalysis:
        # Query database for session data
        # Aggregate metrics:
        # - CEFR level trend
        # - Common error patterns
        # - Improvement rate
        # - Vocabulary growth
        # Generate recommendations
        pass
```

### 9. Main Application (`app/main.py`)

**Complete setup:**
```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting AI Engine")
    await cache_manager.initialize()
    # Initialize other connections
    
    yield
    
    # Shutdown
    logger.info("Shutting down")
    await cache_manager.close()

app = FastAPI(
    title="Englivo AI Engine",
    version="1.0.0",
    lifespan=lifespan
)

# Middleware stack (order matters!)
app.add_middleware(CORSMiddleware, ...)
app.add_middleware(GZipMiddleware, ...)

@app.middleware("http")
async def logging_middleware(request, call_next):
    # Log requests + metrics
    pass

@app.middleware("http")
async def auth_middleware(request, call_next):
    # Validate API key from Nest
    pass

# Include routers
app.include_router(health.router)
app.include_router(transcribe.router)
app.include_router(analyze.router)
app.include_router(pronunciation.router)

# Prometheus metrics
if settings.enable_prometheus:
    app.mount("/metrics", make_asgi_app())
```

### 10. Background Jobs (`app/tasks/`)

**Celery tasks for async processing:**
```python
# celery_app.py
celery = Celery(
    'englivo-ai',
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend
)

# transcription_tasks.py
@celery.task
def transcribe_async(audio_url, user_id, session_id):
    # Async transcription
    pass

# analysis_tasks.py
@celery.task
def analyze_batch(texts: List[str]):
    # Batch analysis for efficiency
    pass
```

---

## Critical Implementation Details

### Error Handling
```python
# All service methods should:
try:
    result = await service.operation()
    logger.info("Operation succeeded", **context)
    return result
except ValueError as e:
    logger.warning(f"Validation error: {e}")
    raise HTTPException(400, detail=str(e))
except Exception as e:
    logger.error(f"Operation failed: {e}", exc_info=True)
    raise HTTPException(500, detail="Service error")
```

### Logging Pattern
```python
# Use structured logging everywhere
logger.info(
    "Operation started",
    user_id=request.user_id,
    session_id=request.session_id,
    operation="transcription"
)
```

### Metrics Pattern
```python
# Track all operations
with ai_operation_duration.labels(operation="transcription").time():
    result = await transcribe()
```

### Security
- **API Key**: Validate on every request (except /health)
- **Rate Limiting**: Per-user limits
- **Input Validation**: Pydantic models for all inputs
- **URL Validation**: Whitelist domains for audio URLs

---

## Dependencies (`requirements.txt`)

```txt
# Core
fastapi==0.115.6
uvicorn[standard]==0.34.0
pydantic==2.10.4
pydantic-settings==2.7.0

# AI Services
openai==1.59.0
google-generativeai==0.8.3
azure-cognitiveservices-speech==1.42.0
azure-storage-blob==12.19.0

# Audio Processing
librosa==0.10.2.post1
soundfile==0.12.1
pydub==0.25.1

# ML/NLP
transformers==4.47.1
torch==2.5.1
nltk==3.8.1
spacy==3.7.4

# Background Jobs
celery==5.3.6
redis==5.0.1

# Database
asyncpg==0.29.0
sqlalchemy==2.0.25

# Caching
aiocache==0.12.2
diskcache==5.6.3

# HTTP
httpx==0.26.0
aiohttp==3.9.3

# Monitoring
prometheus-client==0.19.0
structlog==24.1.0
sentry-sdk[fastapi]==1.40.0

# Testing
pytest==8.0.0
pytest-asyncio==0.23.4
httpx  # for testing
```

---

## Environment Variables (`.env.example`)

```env
# Application
APP_NAME=englivo-ai-engine
ENVIRONMENT=development
DEBUG=true
LOG_LEVEL=INFO

# Server
HOST=0.0.0.0
PORT=8001
WORKERS=4

# API Keys
OPENAI_API_KEY=
GOOGLE_API_KEY=
ANTHROPIC_API_KEY=
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=eastus
AZURE_STORAGE_CONNECTION_STRING=

# Database
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/englivo

# Redis
REDIS_URL=redis://localhost:6379/0
REDIS_CACHE_TTL=3600

# Celery
CELERY_BROKER_URL=redis://localhost:6379/1
CELERY_RESULT_BACKEND=redis://localhost:6379/2

# Caching
ENABLE_CACHE=true
CACHE_TTL_TRANSCRIPTION=86400
CACHE_TTL_ANALYSIS=3600
CACHE_TTL_PRONUNCIATION=7200
DISK_CACHE_DIR=/tmp/englivo-cache

# Models
TRANSCRIPTION_MODEL=azure
ANALYSIS_MODEL=gemini
PRONUNCIATION_MODEL=azure
CEFR_MODEL=custom

# Feature Flags
ENABLE_PRONUNCIATION_SCORING=true
ENABLE_CEFR_CLASSIFICATION=true
ENABLE_ERROR_TAGGING=true

# Security
INTERNAL_API_KEY=your_secret_key_for_nest_backend
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# Monitoring
SENTRY_DSN=
ENABLE_PROMETHEUS=true

# Audio
MAX_AUDIO_SIZE_MB=50
SUPPORTED_AUDIO_FORMATS=wav,mp3,m4a,ogg,flac
AUDIO_SAMPLE_RATE=16000

# CEFR Thresholds
CEFR_A1_MAX_SCORE=30
CEFR_A2_MAX_SCORE=45
CEFR_B1_MAX_SCORE=60
CEFR_B2_MAX_SCORE=75
CEFR_C1_MAX_SCORE=90
```

---

## Testing Requirements

### Unit Tests
```python
# tests/test_cefr_classifier.py
def test_a1_classification():
    text = "I am student. I like apple."
    result = cefr_classifier.classify(text)
    assert result.level == CEFRLevel.A1
    assert result.score <= 30

# tests/test_caching.py
@pytest.mark.asyncio
async def test_cache_hit():
    # First call
    result1 = await transcribe(request)
    # Second call (should be cached)
    result2 = await transcribe(request)
    assert result1 == result2
```

### Integration Tests
```python
# tests/test_api.py
@pytest.mark.asyncio
async def test_transcription_endpoint():
    response = await client.post("/api/transcribe", json={
        "audio_url": "https://example.com/audio.wav",
        "user_id": "test_user",
        "session_id": "test_session"
    })
    assert response.status_code == 200
    assert "text" in response.json()
```

---

## Communication with backend-nest

### From Nest to AI Engine:

```typescript
// backend-nest/src/ai/ai.service.ts
async transcribeAudio(audioUrl: string, userId: string, sessionId: string) {
  const response = await this.httpService.post(
    `${AI_ENGINE_URL}/api/transcribe`,
    {
      audio_url: audioUrl,
      language: 'en-US',
      user_id: userId,
      session_id: sessionId
    },
    {
      headers: {
        'X-API-Key': process.env.AI_ENGINE_API_KEY
      }
    }
  );
  return response.data;
}
```

### API Contract:
- **Authentication**: API key in `X-API-Key` header
- **Format**: JSON request/response
- **Errors**: Standard HTTP status codes
- **Timeout**: 60 seconds for most operations

---

## Performance Targets

- **Transcription**: < 5 seconds for 1 minute audio
- **Analysis**: < 8 seconds per request
- **Pronunciation**: < 5 seconds per assessment
- **Cache hit rate**: > 80%
- **Availability**: 99.9%

---

## Implementation Order

1. **Start here**: Config, logging, models
2. **Then**: Caching infrastructure
3. **Then**: Core services (one at a time)
4. **Then**: Update API routes
5. **Then**: Background jobs
6. **Finally**: Monitoring, tests, docs

---

## Quality Standards

✅ **Every function must have:**
- Type hints
- Docstring
- Error handling
- Logging

✅ **Every service must have:**
- Caching where appropriate
- Metrics collection
- Comprehensive error messages

✅ **Every API endpoint must have:**
- Request/response models
- OpenAPI documentation
- Input validation
- Rate limiting

---

## Final Checklist

Before considering this complete:

- [ ] All routes return real data (no stubs)
- [ ] Caching works (verify with logs)
- [ ] Error handling covers all cases
- [ ] Prometheus metrics endpoint works
- [ ] Health check shows all components
- [ ] Can run with Docker
- [ ] Environment variables documented
- [ ] README with setup instructions
- [ ] Integration with backend-nest tested
- [ ] Performance meets targets

---

## Ready to Start?

1. Begin with Phase 1 (Foundation)
2. Test each component before moving to next
3. Use the example code structures provided
4. Follow the architecture diagram
5. Ask questions if anything is unclear

This is a production system - build it properly from the start!