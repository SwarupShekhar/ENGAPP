from fastapi import Request, HTTPException
from typing import Dict
import time
import asyncio
import logging

logger = logging.getLogger(__name__)

class RateLimiter:
    def __init__(self):
        self.user_requests: Dict[str, list] = {}
        self.active_sessions: Dict[str, int] = {}  # userId -> count
        self.cleanup_task = None
    
    async def check_rate_limit(
        self,
        user_id: str,
        max_requests_per_minute: int = 30,
        max_concurrent_sessions: int = 2
    ):
        """
        Enforce rate limits per user:
        1. Max 30 API calls per minute
        2. Max 2 concurrent AI tutor sessions
        """
        
        now = time.time()
        
        # Clean old requests (older than 60 seconds)
        if user_id in self.user_requests:
            self.user_requests[user_id] = [
                req_time for req_time in self.user_requests[user_id]
                if now - req_time < 60
            ]
        else:
            self.user_requests[user_id] = []
        
        # Check request count
        if len(self.user_requests[user_id]) >= max_requests_per_minute:
            logger.warning(f"Rate limit exceeded for user {user_id}")
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded. Max {max_requests_per_minute} requests per minute."
            )
        
        # Check concurrent sessions
        active = self.active_sessions.get(user_id, 0)
        if active >= max_concurrent_sessions:
            logger.warning(f"Max concurrent sessions exceeded for user {user_id}: {active}")
            raise HTTPException(
                status_code=429,
                detail=f"Max {max_concurrent_sessions} concurrent sessions allowed."
            )
        
        # Record request
        self.user_requests[user_id].append(now)
    
    def start_session(self, user_id: str):
        """Increment active session count"""
        self.active_sessions[user_id] = self.active_sessions.get(user_id, 0) + 1
        logger.info(f"User {user_id} started session. Active: {self.active_sessions[user_id]}")
    
    def end_session(self, user_id: str):
        """Decrement active session count"""
        if user_id in self.active_sessions:
            self.active_sessions[user_id] = max(0, self.active_sessions[user_id] - 1)
            logger.info(f"User {user_id} ended session. Active: {self.active_sessions[user_id]}")
            if self.active_sessions[user_id] == 0:
                del self.active_sessions[user_id]

# Global instance
rate_limiter = RateLimiter()
