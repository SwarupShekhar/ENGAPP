import re
import os
from typing import List, Dict, Any, Set

# Optional import for MTLD
try:
    from lexical_diversity import lex_div as ld
    HAS_LEX_DIV = True
except ImportError:
    HAS_LEX_DIV = False

class VocabularyAnalyzer:
    """
    Analyzes vocabulary using industry-standard MTLD and CEFR word lists.
    """
    
    def __init__(self, resources_dir: str = "app/resources"):
        self.resources_dir = resources_dir
        self.CEFR_WORD_LISTS = {
            "A1": self._load_word_list("a1_words.txt"),
            "A2": self._load_word_list("a2_words.txt"),
            "B1": self._load_word_list("b1_words.txt"),
            "B2": self._load_word_list("b2_words.txt"),
            "C1": self._load_word_list("c1_words.txt"),
            "C2": self._load_word_list("c2_words.txt")
        }
        self.ENGINEERING_TERMS = self._load_word_list("engineering_domain.txt")

    def analyze_vocabulary(self, transcript: str, context: str = "engineering") -> dict:
        """
        Multi-dimensional vocabulary assessment
        """
        tokens = self._tokenize(transcript)
        if not tokens:
            return {
                "overall_vocabulary": 0.0,
                "breakdown": {"lexical_range": 0, "precision": 0, "sophistication": 0},
                "word_level_distribution": {},
                "domain_terms_used": 0
            }
        
        # Component 1: Lexical Range (40%) - Uses MTLD
        range_score = self._calculate_range(tokens)
        
        # Component 2: Word Choice Precision (35%)
        precision_score = self._calculate_precision(tokens, transcript)
        
        # Component 3: Sophistication (25%)
        sophistication_score = self._calculate_sophistication(tokens, context)
        
        final_score = (
            range_score * 0.40 +
            precision_score * 0.35 +
            sophistication_score * 0.25
        )
        
        return {
            "overall_vocabulary": round(final_score, 1),
            "breakdown": {
                "lexical_range": round(range_score, 1),
                "precision": round(precision_score, 1),
                "sophistication": round(sophistication_score, 1)
            },
            "word_level_distribution": self._get_cefr_distribution(tokens),
            "domain_terms_used": self._count_domain_terms(tokens, context),
            "collocation_accuracy": self._check_collocations(transcript)
        }

    def _tokenize(self, text: str) -> List[str]:
        """Simple regex tokenizer."""
        return re.findall(r'\b\w+\b', text.lower())

    def _calculate_range(self, tokens: List[str]) -> float:
        """Use MTLD (Measure of Textual Lexical Diversity)."""
        if not HAS_LEX_DIV:
            # Fallback to simple TTR if library is missing
            ttr = len(set(tokens)) / len(tokens) if tokens else 0
            return min(100, ttr * 150) # Heuristic mapping

        # MTLD calculation
        try:
            mtld_score = ld.mtld(tokens)
            
            # Map MTLD to 0-100 scale
            # MTLD benchmarks: <50=Poor, 50-70=Fair, 70-90=Good, >90=Excellent
            if mtld_score < 50:
                return max(10, (mtld_score / 50) * 40)
            elif mtld_score < 70:
                return 40 + ((mtld_score - 50) / 20) * 30  # 40-70
            elif mtld_score < 90:
                return 70 + ((mtld_score - 70) / 20) * 20  # 70-90
            else:
                return 90 + min((mtld_score - 90) / 10, 10)  # 90-100
        except Exception:
            return 50.0

    def _calculate_precision(self, tokens: List[str], transcript: str) -> float:
        """Check for correct collocations."""
        CORRECT_COLLOCATIONS = {
            "make": ["decision", "mistake", "progress", "effort", "sure"],
            "do": ["homework", "research", "damage", "harm", "well"],
            "conduct": ["research", "experiment", "survey", "analysis"],
            "draw": ["conclusion", "attention", "comparison"]
        }
        
        correct_count = 0
        incorrect_count = 0
        
        # Check adjacent pairs
        for i in range(len(tokens) - 1):
            verb = tokens[i]
            noun = tokens[i+1]
            if verb in CORRECT_COLLOCATIONS:
                if noun in CORRECT_COLLOCATIONS[verb]:
                    correct_count += 1
                elif noun in ["research"] and verb == "make": # specific common mistake
                    incorrect_count += 1
        
        if correct_count + incorrect_count == 0:
            return 75.0  # Fairly high base if no mistakes detected
            
        accuracy = correct_count / (correct_count + incorrect_count)
        return accuracy * 100

    def _calculate_sophistication(self, tokens: List[str], context: str) -> float:
        """Score based on word level and domain relevance."""
        word_scores = []
        for token in tokens:
            level_score = 1 # Default A1
            if token in self.CEFR_WORD_LISTS["C2"]: level_score = 6
            elif token in self.CEFR_WORD_LISTS["C1"]: level_score = 5
            elif token in self.CEFR_WORD_LISTS["B2"]: level_score = 4
            elif token in self.CEFR_WORD_LISTS["B1"]: level_score = 3
            elif token in self.CEFR_WORD_LISTS["A2"]: level_score = 2
            
            # Bonus for domain-specific terms
            if token in self.ENGINEERING_TERMS:
                level_score += 2
                
            word_scores.append(level_score)
            
        if not word_scores: return 0.0
        avg = sum(word_scores) / len(word_scores)
        # Map 1-8 scale to 0-100
        return min(100, (avg / 6.0) * 100)

    def _get_cefr_distribution(self, tokens: List[str]) -> Dict[str, int]:
        dist = {"A1": 0, "A2": 0, "B1": 0, "B2": 0, "C1": 0, "C2": 0}
        for token in tokens:
            for level in reversed(list(dist.keys())):
                if token in self.CEFR_WORD_LISTS[level]:
                    dist[level] += 1
                    break
            else:
                dist["A1"] += 1
        return dist

    def _count_domain_terms(self, tokens: List[str], context: str) -> int:
        return sum(1 for t in tokens if t in self.ENGINEERING_TERMS)

    def _check_collocations(self, transcript: str) -> List[Dict[str, str]]:
        # Simplified placeholder for collocation check result
        return []

    def _load_word_list(self, filename: str) -> Set[str]:
        path = os.path.join(self.resources_dir, filename)
        if not os.path.exists(path):
            return set()
        try:
            with open(path, 'r') as f:
                return {line.strip().lower() for line in f if line.strip()}
        except Exception:
            return set()
