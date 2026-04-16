# backend-ai — FastAPI + espeak-ng (phonemizer Layer 2) + ffmpeg (pydub/m4a)
# Works on amd64 and arm64 (Render + Apple Silicon local builds).
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    espeak-ng \
    libespeak-ng1 \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/* \
    && LIB=$(find /usr/lib -name 'libespeak-ng.so' 2>/dev/null | head -1) \
    && if [ -z "$LIB" ]; then LIB=$(find /usr/lib -name 'libespeak-ng.so.*' \( -type f -o -type l \) 2>/dev/null | head -1); fi \
    && test -n "$LIB" && test -e "$LIB" \
    && echo "$LIB" > /etc/englivo_phonemizer_espeak_lib \
    && cat /etc/englivo_phonemizer_espeak_lib

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Render and others set PORT; default 8001 for local docker run
ENV PORT=8001
EXPOSE 8001

# PHONEMIZER_ESPEAK_LIBRARY must be set before Python loads phonemizer (path differs on arm64 vs amd64).
CMD ["sh", "-c", "export PHONEMIZER_ESPEAK_LIBRARY=$(cat /etc/englivo_phonemizer_espeak_lib) && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8001}"]
