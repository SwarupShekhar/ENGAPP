from typing import Dict, List
import nltk
from nltk.tokenize import word_tokenize, sent_tokenize
from app.models.base import CEFRAssessment, CEFRLevel
from app.core.logging import logger
from app.core.config import settings

# Ensure NLTK data is downloaded
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')

class CEFRClassifier:
    """
    A rule-based CEFR classifier based on linguistic features.
    This is a simplified model and can be expanded with more sophisticated
    ML models or linguistic features.
    """

    def __init__(self):
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

    def classify(self, text: str, context: Dict = None) -> CEFRAssessment:
        """
        Classifies the given text into a CEFR level.
        """
        tokens = [word.lower() for word in word_tokenize(text) if word.isalpha()]
        num_words = len(tokens)

        if num_words < 5:
            level = CEFRLevel.A1
            score = 10
        else:
            lexical_diversity = self._calculate_lexical_diversity(tokens)
            sentence_complexity = self._calculate_sentence_complexity(text)

            # This is a very basic scoring algorithm. A real system would use a
            # weighted model trained on a labeled corpus.
            score = (lexical_diversity * 200) + (sentence_complexity * 2)

            if score <= settings.cefr_a1_max_score:
                level = CEFRLevel.A1
            elif score <= settings.cefr_a2_max_score:
                level = CEFRLevel.A2
            elif score <= settings.cefr_b1_max_score:
                level = CEFRLevel.B1
            elif score <= settings.cefr_b2_max_score:
                level = CEFRLevel.B2
            elif score <= settings.cefr_c1_max_score:
                level = CEFRLevel.C1
            else:
                level = CEFRLevel.C2
        
        # Placeholder for strengths, weaknesses, and next level requirements
        return CEFRAssessment(
            level=level,
            score=min(score, 100),
            confidence=0.85,  # Placeholder confidence
            strengths=["-"],
            weaknesses=["-"],
            next_level_requirements=["-"]
        )

cefr_classifier = CEFRClassifier()
