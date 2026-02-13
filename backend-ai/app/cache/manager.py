import hashlib
import json
import diskcache
import aiocache
from typing import Optional, Any, Callable
from functools import wraps
from app.core.config import settings
from app.core.logging import logger

class CacheLayer:
    def __init__(self):
        self.redis = None
        self.disk = None
        
    async def initialize(self):
        if not settings.enable_cache:
            return

        # Initialize Redis
        try:
            from urllib.parse import urlparse
            parsed = urlparse(settings.redis_url)
            self.redis = aiocache.Cache(
                aiocache.Cache.REDIS,
                endpoint=parsed.hostname,
                port=parsed.port,
                password=parsed.password,
                namespace="engr_ai"
            )
            logger.info("cache_redis_initialized")
        except Exception as e:
            logger.warning("cache_redis_init_failed", error=str(e))

        # Initialize Disk
        try:
            self.disk = diskcache.Cache(settings.disk_cache_dir)
            logger.info("cache_disk_initialized", path=settings.disk_cache_dir)
        except Exception as e:
            logger.warning("cache_disk_init_failed", error=str(e))

    async def get(self, key: str) -> Optional[Any]:
        if not settings.enable_cache:
            return None

        # Tier 1: Redis
        if self.redis:
            try:
                val = await self.redis.get(key)
                if val:
                    return json.loads(val)
            except Exception:
                pass

        # Tier 2: Disk
        if self.disk:
            try:
                val = self.disk.get(key)
                if val:
                    # Async promotion to Redis
                    if self.redis:
                         await self.redis.set(key, json.dumps(val))
                    return val
            except Exception:
                pass
        
        return None

    async def set(self, key: str, value: Any, ttl: int = 3600):
        if not settings.enable_cache:
            return

        try:
            serialized = json.dumps(value)
            
            # Set in Redis
            if self.redis:
                await self.redis.set(key, serialized, ttl=ttl)
            
            # Set in Disk
            if self.disk:
                self.disk.set(key, value, expire=ttl)
        except Exception as e:
            logger.warning("cache_set_failed", key=key, error=str(e))

    async def close(self):
        if self.redis:
            await self.redis.close()
        if self.disk:
            self.disk.close()

cache = CacheLayer()

def cached(prefix: str, ttl: int = 3600):
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            if not settings.enable_cache:
                return await func(*args, **kwargs)

            # Generate stable hash
            # We use a combined hash of the prefix and arguments
            arg_str = json.dumps({"args": args[1:], "kwargs": kwargs}, default=str, sort_keys=True)
            content_hash = hashlib.sha256(arg_str.encode()).hexdigest()
            key = f"{prefix}:{content_hash}"

            cached_val = await cache.get(key)
            if cached_val:
                logger.info("cache_hit", key=key)
                return cached_val

            result = await func(*args, **kwargs)
            
            # Cache only if result exists and is successful (implicitly)
            if result:
                # Convert Pydantic to dict for storage
                to_cache = result.model_dump() if hasattr(result, 'model_dump') else result
                await cache.set(key, to_cache, ttl=ttl)
            
            return result
        return wrapper
    return decorator
