from typing import Dict, List
import nltk
from nltk.tokenize import word_tokenize, sent_tokenize
from app.models.base import CEFRAssessment, CEFRLevel
from app.core.logger import logger
from app.core.config import settings


def _ensure_nltk_data():
    """Lazy initializer for NLTK data - checks and downloads if needed."""
    resources_to_check = [
        'tokenizers/punkt',
        'tokenizers/punkt_tab'
    ]
    
    for resource in resources_to_check:
        try:
            nltk.data.find(resource)
        except LookupError:
            # Try to download the resource
            try:
                # Extract the base resource name for download (last path segment)
                base_resource = resource.rsplit('/', 1)[-1] if '/' in resource else resource
                nltk.download(base_resource, quiet=True)
            except Exception as e:
                logger.warning(f"Failed to download NLTK resource {resource}: {e}")
                raise RuntimeError(
                    f"NLTK resource '{resource}' not available. "
                    "Please pre-install with: python -c \"import nltk; nltk.download('punkt')\""
                )


class CEFRClassifier:
    """
    A rule-based CEFR classifier based on linguistic features.
    This is a simplified model and can be expanded with more sophisticated
    ML models or linguistic features.
    """

    def __init__(self):
        # Initialize NLTK data lazily on first use
        _ensure_nltk_data()
        
        # In a real application, these would be loaded from external files or a database
        self.vocab_lists = {
            CEFRLevel.A1: {"the", "be", "to", "of", "and", "a", "in", "that", "have", "I"},
            CEFRLevel.A2: {"about", "because", "can", "could", "if", "into", "like", "make", "more", "most"},
            # Add more extensive vocabulary lists for each level
        }
        logger.info("CEFRClassifier initialized.")

    def _calculate_lexical_diversity(self, tokens: List[str]) -> float:
        """Calculate Type-Token Ratio (TTR)."""
        if not tokens:
            return 0.0
        return len(set(tokens)) / len(tokens)

    def _calculate_sentence_complexity(self, text: str) -> float:
        """Calculate average sentence length."""
        sentences = sent_tokenize(text)
        tokens = word_tokenize(text)
        if not sentences:
            return 0.0
        return len(tokens) / len(sentences)

    def classify(self, input_data, context: Dict = None) -> CEFRAssessment:
        """
        Classifies the given text or metrics into a CEFR level.
        """
        # Normalize to a 0-100 "normalized_score" regardless of input shape.
        # NOTE: Some callers pass an object with an already-computed overall_score.
        raw_score = 0.0
        normalized_score = 0.0

        # C2 threshold is typically 15 points above C1
        cefr_c2_max = settings.cefr_c1_max_score + 15

        if hasattr(input_data, 'overall_score'):
            # Caller already computed a 0-100 score; treat it as normalized.
            score = float(getattr(input_data, 'overall_score') or 0.0)
            normalized_score = max(0.0, min(100.0, score))
            # Back-compute a comparable raw_score for completeness/debuggability.
            raw_score = (normalized_score / 100.0) * cefr_c2_max if cefr_c2_max > 0 else 0.0
        else:
            text = str(input_data)
            tokens = [word.lower() for word in word_tokenize(text) if word.isalpha()]
            num_words = len(tokens)

            if num_words < 5:
                raw_score = 10.0
            else:
                lexical_diversity = self._calculate_lexical_diversity(tokens)
                sentence_complexity = self._calculate_sentence_complexity(text)

                # Compute raw score from linguistic features
                raw_score = (lexical_diversity * 200) + (sentence_complexity * 2)

            normalized_score = (raw_score / cefr_c2_max) * 100 if cefr_c2_max > 0 else 0.0
            normalized_score = max(0.0, min(100.0, normalized_score))  # Clamp between 0 and 100

        if normalized_score <= settings.cefr_a1_max_score:
            level = CEFRLevel.A1
        elif normalized_score <= settings.cefr_a2_max_score:
            level = CEFRLevel.A2
        elif normalized_score <= settings.cefr_b1_max_score:
            level = CEFRLevel.B1
        elif normalized_score <= settings.cefr_b2_max_score:
            level = CEFRLevel.B2
        elif normalized_score <= settings.cefr_c1_max_score:
            level = CEFRLevel.C1
        else:
            level = CEFRLevel.C2
        
        # Placeholder for strengths, weaknesses, and next level requirements
        return CEFRAssessment(
            level=level,
            score=int(normalized_score),
            confidence=0.85,  # Placeholder confidence
            strengths=["-"],
            weaknesses=["-"],
            next_level_requirements=["-"]
        )

cefr_classifier = CEFRClassifier()
