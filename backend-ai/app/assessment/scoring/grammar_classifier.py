from typing import Dict, List, Any

class GrammarErrorClassifier:
    """
    Categorizes grammar errors by severity and type
    """
    
    ERROR_TAXONOMY = {
        # Tier 1: Comprehension-blocking (10 points each)
        "TIER_1": [
            "wrong_tense_context",      # "Yesterday I go" → "went"
            "subject_verb_disagreement", # "He go" → "goes"
            "missing_auxiliary",         # "He working" → "is working"
            "word_order_chaos",          # "Book the read I"
            "critical_omission"
        ],
        
        # Tier 2: Noticeable but understandable (5 points)
        "TIER_2": [
            "article_error",            # "I am engineer" → "an engineer"
            "preposition_error",        # "interested about" → "in"
            "plural_form_error",        # "two childs" → "children"
            "wrong_verb_form",           # "He goed" → "went"
            "punctuation_error"          # though less likely in speech analysis
        ],
        
        # Tier 3: Minor slips (2 points)
        "TIER_3": [
            "article_omission_casual",  # "Going to store" (acceptable in speech)
            "uncountable_plural",       # "informations" → "information"
            "redundant_preposition",    # "Where are you at?" → "Where are you?"
            "colloquial_contraction",    # "ain't", "wanna" in formal context
            "minor_tense_slip"
        ]
    }
    
    def classify_errors(self, gemini_analysis: dict) -> dict:
        """
        Takes Gemini's detected errors and categorizes them
        """
        errors_by_tier = {
            "TIER_1": [],
            "TIER_2": [],
            "TIER_3": []
        }
        
        total_penalty = 0
        
        for error in gemini_analysis.get('grammatical_errors', []):
            tier = self._determine_tier(error)
            errors_by_tier[tier].append(error)
            
            penalty = {
                "TIER_1": 10,
                "TIER_2": 5,
                "TIER_3": 2
            }[tier]
            
            total_penalty += penalty
        
        # Award points for complex structures used correctly
        complexity_bonus = self._calculate_complexity_bonus(
            gemini_analysis.get('sentence_structures', [])
        )
        
        # Base grammar score
        base_score = 100
        final_score = max(0, base_score - total_penalty + complexity_bonus)
        
        return {
            "overall_grammar": min(100, final_score),
            "errors_by_tier": errors_by_tier,
            "total_errors": len(gemini_analysis.get('grammatical_errors', [])),
            "complexity_bonus": complexity_bonus,
            "breakdown": {
                "tense_control": self._calculate_tense_score(errors_by_tier),
                "article_usage": self._calculate_article_score(errors_by_tier),
                "sentence_complexity": self._calculate_complexity_score(gemini_analysis)
            }
        }

    def _determine_tier(self, error: Dict[str, Any]) -> str:
        """Determines the tier of an error based on its type or severity field."""
        # Trust Gemini's tier if provided
        severity = error.get('severity', '').upper()
        if severity in self.ERROR_TAXONOMY:
            return severity
            
        # Fallback to mapping error_type
        error_type = error.get('error_type', '').lower()
        for tier, types in self.ERROR_TAXONOMY.items():
            if error_type in types:
                return tier
                
        # Default to TIER_2 if unknown
        return "TIER_2"

    def _calculate_complexity_bonus(self, structures: List[Dict[str, Any]]) -> float:
        """Award points for correctly using complex structures."""
        bonus = 0
        for struct in structures:
            stype = struct.get('type', '').lower()
            features = struct.get('features', [])
            
            if stype in ["complex", "compound-complex"]:
                bonus += 3
            if "passive_voice" in features:
                bonus += 2
            if "conditional" in features:
                bonus += 2
                
        return min(bonus, 15)  # Cap bonus at 15 points

    def _calculate_tense_score(self, errors_by_tier: Dict[str, List]) -> float:
        """Calculate a sub-score for tense control (0-100)."""
        tense_errors = 0
        for tier in errors_by_tier.values():
            for err in tier:
                if "tense" in err.get('error_type', '').lower() or "verb" in err.get('error_type', '').lower():
                    tense_errors += 1
        
        return max(0, 100 - (tense_errors * 15))

    def _calculate_article_score(self, errors_by_tier: Dict[str, List]) -> float:
        """Calculate a sub-score for article usage (0-100)."""
        article_errors = 0
        for tier in errors_by_tier.values():
            for err in tier:
                if "article" in err.get('error_type', '').lower():
                    article_errors += 1
                    
        return max(0, 100 - (article_errors * 10))

    def _calculate_complexity_score(self, gemini_analysis: dict) -> float:
        """Score based on range of sentence structures used."""
        structures = gemini_analysis.get('sentence_structures', [])
        if not structures:
            return 50.0
            
        types = [s.get('type', '').lower() for s in structures]
        variety = len(set(types))
        
        score = 40 + (variety * 15)
        if "complex" in types or "compound-complex" in types:
            score += 10
            
        return min(100, score)
