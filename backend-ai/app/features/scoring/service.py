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

# CEFR sophistication is computed from wordfreq frequency bands (see compute_complexity_score).

class CallQualityService:
    """
    Computes Call Quality Score (CQS) according to specification 1.0.
    Four dimensions: PQS, DS, CS, ES.
    """

    # Phoneme scores below this count as a pronunciation issue (matches feedback UI).
    PHONEME_WEAK_THRESHOLD = 70.0

    def compute_pronunciation_quality_score(self, utterances: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Dimension 1: PQS — penalizes Azure mispronunciations AND weak phoneme scores.
        Weights: accuracy 25%, fluency 25%, prosody 15%, error penalty 35%.
        """
        if not utterances:
            return {
                "pqs": 0.0,
                "mean_accuracy": 0.0,
                "mean_fluency": 0.0,
                "mean_prosody": 0.0,
                "mispronunciation_rate": 0.0,
                "phoneme_issue_rate": 0.0,
                "combined_error_rate": 0.0,
                "word_count": 0,
            }

        all_word_accuracy_scores: List[float] = []
        fluency_scores: List[float] = []
        prosody_scores: List[float] = []
        total_words: int = 0
        mispronounced_words: int = 0
        phoneme_weak_words: int = 0
        skipped_proper_nouns: int = 0

        transcript_guess_parts: List[str] = []
        for utt in utterances:
            nbests = utt.get("NBest") or utt.get("Nbests") or utt.get("nbest") or [utt]
            first = nbests[0] if nbests and isinstance(nbests[0], dict) else utt
            for word in (first.get("Words", []) if isinstance(first, dict) else []) or utt.get("Words", []) or []:
                tok = word.get("Word") or word.get("word")
                if tok:
                    transcript_guess_parts.append(str(tok))
        try:
            from app.features.scoring.transcript_quality import proper_noun_skip_set

            skip_names = proper_noun_skip_set(" ".join(transcript_guess_parts))
        except Exception:
            skip_names = set()

        logger.info(f"Computing PQS for {len(utterances)} utterances")
        for utt in utterances:
            nbests = utt.get("NBest") or utt.get("Nbests") or utt.get("nbest") or [utt]
            if not nbests:
                logger.warning("Empty NBest in utterance")
                continue

            first = nbests[0]
            if not isinstance(first, dict):
                logger.warning(f"NBest[0] is not a dict: {type(first)}")
                continue

            pa_info = first.get("PronunciationAssessment") or {}
            if "FluencyScore" in pa_info:
                fluency_scores.append(float(pa_info["FluencyScore"]))
            elif utt.get("fluency_score") is not None:
                fluency_scores.append(float(utt["fluency_score"]))

            if "ProsodyScore" in pa_info:
                prosody_scores.append(float(pa_info["ProsodyScore"]))
            elif utt.get("prosody_score") is not None:
                prosody_scores.append(float(utt["prosody_score"]))

            words = first.get("Words", []) or utt.get("Words", [])
            for word in words:
                token = (word.get("Word") or word.get("word") or "").lower().strip()
                if token and token in skip_names:
                    skipped_proper_nouns += 1
                    continue

                total_words += 1
                w_pa = word.get("PronunciationAssessment") or {}
                acc = w_pa.get("AccuracyScore")
                if acc is not None:
                    all_word_accuracy_scores.append(float(acc))

                err_type = w_pa.get("ErrorType") or word.get("ErrorType")
                if err_type == "Mispronunciation":
                    mispronounced_words += 1

                phonemes = word.get("Phonemes") or []
                weak_phoneme = False
                for ph in phonemes:
                    ph_pa = ph.get("PronunciationAssessment") or {}
                    ph_score = ph_pa.get("AccuracyScore")
                    if ph_score is None:
                        ph_score = ph.get("AccuracyScore")
                    if ph_score is not None and float(ph_score) < self.PHONEME_WEAK_THRESHOLD:
                        weak_phoneme = True
                        break
                if weak_phoneme:
                    phoneme_weak_words += 1

        mean_accuracy = float(mean(all_word_accuracy_scores)) if all_word_accuracy_scores else 0.0
        mean_fluency = float(mean(fluency_scores)) if fluency_scores else 0.0

        mispron_rate = float(mispronounced_words) / float(total_words) if total_words > 0 else 0.0
        phoneme_issue_rate = (
            float(phoneme_weak_words) / float(total_words) if total_words > 0 else 0.0
        )
        combined_error_rate = max(mispron_rate, phoneme_issue_rate)
        mispron_score = float(max(0.0, 100.0 - (combined_error_rate * 250.0)))

        if prosody_scores:
            mean_prosody = float(mean(prosody_scores))
            pqs = (
                (mean_accuracy * 0.25)
                + (mean_fluency * 0.25)
                + (mean_prosody * 0.15)
                + (mispron_score * 0.35)
            )
        else:
            mean_prosody = mean_fluency
            pqs = (
                (mean_accuracy * 0.25)
                + (mean_fluency * 0.40)
                + (mispron_score * 0.35)
            )

        return {
            "pqs": round(float(min(100.0, max(0.0, pqs))), 2),
            "mean_accuracy": round(mean_accuracy, 2),
            "mean_fluency": round(mean_fluency, 2),
            "mean_prosody": round(mean_prosody, 2),
            "mispronunciation_rate": round(mispron_rate, 4),
            "phoneme_issue_rate": round(phoneme_issue_rate, 4),
            "combined_error_rate": round(combined_error_rate, 4),
            "word_count": total_words,
            "skipped_proper_nouns": skipped_proper_nouns,
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
            # Length/diversity proxy — never neutral 50.
            words = re.findall(r'\b[a-zA-Z]+\b', (full_transcript or "").lower())
            if not words:
                return 0.0
            unique = len(set(words))
            return round(float(min(70.0, 10.0 + unique * 1.5 + len(words) * 0.2)), 2)

        doc = nlp(full_transcript)
        sentences = list(doc.sents)
        words = [token.text.lower() for token in doc if token.is_alpha]

        if not sentences or not words:
            return 0.0

        # 1. Topic sophistication (0–40 points)
        content_words = [w for w in words if not nlp.vocab[w].is_stop]
        # B2-level: frequency between 0.00001 and 0.0001 (mid-frequency, non-basic)
        # C1-level: frequency < 0.00001 (low-frequency, advanced)
        advanced_words = [
            w for w in content_words
            if (0.00001 <= word_frequency(w, 'en') < 0.0001) or (word_frequency(w, 'en') < 0.00001)
        ]
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

    def compute_grammar_score(self, user_turns: List[str]) -> float:
        """
        Grammar 0–100 STRUCTURAL HEURISTIC v1 — NOT a grammatical-error-correction
        model. It combines spaCy sentence well-formedness (missing finite verbs),
        pronoun-salad, verb-density, and filtered LanguageTool matches, taking the
        MIN of the structural score and LanguageTool (only when LT found real
        grammar matches after casing/spelling filtering). Because it keys off these
        specific structural signals, it will be inconsistent across learners whose
        errors don't match them.
        """
        if not user_turns:
            return 0.0

        full_text = " ".join(user_turns).strip()
        if not full_text:
            return 0.0

        from app.features.scoring.transcript_quality import compute_structural_grammar_score

        structural = compute_structural_grammar_score(full_text)
        structural_score = float(structural.get("score", 40.0))

        lt_score: Optional[float] = None
        try:
            from app.features.assessment.grammar_analyzer import analyze_grammar

            lt = analyze_grammar(full_text)
            # Only trust LT when it found real grammar matches OR structural already low.
            # If LT finds 0 after filtering casing, don't let it pull score to 100.
            if int(lt.get("total_errors") or 0) > 0:
                lt_score = float(lt.get("score", structural_score))
        except Exception as exc:
            logger.warning("analyze_grammar failed in CQS path: %s", exc)

        if lt_score is None:
            score = structural_score
        else:
            score = min(structural_score, lt_score)

        return round(float(min(100.0, max(0.0, score))), 2)

    async def compute_grammar_score_llm(self, user_turns: List[str]) -> Dict[str, Any]:
        """
        Grammar via LLM grader (real GEC) with the structural heuristic as fallback.

        The structural score is computed first as a guaranteed floor of coverage;
        if the LLM grader is disabled or every provider fails, we return it. When
        the LLM succeeds, its score is authoritative (it can see word-order /
        agreement / tense errors the heuristic is blind to). Returns a dict with
        the score plus provenance for observability.
        """
        from app.features.scoring import grammar_metrics
        from app.core.config import settings as _settings

        structural_fallback = self.compute_grammar_score(user_turns)
        llm: Optional[Dict[str, Any]] = None
        fallback_reason = "llm_unavailable"
        if not _settings.grammar_llm_enabled:
            fallback_reason = "disabled"
        else:
            try:
                from app.features.scoring.grammar_llm import grade_grammar_llm

                llm = await grade_grammar_llm(user_turns)
                if llm is None:
                    fallback_reason = "provider_failed_or_unparseable"
            except Exception as exc:  # noqa: BLE001 — never let grading crash scoring
                logger.warning("grammar_llm invocation failed: %s", exc)
                llm = None
                fallback_reason = "exception"

        if llm is None:
            grammar_metrics.record("structural_fallback", reason=fallback_reason)
            # Evidence-minimum rule (same as comprehension): do NOT emit a grammar
            # number from the blind structural heuristic. Report not_measured so the
            # pillar is excluded from the overall instead of silently reintroducing
            # the original "blind ~70" bug this audit fixed. structural_score is kept
            # only as a debug breadcrumb and MUST NOT be used as the grammar value.
            return {
                "score": None,
                "measured": False,
                "source": "structural_fallback",
                "fallback_reason": fallback_reason,
                "debug_structural_score": structural_fallback,
            }
        grammar_metrics.record("llm", provider=llm.get("provider"))
        return {
            "score": round(float(llm["score"]), 2),
            "measured": True,
            "source": "llm",
            "provider": llm.get("provider"),
            "error_count": llm.get("error_count"),
            "examples": llm.get("examples"),
            "rationale": llm.get("rationale"),
            "debug_structural_score": structural_fallback,
        }

    def compute_vocabulary_signal(self, user_turns: List[str], depth_score: float) -> float:
        """Lexical accuracy + limited range — not raw TTR/depth."""
        from app.features.scoring.transcript_quality import compute_lexical_accuracy_score

        full_text = " ".join(user_turns)
        result = compute_lexical_accuracy_score(full_text, depth_score=depth_score)
        return float(result.get("score", 0.0))

    def compute_fluency_signal(self, pqs_result: Dict[str, Any], user_turns: List[str]) -> float:
        """
        Fluency = Azure pace/delivery minus transcript disfluency (fillers, reps,
        broken clause markers). Everyday "fluency" is not pause-timing alone.
        """
        from app.features.scoring.transcript_quality import compute_disfluency_penalty

        mean_azure_fluency = float(pqs_result.get("mean_fluency", 0.0))
        full_text = " ".join(user_turns)
        words = re.findall(r'\b[a-zA-Z]+\b', full_text.lower())
        word_count = len(words)

        disfluency = compute_disfluency_penalty(full_text)
        disfluency_penalty = float(disfluency.get("penalty", 0.0))

        filler_words = ["um", "uh", "like", "you know", "basically", "literally"]
        filler_count = sum(full_text.lower().count(fw) for fw in filler_words)
        filler_penalty = min(20.0, float(filler_count) * 1.5)

        if mean_azure_fluency > 0:
            fluency_signal = max(0.0, mean_azure_fluency - filler_penalty - disfluency_penalty)
            mean_accuracy = float(pqs_result.get("mean_accuracy", 0.0))
            combined_error_rate = float(pqs_result.get("combined_error_rate", 0.0))
            pqs_val = float(pqs_result.get("pqs", 0.0))
            # Cap pace when pronunciation/errors are weak
            if mean_accuracy < 60.0 or combined_error_rate > 0.15:
                fluency_signal = min(fluency_signal, mean_accuracy + 10.0)
            if pqs_val > 0:
                fluency_signal = min(fluency_signal, pqs_val + 15.0)
            return round(float(max(0.0, fluency_signal)), 2)

        if word_count == 0:
            return 0.0
        turns_with_words = max(1, sum(1 for t in user_turns if re.search(r'\b[a-zA-Z]+\b', t)))
        avg_words = float(word_count) / float(turns_with_words)
        score = min(85.0, 25.0 + avg_words * 2.5)
        score -= filler_penalty
        score -= disfluency_penalty
        if word_count < 10:
            score = min(score, 20.0)
        elif word_count < 25:
            score = min(score, 40.0)
        elif word_count < 50:
            score = min(score, 60.0)
        return round(float(max(0.0, score)), 2)

    def compute_fluency_breakdown(
        self,
        utterances: List[Dict[str, Any]],
        user_turns: List[str],
    ) -> Dict[str, Any]:
        """Unified pace + filler + component breakdown for CQS / call feedback."""
        from app.features.scoring.fluency_breakdown import (
            build_fluency_breakdown,
            hesitation_markers_from_breakdown,
        )

        transcript = " ".join(user_turns)
        breakdown = build_fluency_breakdown(utterances, transcript)
        breakdown["hesitation_markers"] = hesitation_markers_from_breakdown(breakdown)
        return breakdown

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
