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

    def compute_pronunciation_quality_score(self, utterances: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Dimension 1: PQS (Phase 2 Specification)
        Formula: pqs = (mean_accuracy * 0.35) + (mean_fluency * 0.30) 
                     + (prosody * 0.20) + (mispronunciation_score * 0.15)
        """
        if not utterances:
            return {
                "pqs": 0.0,
                "mean_accuracy": 0.0,
                "mean_fluency": 0.0,
                "mean_prosody": 0.0,
                "mispronunciation_rate": 0.0,
                "word_count": 0,
            }

        # Signal 1: Mean word accuracy
        all_word_accuracy_scores: List[float] = []
        # Signal 2: Mean fluency
        fluency_scores: List[float] = []
        # Signal 3: Prosody (distinct from fluency — do not duplicate into both slots)
        prosody_scores: List[float] = []
        # Signal 4: Mispronunciation rate
        total_words: int = 0
        mispronounced_words: int = 0

        logger.info(f"Computing PQS for {len(utterances)} utterances")
        for utt in utterances:
            # Azure JSON structure handling
            nbests = utt.get("NBest") or utt.get("Nbests") or utt.get("nbest") or [utt]
            if not nbests:
                logger.warning("Empty NBest in utterance")
                continue
            
            first = nbests[0]
            if not isinstance(first, dict):
                logger.warning(f"NBest[0] is not a dict: {type(first)}")
                continue
            
            # Fluency / prosody at utterance (segment) level — same layer as Azure JSON
            pa_info = first.get("PronunciationAssessment") or {}
            if "FluencyScore" in pa_info:
                fluency_scores.append(float(pa_info["FluencyScore"]))
            elif utt.get("fluency_score") is not None:
                fluency_scores.append(float(utt["fluency_score"]))

            if "ProsodyScore" in pa_info:
                prosody_scores.append(float(pa_info["ProsodyScore"]))
            elif utt.get("prosody_score") is not None:
                prosody_scores.append(float(utt["prosody_score"]))
            
            # Word level metrics
            words = first.get("Words", [])
            for word in words:
                total_words = total_words + 1
                
                # Accuracy
                w_pa = word.get("PronunciationAssessment") or {}
                acc = w_pa.get("AccuracyScore")
                if acc is not None:
                    all_word_accuracy_scores.append(float(acc))
                
                # Mispronunciation
                err_type = w_pa.get("ErrorType") or word.get("ErrorType")
                if err_type == "Mispronunciation":
                    mispronounced_words = mispronounced_words + 1

        mean_accuracy = float(mean(all_word_accuracy_scores)) if all_word_accuracy_scores else 0.0
        mean_fluency = float(mean(fluency_scores)) if fluency_scores else 0.0

        mispron_rate = float(mispronounced_words) / float(total_words) if total_words > 0 else 0.0
        mispron_score = float(max(0.0, float(100.0 - (mispron_rate * 200.0))))

        # Prosody: use Azure ProsodyScore when present. If absent, fold the 20% prosody weight
        # into fluency so we do not count the same fluency signal twice (30% + 20%).
        if prosody_scores:
            mean_prosody = float(mean(prosody_scores))
            pqs = (
                (mean_accuracy * 0.35)
                + (mean_fluency * 0.30)
                + (mean_prosody * 0.20)
                + (mispron_score * 0.15)
            )
        else:
            mean_prosody = mean_fluency
            pqs = (
                (mean_accuracy * 0.35)
                + (mean_fluency * 0.50)
                + (mispron_score * 0.15)
            )

        return {
            "pqs": round(float(min(100.0, max(0.0, pqs))), 2),
            "mean_accuracy": round(mean_accuracy, 2),
            "mean_fluency": round(mean_fluency, 2),
            "mean_prosody": round(mean_prosody, 2),
            "mispronunciation_rate": round(mispron_rate, 4),
            "word_count": total_words,
        }

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
        # Type fix: Ensure float for ratio and ratio calculation
        sophisticated_words = [w for w in words if word_frequency(w, 'en') < 0.0001]
        sophistication_ratio = float(len(sophisticated_words)) / float(len(words))
        sophistication_score = min(40.0, sophistication_ratio * 200.0)

        # 2. Response length (0–30 points)
        words_per_turn = [float(len(re.findall(r'\b[a-zA-Z]+\b', t))) for t in user_turns]
        avg_words_per_turn = mean(words_per_turn) if words_per_turn else 0.0
        length_score = min(30.0, (float(avg_words_per_turn) / 25.0) * 30.0)

        # 3. Vocabulary diversity (0–20 points)
        unique_words = set(words)
        ttr = float(len(unique_words)) / float(len(words))
        diversity_score = min(20.0, (ttr / 0.7) * 20.0)

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
        correction_score = min(10.0, float(corrections) * 2.5)

        ds = sophistication_score + length_score + diversity_score + correction_score
        return round(float(min(100.0, max(0.0, float(ds)))), 2)

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
        topic_ratio = float(len(advanced_words)) / float(len(content_words)) if content_words else 0.0
        topic_score = min(40.0, topic_ratio * 267.0)

        # 2. Sentence complexity (0–35 points) - count subordinating conjunctions
        clause_markers = {"because", "although", "however", "which", "that", 
                         "when", "while", "if", "unless", "since", "whereas",
                         "therefore", "furthermore", "nevertheless"}
        
        clauses_per_sentence = []
        for sent in sentences:
            sent_words = set(t.text.lower() for t in sent)
            clause_count = 1 + len(sent_words.intersection(clause_markers))
            clauses_per_sentence.append(float(clause_count))
        
        avg_clauses = float(mean(clauses_per_sentence)) if clauses_per_sentence else 1.0
        complexity_score = min(35.0, max(0.0, (avg_clauses - 1.0) / 1.5 * 35.0))

        # 3. Abstract vs concrete language ratio (0–25 points)
        # Concrete = PERSON, GPE, ORG, PRODUCT, LOC
        named_entities = [ent for ent in doc.ents if ent.label_ in 
                         {"PERSON", "GPE", "ORG", "PRODUCT", "LOC"}]
        total_tokens = float(len(words))
        concrete_ratio = float(sum(len(ent.text.split()) for ent in named_entities)) / total_tokens if total_tokens > 0.0 else 0.0
        abstract_score = min(25.0, (1.0 - concrete_ratio) * 30.0)

        cs = topic_score + complexity_score + abstract_score
        return round(float(min(100.0, max(0.0, float(cs)))), 2)

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
        question_score = min(35.0, (float(turns_with_questions) / float(max(len(user_turns), 1))) * 70.0)

        # 2. Topic contribution (0–35 points)
        topic_shift_markers = [
            r'\b(speaking of|on another note|that reminds me|by the way|'
            r'what about|have you ever|i was thinking|let me ask you)\b'
        ]
        topic_shifts = sum(
            len(re.findall(p, full_user_text))
            for p in topic_shift_markers
        )
        topic_score = min(35.0, float(topic_shifts) * 8.75)

        # 3. Call completion (0–30 points)
        participation_ratio = user_spoke_seconds / call_duration_seconds if call_duration_seconds > 0 else 0.0
        if participation_ratio >= 0.80:
            completion_score = 30.0
        elif participation_ratio >= 0.60:
            completion_score = 20.0
        elif participation_ratio >= 0.40:
            completion_score = 10.0
        else:
            completion_score = 0.0

        es = question_score + topic_score + completion_score
        return round(float(min(100.0, max(0.0, es))), 2)

    def compute_call_quality_score(self, pqs: float, ds: float, cs: float, es: float) -> float:
        """Final CQS combination."""
        cqs = (
            pqs * 0.35 +
            ds  * 0.30 +
            cs  * 0.25 +
            es  * 0.10
        )
        return round(float(min(100.0, max(0.0, cqs))), 2)

    def compute_realtime_preview(self, user_turns_so_far: List[str]) -> Dict[str, Any]:
        """Lightweight live health signal for Phase 1."""
        full_text = " ".join(user_turns_so_far).lower()
        words = re.findall(r'\b[a-zA-Z]+\b', full_text)

        if not words:
            return {"status": "neutral", "signal": 50.0, "hint": "Waiting for you to speak..."}

        # Filler word rate
        filler_words = ["um", "uh", "like", "you know", "basically"]
        filler_count = sum(full_text.count(fw) for fw in filler_words)
        filler_rate = float(filler_count) / float(len(words))

        # Average words per turn
        avg_turn_len = float(mean([float(len(t.split())) for t in user_turns_so_far]))

        # Vocabulary diversity (TTR)
        ttr = float(len(set(words))) / float(len(words))

        # Preview signal (0–100)
        preview = (
            max(0.0, 100.0 - filler_rate * 300.0) * 0.40 +
            min(100.0, (avg_turn_len / 20.0) * 100.0) * 0.35 +
            min(100.0, ttr * 150.0) * 0.25
        )

        if preview >= 70.0:
            status = "strong"
            hint = "Great depth — keep it up"
        elif preview >= 45.0:
            status = "good"
            hint = "Good pace, keep going"
            if avg_turn_len < 10.0:
                hint = "Try longer responses"
        else:
            status = "needs_work"
            hint = "Reduce filler words" if filler_rate > 0.05 else "Keep practicing"

        return {
            "status": status,
            "signal": round(float(preview), 1),
            "hint": hint
        }

# Singleton instance
call_quality_service = CallQualityService()
