"""
Enhanced cache manager for Kubernetes environments.
Supports Redis-only mode for distributed deployments.
"""
import os
import json
from typing import Optional, Any
from enum import Enum
import redis.asyncio as redis
from diskcache import Cache
from app.core.config import settings
from app.core.logging import logger
import functools
import hashlib

class CacheMode(str, Enum):
    """Cache deployment modes."""
    DUAL = "dual"  # Redis + Disk (single instance)
    REDIS_ONLY = "redis_only"  # Redis only (K8s/distributed)
    DISK_ONLY = "disk_only"  # Disk only (dev/fallback)


class EnhancedCacheManager:
    """
    Production-ready cache manager with deployment mode awareness.
    """
    
    def __init__(self):
        self.redis_client: Optional[redis.Redis] = None
        self.disk_cache: Optional[Cache] = None
        self._initialized = False
        
        # Auto-detect deployment mode
        self.mode = self._detect_mode()
        logger.info(f"Cache manager mode: {self.mode}")
    
    def _detect_mode(self) -> CacheMode:
        """Auto-detect appropriate cache mode based on environment."""
        if os.path.exists("/var/run/secrets/kubernetes.io"):
            logger.info("Kubernetes detected - using REDIS_ONLY mode")
            return CacheMode.REDIS_ONLY
        
        mode = os.getenv("CACHE_MODE", "").lower()
        if mode == "redis_only":
            return CacheMode.REDIS_ONLY
        elif mode == "disk_only":
            return CacheMode.DISK_ONLY
        
        return CacheMode.DUAL
    
    async def initialize(self):
        """Initialize cache based on deployment mode."""
        if self._initialized:
            return
        
        # Initialize Redis
        if self.mode != CacheMode.DISK_ONLY:
            try:
                self.redis_client = await redis.from_url(
                    settings.redis_url,
                    encoding="utf-8",
                    decode_responses=True,
                    max_connections=settings.redis_max_connections,
                    socket_connect_timeout=5
                )
                await self.redis_client.ping()
                logger.info("Redis cache initialized successfully")
            except Exception as e:
                logger.error(f"Redis initialization failed: {e}")
                if self.mode == CacheMode.REDIS_ONLY:
                    raise RuntimeError("Redis required but initialization failed")
                self.redis_client = None
        
        # Initialize disk cache
        if self.mode != CacheMode.REDIS_ONLY:
            try:
                self.disk_cache = Cache(
                    settings.disk_cache_dir,
                    size_limit=settings.disk_cache_size_limit
                )
                logger.info(f"Disk cache initialized at {settings.disk_cache_dir}")
            except Exception as e:
                logger.error(f"Disk cache initialization failed: {e}")
                if self.mode == CacheMode.DISK_ONLY:
                    raise RuntimeError("Disk cache required but initialization failed")
                self.disk_cache = None
        
        self._initialized = True
    
    async def get(self, key: str) -> Optional[Any]:
        """Get value from cache."""
        if not settings.enable_cache:
            return None
        
        # Try Redis first
        if self.redis_client:
            try:
                value = await self.redis_client.get(key)
                if value:
                    return json.loads(value)
            except Exception as e:
                logger.warning(f"Redis get failed: {e}")
        
        # Fallback to disk
        if self.disk_cache and self.mode != CacheMode.REDIS_ONLY:
            try:
                value = self.disk_cache.get(key)
                if value is not None:
                    # Promote to Redis if available
                    if self.redis_client:
                        await self.set(key, value)
                    return value
            except Exception as e:
                logger.warning(f"Disk cache get failed: {e}")
        
        return None
    
    async def set(self, key: str, value: Any, ttl: int = None) -> bool:
        """Set value in cache."""
        if not settings.enable_cache:
            return False
        
        ttl = ttl or settings.redis_cache_ttl
        success = False
        
        if self.redis_client:
            try:
                await self.redis_client.setex(key, ttl, json.dumps(value))
                success = True
            except Exception as e:
                logger.warning(f"Redis set failed: {e}")
        
        if self.disk_cache and self.mode != CacheMode.REDIS_ONLY:
            try:
                self.disk_cache.set(key, value, expire=ttl)
                success = True
            except Exception as e:
                logger.warning(f"Disk cache set failed: {e}")
        
        return success
    
    async def delete(self, key: str) -> bool:
        """Delete value from cache."""
        success = False
        if self.redis_client:
            try:
                await self.redis_client.delete(key)
                success = True
            except Exception as e:
                logger.warning(f"Redis delete failed: {e}")
        if self.disk_cache and self.mode != CacheMode.REDIS_ONLY:
            try:
                self.disk_cache.delete(key)
                success = True
            except Exception as e:
                logger.warning(f"Disk cache delete failed: {e}")
        return success
    
    async def get_stats(self) -> dict:
        """Get cache statistics."""
        stats = {"mode": self.mode, "redis": None, "disk": None}
        if self.redis_client:
            try:
                info = await self.redis_client.info("stats")
                stats["redis"] = {"connected": True, "hits": info.get("keyspace_hits", 0), "misses": info.get("keyspace_misses", 0)}
            except Exception:
                stats["redis"] = {"connected": False}
        if self.disk_cache:
            stats["disk"] = {"size": self.disk_cache.volume(), "count": len(self.disk_cache)}
        return stats
    
    async def close(self):
        """Close cache connections."""
        if self.redis_client:
            await self.redis_client.aclose()
        if self.disk_cache:
            self.disk_cache.close()
        self._initialized = False
        logger.info("Cache manager closed")


# Global cache manager instance
cache = EnhancedCacheManager()

def cached(prefix: str, ttl: int = 3600):
    """
    Decorator for caching async function results.
    """
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            if not settings.enable_cache:
                return await func(*args, **kwargs)
            
            # Generate stable cache key
            key_data = {
                "prefix": prefix,
                "func": func.__name__,
                "args": args[1:] if args and hasattr(args[0], "__class__") else args,
                "kwargs": kwargs
            }
            key_str = json.dumps(key_data, sort_keys=True, default=str)
            key = f"{prefix}:{hashlib.sha256(key_str.encode()).hexdigest()}"
            
            # Try hit
            cached_val = await cache.get(key)
            if cached_val is not None:
                return cached_val
            
            # Call and store
            result = await func(*args, **kwargs)
            await cache.set(key, result, ttl=ttl)
            return result
        return wrapper
    return decorator
