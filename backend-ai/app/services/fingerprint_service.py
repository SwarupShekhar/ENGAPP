from typing import Dict, Any, List
from app.core.logging import logger
from app.cache.manager import cache

class FingerprintService:
    """
    Service to track and update the "Linguistic Fingerprint" of a user.
    Simulates long-term persistence using the cached layered storage.
    """
    
    async def get_profile(self, user_id: str) -> Dict[str, Any]:
        """Retrieve user linguistic profile."""
        key = f"profile:{user_id}"
        profile = await cache.get(key)
        
        if not profile:
            return {
                "weaknesses": [],
                "strengths": [],
                "struggling_concepts": [],
                "sessions_completed": 0
            }
        return profile

    async def update_from_analysis(self, user_id: str, analysis_data: Dict[str, Any]):
        """Update profile based on new analysis results."""
        profile = await self.get_profile(user_id)
        profile["sessions_completed"] += 1
        
        # Simple heuristic for tracking struggles
        new_errors = analysis_data.get("errors", [])
        etypes = [e.get("type") for e in new_errors if e.get("type")]
        
        for etype in set(etypes):
            if etypes.count(etype) > 2:
                if etype not in profile["struggling_concepts"]:
                    profile["struggling_concepts"].append(etype)
                    
        # Persist with long TTL (30 days)
        await cache.set(f"profile:{user_id}", profile, ttl=86400 * 30)
        logger.info("linguistic_profile_updated", user_id=user_id)

    def context_prompt(self, profile: Dict[str, Any]) -> str:
        """Format profile as a prompt context for LLMs."""
        struggles = profile.get("struggling_concepts", [])
        if struggles:
            return f"User consistently struggles with: {', '.join(struggles)}. Focus feedback on these."
        return ""

fingerprint_service = FingerprintService()
