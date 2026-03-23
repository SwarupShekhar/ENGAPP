import re
import logging
import spacy
from typing import List, Dict, Any, Optional
from statistics import mean
from wordfreq import word_frequency

# Setup logger
logger = logging.getLogger(__name__)

# Load SpaCy model
try:
    nlp = spacy.load("en_core_web_sm")
except (ImportError, OSError):
    logger.warning("Spacy model 'en_core_web_sm' not found. Falling back to simple sentence splitting.")
    nlp = None

# CEFR B2/C1 topic word lists (Sample - in production these would be loaded from assets)
CEFR_B2_WORDS = {
    "environmental", "sustainable", "management", "corporate", "professional", 
    "implementation", "significant", "collaborate", "structure", "technical",
    "architecture", "computation", "assessment", "analysis", "infrastructure"
}
CEFR_C1_WORDS = {
    "paradigm", "juxtaposition", "notwithstanding", "inherent", "empirical",
    "comprehensive", "eloquent", "pragmatic", "meticulous", "resilient"
}

class CallQualityService:
    """
    Computes Call Quality Score (CQS) according to specification 1.0.
    Four dimensions: PQS, DS, CS, ES.
    """

    def compute_pronunciation_quality_score(self, utterances: List[Dict[str, Any]]) -> float:
        """
        Dimension 1: PQS (35% weight)
        Based on Azure Speech API JSON (Phoneme-level).
        """
        if not utterances:
            return 0.0

        # 1. Mean phoneme accuracy
        all_phoneme_scores = []
        for utt in utterances:
            # Handle different Azure JSON structures (NBest[0] or flat Words)
            nbests = utt.get("NBest") or [utt]
            if nbests:
                first = nbests[0]
                for word in first.get("Words", []):
                    for phoneme in word.get("Phonemes", []):
                        score = phoneme.get("PronunciationAssessment", {}).get("AccuracyScore")
                        if score is not None:
                            all_phoneme_scores.append(float(score))

        mean_phoneme_accuracy = mean(all_phoneme_scores) if all_phoneme_scores else 0

        # 2. Mean fluency and prosody
        fluency_scores = []
        prosody_scores = []
        for utt in utterances:
            nbests = utt.get("NBest") or [utt]
            if nbests:
                first = nbests[0]
                pa_info = first.get("PronunciationAssessment") or {}
                if "FluencyScore" in pa_info:
                    fluency_scores.append(float(pa_info["FluencyScore"]))
                if "ProsodyScore" in pa_info:
                    prosody_scores.append(float(pa_info["ProsodyScore"]))

        mean_fluency = mean(fluency_scores) if fluency_scores else 0
        mean_prosody = mean(prosody_scores) if prosody_scores else mean_fluency

        # 3. Mispronunciation rate
        all_words_count = 0
        mispronounced_words_count = 0
        for utt in utterances:
            nbests = utt.get("NBest") or [utt]
            if nbests:
                first = nbests[0]
                for word in first.get("Words", []):
                    all_words_count += 1
                    error_type = word.get("PronunciationAssessment", {}).get("ErrorType")
                    if error_type == "Mispronunciation":
                        mispronounced_words_count += 1

        mispronunciation_rate = mispronounced_words_count / all_words_count if all_words_count else 0
        mispronunciation_score = max(0, 100 - (mispronunciation_rate * 200))

        pqs = (
            mean_phoneme_accuracy * 0.35 +
            mean_fluency          * 0.30 +
            mean_prosody          * 0.20 +
            mispronunciation_score * 0.15
        )
        return round(min(100.0, max(0.0, pqs)), 2)

    def compute_depth_score(self, user_turns: List[str]) -> float:
        """
        Dimension 2: Depth Score (30% weight)
        Based on NLP analysis of user's transcript turns.
        """
        full_text = " ".join(user_turns)
        words = re.findall(r'\b[a-zA-Z]+\b', full_text.lower())
        
        if not words:
            return 0.0

        # 1. Lexical sophistication (0–40 points)
        # Threshold: frequency < 0.0001 (above B1 band)
        sophisticated_words = [w for w in words if word_frequency(w, 'en') < 0.0001]
        sophistication_ratio = len(sophisticated_words) / len(words)
        sophistication_score = min(40, sophistication_ratio * 200)

        # 2. Response length (0–30 points)
        words_per_turn = [len(re.findall(r'\b[a-zA-Z]+\b', t)) for t in user_turns]
        avg_words_per_turn = mean(words_per_turn) if words_per_turn else 0
        length_score = min(30, (avg_words_per_turn / 25) * 30)

        # 3. Vocabulary diversity (0–20 points)
        unique_words = set(words)
        ttr = len(unique_words) / len(words)
        diversity_score = min(20, (ttr / 0.7) * 20)

        # 4. Self-correction patterns (0–10 points)
        self_correction_patterns = [
            r'\b(i mean|actually|sorry|let me rephrase|what i meant)\b',
            r'\b\w+,?\s+i mean\b',
            r'\bno wait\b',
        ]
        corrections = sum(
            len(re.findall(p, full_text.lower()))
            for p in self_correction_patterns
        )
        correction_score = min(10, corrections * 2.5)

        ds = sophistication_score + length_score + diversity_score + correction_score
        return round(min(100.0, max(0.0, ds)), 2)

    def compute_complexity_score(self, full_transcript: str) -> float:
        """
        Dimension 3: Complexity Score (25% weight)
        Based on NLP analysis of full conversation content (both speakers).
        """
        if not nlp:
            logger.warning("Complexity score fallback due to missing Spacy model.")
            return 50.0  # Fallback

        doc = nlp(full_transcript)
        sentences = list(doc.sents)
        words = [token.text.lower() for token in doc if token.is_alpha]

        if not sentences or not words:
            return 0.0

        # 1. Topic sophistication (0–40 points)
        content_words = [w for w in words if not nlp.vocab[w].is_stop]
        advanced_words = [w for w in content_words if w in CEFR_B2_WORDS or w in CEFR_C1_WORDS]
        topic_ratio = len(advanced_words) / len(content_words) if content_words else 0
        topic_score = min(40, topic_ratio * 267)

        # 2. Sentence complexity (0–35 points) - count subordinating conjunctions
        clause_markers = {"because", "although", "however", "which", "that", 
                         "when", "while", "if", "unless", "since", "whereas",
                         "therefore", "furthermore", "nevertheless"}
        
        clauses_per_sentence = []
        for sent in sentences:
            sent_words = set(t.text.lower() for t in sent)
            clause_count = 1 + len(sent_words.intersection(clause_markers))
            clauses_per_sentence.append(clause_count)
        
        avg_clauses = mean(clauses_per_sentence) if clauses_per_sentence else 1.0
        complexity_score = min(35, max(0, (avg_clauses - 1) / 1.5 * 35))

        # 3. Abstract vs concrete language ratio (0–25 points)
        # Concrete = PERSON, GPE, ORG, PRODUCT, LOC
        named_entities = [ent for ent in doc.ents if ent.label_ in 
                         {"PERSON", "GPE", "ORG", "PRODUCT", "LOC"}]
        total_tokens = len(words)
        concrete_ratio = sum(len(ent.text.split()) for ent in named_entities) / total_tokens if total_tokens else 0
        abstract_score = min(25, (1 - concrete_ratio) * 30)

        cs = topic_score + complexity_score + abstract_score
        return round(min(100.0, max(0.0, cs)), 2)

    def compute_engagement_score(self,
                                user_turns: List[str],
                                call_duration_seconds: float,
                                user_spoke_seconds: float) -> float:
        """
        Dimension 4: Engagement Score (10% weight)
        Measures active participation.
        """
        if not user_turns:
            return 0.0

        full_user_text = " ".join(user_turns).lower()
        
        # 1. Questions asked by user (0–35 points)
        turns_with_questions = sum(
            1 for t in user_turns
            if '?' in t or re.search(r'\b(what|how|why|when|where|do you|have you|would you|could you)\b', t.lower())
        )
        question_score = min(35, (turns_with_questions / max(len(user_turns), 1)) * 70)

        # 2. Topic contribution (0–35 points)
        topic_shift_markers = [
            r'\b(speaking of|on another note|that reminds me|by the way|'
            r'what about|have you ever|i was thinking|let me ask you)\b'
        ]
        topic_shifts = sum(
            len(re.findall(p, full_user_text))
            for p in topic_shift_markers
        )
        topic_score = min(35, topic_shifts * 8.75)

        # 3. Call completion (0–30 points)
        participation_ratio = user_spoke_seconds / call_duration_seconds if call_duration_seconds > 0 else 0
        if participation_ratio >= 0.80:
            completion_score = 30
        elif participation_ratio >= 0.60:
            completion_score = 20
        elif participation_ratio >= 0.40:
            completion_score = 10
        else:
            completion_score = 0

        es = question_score + topic_score + completion_score
        return round(min(100.0, max(0.0, es)), 2)

    def compute_call_quality_score(self, pqs: float, ds: float, cs: float, es: float) -> float:
        """Final CQS combination."""
        cqs = (
            pqs * 0.35 +
            ds  * 0.30 +
            cs  * 0.25 +
            es  * 0.10
        )
        return round(min(100.0, max(0.0, cqs)), 2)

    def compute_realtime_preview(self, user_turns_so_far: List[str]) -> Dict[str, Any]:
        """Lightweight live health signal for Phase 1."""
        full_text = " ".join(user_turns_so_far).lower()
        words = re.findall(r'\b[a-zA-Z]+\b', full_text)

        if not words:
            return {"status": "neutral", "signal": 50.0, "hint": "Waiting for you to speak..."}

        # Filler word rate
        filler_words = ["um", "uh", "like", "you know", "basically"]
        filler_count = sum(full_text.count(fw) for fw in filler_words)
        filler_rate = filler_count / len(words)

        # Average words per turn
        avg_turn_len = mean([len(t.split()) for t in user_turns_so_far])

        # Vocabulary diversity (TTR)
        ttr = len(set(words)) / len(words)

        # Preview signal (0–100)
        preview = (
            max(0, 100 - filler_rate * 300) * 0.40 +
            min(100, (avg_turn_len / 20) * 100) * 0.35 +
            min(100, ttr * 150) * 0.25
        )

        if preview >= 70:
            status = "strong"
            hint = "Great depth — keep it up"
        elif preview >= 45:
            status = "good"
            hint = "Good pace, keep going"
            if avg_turn_len < 10:
                hint = "Try longer responses"
        else:
            status = "needs_work"
            hint = "Reduce filler words" if filler_rate > 0.05 else "Keep practicing"

        return {
            "status": status,
            "signal": round(preview, 1),
            "hint": hint
        }

# Singleton instance
call_quality_service = CallQualityService()
