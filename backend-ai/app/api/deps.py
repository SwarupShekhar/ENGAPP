from typing import Generator, Any
from fastapi import Request
from app.core.config import settings
from app.core.logging import logger

def get_settings():
    return settings

def get_logger(request: Request):
    # Retrieve the contextual logger created by RequestIDMiddleware
    return getattr(request.state, "logger", logger)

# Placeholder for future database/redis session dependencies
def get_cache_manager():
    from app.utils.cache import cache_manager
    return cache_manager
