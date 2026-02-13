"""
Enhanced cache manager for Kubernetes environments.
Supports Redis-only mode for distributed deployments.
"""
import os
from typing import Optional, Any
from enum import Enum
import redis.asyncio as redis
from diskcache import Cache
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class CacheMode(str, Enum):
    """Cache deployment modes."""
    DUAL = "dual"  # Redis + Disk (single instance)
    REDIS_ONLY = "redis_only"  # Redis only (K8s/distributed)
    DISK_ONLY = "disk_only"  # Disk only (dev/fallback)


class EnhancedCacheManager:
    """
    Production-ready cache manager with deployment mode awareness.
    
    Modes:
    - DUAL: Use both Redis and disk cache (default for single instance)
    - REDIS_ONLY: Use only Redis (recommended for K8s)
    - DISK_ONLY: Use only disk cache (dev/testing)
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
        
        # Check for K8s environment
        if os.path.exists("/var/run/secrets/kubernetes.io"):
            logger.info("Kubernetes detected - using REDIS_ONLY mode")
            return CacheMode.REDIS_ONLY
        
        # Check for explicit mode setting
        mode = os.getenv("CACHE_MODE", "").lower()
        if mode == "redis_only":
            return CacheMode.REDIS_ONLY
        elif mode == "disk_only":
            return CacheMode.DISK_ONLY
        
        # Default to dual mode for single instance
        return CacheMode.DUAL
    
    async def initialize(self):
        """Initialize cache based on deployment mode."""
        if self._initialized:
            return
        
        # Initialize Redis (unless disk-only mode)
        if self.mode != CacheMode.DISK_ONLY:
            try:
                self.redis_client = await redis.from_url(
                    settings.redis_url,
                    encoding="utf-8",
                    decode_responses=True,
                    max_connections=settings.redis_max_connections,
                    socket_connect_timeout=5,
                    socket_keepalive=True,
                    health_check_interval=30
                )
                await self.redis_client.ping()
                logger.info("Redis cache initialized successfully")
            except Exception as e:
                logger.error(f"Redis initialization failed: {e}")
                if self.mode == CacheMode.REDIS_ONLY:
                    raise RuntimeError("Redis required but initialization failed")
                self.redis_client = None
        
        # Initialize disk cache (unless redis-only mode)
        if self.mode != CacheMode.REDIS_ONLY:
            try:
                self.disk_cache = Cache(
                    settings.disk_cache_dir,
                    size_limit=settings.disk_cache_size_limit  # 10GB default
                )
                logger.info(f"Disk cache initialized at {settings.disk_cache_dir}")
            except Exception as e:
                logger.error(f"Disk cache initialization failed: {e}")
                if self.mode == CacheMode.DISK_ONLY:
                    raise RuntimeError("Disk cache required but initialization failed")
                self.disk_cache = None
        
        self._initialized = True
        logger.info(f"Cache manager initialized in {self.mode} mode")
    
    async def get(self, key: str) -> Optional[Any]:
        """Get value from cache."""
        if not settings.enable_cache:
            return None
        
        # Try Redis first (if available)
        if self.redis_client:
            try:
                value = await self.redis_client.get(key)
                if value:
                    logger.debug("Cache hit (Redis)", key=key)
                    import json
                    return json.loads(value)
            except Exception as e:
                logger.warning(f"Redis get failed: {e}", key=key)
        
        # Fallback to disk (if available and not redis-only mode)
        if self.disk_cache and self.mode != CacheMode.REDIS_ONLY:
            try:
                value = self.disk_cache.get(key)
                if value is not None:
                    logger.debug("Cache hit (Disk)", key=key)
                    # Promote to Redis if available
                    if self.redis_client:
                        await self._promote_to_redis(key, value)
                    return value
            except Exception as e:
                logger.warning(f"Disk cache get failed: {e}", key=key)
        
        logger.debug("Cache miss", key=key)
        return None
    
    async def set(self, key: str, value: Any, ttl: int = None) -> bool:
        """Set value in cache."""
        if not settings.enable_cache:
            return False
        
        ttl = ttl or settings.redis_cache_ttl
        success = False
        
        # Set in Redis
        if self.redis_client:
            try:
                import json
                await self.redis_client.setex(
                    key,
                    ttl,
                    json.dumps(value)
                )
                success = True
                logger.debug("Cache set (Redis)", key=key, ttl=ttl)
            except Exception as e:
                logger.warning(f"Redis set failed: {e}", key=key)
        
        # Set in disk cache (if not redis-only mode)
        if self.disk_cache and self.mode != CacheMode.REDIS_ONLY:
            try:
                self.disk_cache.set(key, value, expire=ttl)
                success = True
                logger.debug("Cache set (Disk)", key=key, ttl=ttl)
            except Exception as e:
                logger.warning(f"Disk cache set failed: {e}", key=key)
        
        return success
    
    async def _promote_to_redis(self, key: str, value: Any):
        """Promote disk cache hit to Redis."""
        try:
            import json
            await self.redis_client.setex(
                key,
                settings.redis_cache_ttl,
                json.dumps(value)
            )
            logger.debug("Cache promoted to Redis", key=key)
        except Exception as e:
            logger.warning(f"Cache promotion failed: {e}", key=key)
    
    async def delete(self, key: str) -> bool:
        """Delete value from cache."""
        success = False
        
        if self.redis_client:
            try:
                await self.redis_client.delete(key)
                success = True
            except Exception as e:
                logger.warning(f"Redis delete failed: {e}", key=key)
        
        if self.disk_cache and self.mode != CacheMode.REDIS_ONLY:
            try:
                self.disk_cache.delete(key)
                success = True
            except Exception as e:
                logger.warning(f"Disk cache delete failed: {e}", key=key)
        
        return success
    
    async def clear_pattern(self, pattern: str) -> int:
        """Clear all keys matching pattern (Redis only)."""
        if not self.redis_client:
            logger.warning("Clear pattern requires Redis")
            return 0
        
        try:
            keys = []
            async for key in self.redis_client.scan_iter(match=pattern):
                keys.append(key)
            
            if keys:
                deleted = await self.redis_client.delete(*keys)
                logger.info(f"Cleared {deleted} keys", pattern=pattern)
                return deleted
            return 0
        except Exception as e:
            logger.error(f"Clear pattern failed: {e}", pattern=pattern)
            return 0
    
    async def get_stats(self) -> dict:
        """Get cache statistics."""
        stats = {
            "mode": self.mode,
            "redis": None,
            "disk": None
        }
        
        if self.redis_client:
            try:
                info = await self.redis_client.info("stats")
                stats["redis"] = {
                    "connected": True,
                    "hits": info.get("keyspace_hits", 0),
                    "misses": info.get("keyspace_misses", 0),
                    "hit_rate": self._calculate_hit_rate(
                        info.get("keyspace_hits", 0),
                        info.get("keyspace_misses", 0)
                    )
                }
            except Exception as e:
                stats["redis"] = {"connected": False, "error": str(e)}
        
        if self.disk_cache and self.mode != CacheMode.REDIS_ONLY:
            try:
                stats["disk"] = {
                    "size": self.disk_cache.volume(),
                    "count": len(self.disk_cache)
                }
            except Exception as e:
                stats["disk"] = {"error": str(e)}
        
        return stats
    
    @staticmethod
    def _calculate_hit_rate(hits: int, misses: int) -> float:
        """Calculate cache hit rate."""
        total = hits + misses
        if total == 0:
            return 0.0
        return round((hits / total) * 100, 2)
    
    async def close(self):
        """Close cache connections."""
        if self.redis_client:
            await self.redis_client.close()
        if self.disk_cache:
            self.disk_cache.close()
        self._initialized = False
        logger.info("Cache manager closed")


# Global cache manager instance
cache_manager = EnhancedCacheManager()
