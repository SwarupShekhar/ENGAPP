
import time
import json
import asyncio
import uuid
from typing import Dict, Any, List, Optional, Tuple
import google.generativeai as genai
import re
from collections import Counter, defaultdict

from app.core.config import settings
from app.core.logger import logger
from app.models.request import AnalysisRequest, JointAnalysisRequest, SpeakerSegment
from app.models.response import AnalysisResponse, AnalysisMetrics, JointAnalysisResponse, ParticipantAnalysis
from app.models.base import CEFRAssessment, ErrorDetail, ErrorType, ErrorSeverity, CEFRLevel
from app.cache.manager import cached
from app.features.assessment.cefr_classifier import cefr_classifier
from app.utils.robust_json_parser import robust_json_parser
from app.assessment.scoring.grammar_classifier import GrammarErrorClassifier
from app.assessment.scoring.vocabulary_analyzer import VocabularyAnalyzer
from app.assessment.scoring.confidence_calculator import ConfidenceCalculator
from app.features.tutor.pronunciation_capture import (
    extend_from_body_and_pop_store,
    merge_issue_batches,
)
from app.features.assessment.grammar_analyzer import analyze_grammar as _det_analyze_grammar, score_grammar as _det_score_grammar
from app.features.assessment.error_model import (
    ErrorEvent,
    GRAMMAR_SEVERITY,
    PRONUNCIATION_SEVERITY,
    compute_weighted_pronunciation_score,
    severity_max,
    sort_key as _error_sort_key,
)

_DET_TO_LLM_ERROR_TYPE: Dict[str, str] = {
    "tense_error": "wrong_tense",
    "pluralization_error": "plural_form_error",
    "word_order": "word_order",
    "preposition_error": "preposition_error",
    "article_missing": "article_error",
    "other_grammar": "subject_verb_disagreement",
}
_DET_TIER: Dict[str, str] = {
    "tense_error": "TIER_1",
    "pluralization_error": "TIER_1",
    "word_order": "TIER_2",
    "preposition_error": "TIER_2",
    "article_missing": "TIER_3",
    "other_grammar": "TIER_2",
}


def _det_errors_to_gemini_shape(det_errors: Dict[str, Any]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for cat, data in det_errors.items():
        if not isinstance(data, dict) or data.get("count", 0) == 0:
            continue
        for ex in data.get("examples", [])[:2]:
            out.append({
                "original": ex.get("error_text", ""),
                "corrected": ex.get("suggestion", ""),
                "error_type": _DET_TO_LLM_ERROR_TYPE.get(cat, "other_grammar"),
                "severity": _DET_TIER.get(cat, "TIER_2"),
                "explanation": (ex.get("context") or "")[:80],
                "_source": "deterministic",
            })
    return out


def _merge_grammar_errors(
    llm_errors: List[Dict[str, Any]],
    det_errors: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    seen: set = set()
    merged: List[Dict[str, Any]] = []

    def _key(e: Dict) -> str:
        return (e.get("original") or "").lower().strip()

    for e in llm_errors:
        k = _key(e)
        if k and k not in seen:
            seen.add(k)
            merged.append(e)
    for e in det_errors:
        k = _key(e)
        if k and k not in seen:
            seen.add(k)
            merged.append(e)
    return merged


def _pronunciation_penalty_from_severities(issues: List[Dict[str, Any]]) -> int:
    penalty = 0
    for it in issues:
        s = str(it.get("severity") or "medium").lower()
        if s == "high":
            penalty += 15
        elif s == "low":
            penalty += 3
        else:
            penalty += 8
    return penalty


def _justification_from_captured_pron(deduped: List[Dict[str, Any]]) -> str:
    if not deduped:
        return ""
    bits: List[str] = []
    for it in deduped[:6]:
        w = str(it.get("word") or "").strip()
        h = str(it.get("heard") or "").strip()
        rc = str(it.get("rule_category") or "").strip()
        if h and h.lower() != w.lower():
            bits.append(f"you said '{h}' instead of '{w}'" + (f" ({rc})" if rc else ""))
        elif w:
            bits.append(w)
    return (
        "Pronunciation feedback: "
        + "; ".join(bits)
        + "."
        if bits
        else ""
    )


def _pronunciation_issues_api_shape(deduped: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for it in deduped:
        out.append(
            {
                "id": str(uuid.uuid4()),
                "word": it.get("word"),
                "issueType": it.get("issueType", "substitution"),
                "severity": it.get("severity", "medium"),
                "suggestion": str(it.get("suggestion") or ""),
                "confidence": float(it.get("confidence") or 0.8),
                "rule_category": it.get("rule_category"),
                "heard": it.get("heard"),
            }
        )
    return out


PHASE_3_ANALYSIS_PROMPT = """
You are an English language assessment expert. Analyze this engineering student's spoken description.

TRANSCRIPT:
{transcript}

Provide analysis in this EXACT JSON format:
{{
  "grammatical_errors": [
    {{
      "original": "exact phrase with error",
      "corrected": "correct version",
      "error_type": "wrong_tense_context|article_error|preposition_error|etc",
      "severity": "TIER_1|TIER_2|TIER_3",
      "explanation": "brief explanation"
    }}
  ],
  "sentence_structures": [
    {{
      "sentence": "full sentence",
      "type": "simple|compound|complex|compound-complex",
      "features": ["subordinate_clause", "passive_voice", "conditional"]
    }}
  ],
  "vocabulary_analysis": {{
    "advanced_words": ["list", "of", "B2+", "words"],
    "domain_terms": ["technical", "engineering", "terms"],
    "collocation_errors": [
      {{
        "incorrect": "make research",
        "correct": "conduct research"
      }}
    ]
  }},
  "talkStyle": "DRIVER|PASSENGER",
  "vocabularyCEFR": "A1|A2|B1|B2|C1|C2",
  "justification": "Overall synthesis of performance"
}}

Focus on:
1. Error severity (Tier 1 = blocks comprehension, Tier 3 = minor slip)
2. Complex structure usage (award points for correct usage)
3. Collocation accuracy (word partnerships)
4. Domain-appropriate vocabulary
"""

def _aggregate_pronunciation_patterns(
    flagged_errors: List[Dict[str, Any]], top_n: int = 2
) -> List[Dict[str, Any]]:
    """Group flagged errors by category, return top N dominant patterns with real spoken examples."""
    by_cat: Dict[str, List[Dict]] = defaultdict(list)
    for e in flagged_errors:
        cat = e.get("rule_category", "unknown")
        by_cat[cat].append(e)
    sorted_cats = sorted(by_cat.items(), key=lambda x: -len(x[1]))
    patterns = []
    for cat, errors in sorted_cats[:top_n]:
        with_sub = [e for e in errors if e.get("spoken", "") != e.get("correct", "")]
        examples_src = with_sub if with_sub else errors
        examples = [
            {"spoken": e.get("spoken", ""), "correct": e.get("correct", "")}
            for e in examples_src[:3]
        ]
        patterns.append({"category": cat, "count": len(errors), "examples": examples})
    return patterns


def _build_unified_errors(
    grammar_errors: Dict[str, Any],
    flagged_errors: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Merge grammar errors dict + pronunciation flagged_errors into one sorted list."""
    merged: Dict[str, Dict] = {}

    for cat, data in grammar_errors.items():
        if not isinstance(data, dict) or data.get("count", 0) == 0:
            continue
        for ex in data.get("examples", [])[:1]:
            word = (ex.get("error_text") or "").strip("'\" ").lower()
            if not word:
                continue
            sev = GRAMMAR_SEVERITY.get(cat, "medium")
            if word in merged:
                merged[word]["error_type"] = "both"
                merged[word]["grammar_category"] = cat
            else:
                merged[word] = {
                    "word": word,
                    "error_type": "grammar",
                    "grammar_category": cat,
                    "pronunciation_category": None,
                    "severity": sev,
                    "confidence": 1.0,
                    "example": (ex.get("context") or "")[:100],
                }

    for e in flagged_errors:
        word = (e.get("correct") or e.get("word") or "").lower().strip()
        if not word:
            continue
        cat = e.get("rule_category", "unknown")
        sev = PRONUNCIATION_SEVERITY.get(cat, "medium")
        conf = min(float(e.get("confidence") or 50) / 100.0, 1.0)
        if word in merged:
            merged[word]["error_type"] = "both"
            merged[word]["pronunciation_category"] = cat
            merged[word]["severity"] = severity_max(merged[word].get("severity", "low"), sev)
        else:
            spoken = e.get("spoken", "")
            merged[word] = {
                "word": word,
                "error_type": "pronunciation",
                "grammar_category": None,
                "pronunciation_category": cat,
                "severity": sev,
                "confidence": conf,
                "example": f"spoken: '{spoken}' → correct: '{word}'" if spoken and spoken != word else word,
            }

    unified = list(merged.values())
    unified.sort(key=_error_sort_key)
    return unified


def _extract_proper_nouns(text: str) -> frozenset:
    """Extract proper nouns from transcript via spaCy NER (reuses grammar_analyzer singleton)."""
    try:
        from app.features.assessment.grammar_analyzer import _nlp
        if _nlp is None or not text:
            return frozenset()
        doc = _nlp(text[:4000])
        return frozenset(
            ent.text.lower()
            for ent in doc.ents
            if ent.label_ in {"GPE", "ORG", "PERSON", "NORP", "FAC", "LOC"}
        )
    except Exception:
        return frozenset()


_PATTERN_LABELS: Dict[str, str] = {
    "th_to_d": "th→d substitution",
    "th_to_t": "th→t substitution",
    "v_to_w": "v→w substitution",
    "w_to_v": "w→v substitution",
    "h_dropping": "h-dropping",
    "ae_to_e": "vowel ae→e",
    "i_to_ee": "vowel i→ee",
    "retroflex_substitution": "retroflex consonants",
    "vowel_shift": "vowel shift",
    "general_mispronunciation": "mispronunciation",
    "syllable_compression": "syllable compression",
    "final_cluster_reduction": "final consonant reduction",
    "consonant_cluster_simplification": "cluster simplification",
    "unknown_substitution": "unknown substitution",
}

_MOUTH_TIPS: Dict[str, str] = {
    "th_to_d": "put your tongue between your teeth for 'th' sounds",
    "th_to_t": "put your tongue between your teeth for 'th' sounds",
    "v_to_w": "bite your lower lip lightly for 'v' sounds",
    "w_to_v": "round your lips fully for 'w' — no teeth contact",
    "h_dropping": "push a breath of air out before starting 'h' words",
    "ae_to_e": "open your mouth wider for the 'a' sound in words like 'cat'",
    "i_to_ee": "relax your lips — don't stretch them for the short 'i' in 'bit'",
    "retroflex_substitution": "keep your tongue tip at the gum ridge, not curled back",
    "vowel_shift": "open your mouth more on stressed vowels",
    "general_mispronunciation": "slow the word down and say each syllable separately",
    "syllable_compression": "say every syllable — do not skip any",
    "final_cluster_reduction": "finish the final consonant fully before stopping",
    "consonant_cluster_simplification": "say both consonants at the start of the word",
    "unknown_substitution": "listen to the word and repeat it slowly three times",
}


class AnalysisService:
    """
    Multi-stage analysis service with validation and confidence scoring.
    
    Architecture:
    1. Quick CEFR classification (rule-based)
    2. Parallel specialized analyses (grammar, vocab, fluency)
    3. Error verification (checks if suggested corrections are actually better)
    4. Confidence scoring (measures internal consistency)
    5. Final synthesis
    """

    def __init__(self):
        self.model = None
        self.fast_model = None
        
        if settings.google_api_key:
            genai.configure(api_key=settings.google_api_key)
            # Use fast model for quick analyses (using main flash model as it's fast enough and available)
            chat_model = (settings.google_gemini_chat_model or "gemini-2.5-flash").strip()
            self.fast_model = genai.GenerativeModel(chat_model)
            self.model = genai.GenerativeModel(chat_model)
        else:
            logger.warning("Google API key not configured. AnalysisService is disabled.")
            
        self.grammar_classifier = GrammarErrorClassifier()
        self.vocab_analyzer = VocabularyAnalyzer()
        self.confidence_calculator = ConfidenceCalculator()
    
    # ─────────────────────────────────────────────────────────────
    # STAGE 1: SPECIALIZED ANALYSIS (Parallel)
    # ─────────────────────────────────────────────────────────────
    
    def _create_grammar_prompt(self, text: str, cefr_level: CEFRLevel) -> str:
        """
        Constrained grammar analysis with Indian English calibration anchors.
        Hard rule: non-empty grammatical_errors → grammar_score ≤ 85.
        """
        return f"""You are a strict grammar examiner evaluating Indian English speakers.

Expected CEFR level: {cefr_level.value}
Text: "{text}"

TASK: Detect ALL grammar errors. Score grammar quality 0-100.

INDIAN ENGLISH ERROR PATTERNS TO DETECT (very common, do NOT miss these):
- Tense confusion: "I was joined in 2019" (should be "I joined"), "I am working since 5 years" (should be "I have been working for")
- Missing/wrong article: "I have one year experience" (should be "one year of experience"), "I work in sales field"
- Wrong preposition: "I am good in English", "discuss about the issue"
- Plural/uncountable errors: "informations", "staffs", "advices", "feedbacks"
- Subject-verb disagreement: "the team are", "he don't know"
- Missing auxiliary: "I working here", "she not coming"
- Redundant conjunction: "although X, but Y", "even though X, still Y"

CALIBRATION ANCHORS (these are ground truth — match your scores to these):
- "I am in this company since 3 year and handling team of 7 staffs." → 18/100 (tense + article + plural errors)
- "I was joined this company in 2019 and I am good in communication." → 25/100 (wrong passive + preposition error)
- "I have 5 year of experience in sales and I am handling many clients." → 45/100 (article + tense inconsistency)
- "Although I have limited experience, but I am eager to learn new things." → 52/100 (redundant conjunction)
- "I joined this company in 2019 and have been managing a team of seven people." → 78/100 (correct, moderate complexity)
- "Having led cross-functional teams, I bring a proven track record in stakeholder management." → 92/100 (advanced, correct)

HARD RULES:
1. If grammatical_errors list is NON-EMPTY → grammar_score MUST be ≤ 85. No exceptions.
2. grammar_score = 100 is ONLY valid when zero errors exist AND text is grammatically perfect.
3. Each TIER_1 error (tense, auxiliary, plural) subtracts 15-20 points from 100.
4. Each TIER_2 error (article, preposition, agreement) subtracts 8-12 points.
5. Each TIER_3 error (style, redundancy) subtracts 3-5 points.
6. Word count < 30: cap at 70 (insufficient evidence for higher).

COMPLEXITY CEILING:
- Only simple sentences (no subordinate clauses): max 60/100
- Some complex structures but errors present: max 72/100
- Rich complex structures, minimal errors: up to 90/100
- Native-level accuracy + complexity: 90-100/100

Respond ONLY with JSON:
{{
  "grammar_score": <int 0-100>,
  "grammatical_errors": [
    {{
      "original": "exact phrase with error",
      "corrected": "correct version",
      "error_type": "wrong_tense|missing_auxiliary|article_error|preposition_error|plural_form_error|subject_verb_disagreement|redundant_conjunction|uncountable_plural|word_order",
      "severity": "TIER_1|TIER_2|TIER_3",
      "explanation": "brief explanation"
    }}
  ],
  "sentence_structures": [
    {{
      "sentence": "full sentence",
      "type": "simple|compound|complex|compound-complex",
      "features": ["subordinate_clause", "passive_voice", "conditional"]
    }}
  ],
  "complexity_level": "simple|intermediate|advanced",
  "justification": "1 sentence citing specific errors found and why the score is what it is"
}}"""

    def _create_vocabulary_prompt(self, text: str, cefr_level: CEFRLevel) -> str:
        """Focused vocabulary analysis"""
        return f"""You are a vocabulary expert. Analyze ONLY vocabulary richness.

Expected level: {cefr_level.value}

Text: "{text}"

Rate vocabulary 0-100 based on:
1. Lexical diversity (unique words / total words)
2. Sophistication (A1 common vs C2 advanced words)
3. Appropriateness to context
4. Collocations and idiomatic usage

CALIBRATION:
- "I like it. It is good. Very good.": 20/100 - Repetitive, basic
- "I enjoyed the experience. It was beneficial and enlightening.": 65/100 - Varied, B2 level
- "The conference proved invaluable, offering profound insights.": 85/100 - Sophisticated, C1+

Word count: {len(text.split())}

RULES:
- <15 words: max 40/100 (too short to assess)
- Repetitive words (used 3+ times): -10 per word
- Only A1/A2 words: max 45/100
- Generic words ("good", "nice", "thing"): -5 each

Respond ONLY with JSON:
{{
  "vocabulary_score": <int 0-100>,
  "word_count": <int>,
  "unique_words": <int>,
  "vocabulary_analysis": {{
    "advanced_words": ["list", "of", "B2+", "words"],
    "domain_terms": ["technical", "engineering", "terms"],
    "collocation_errors": [
      {{
        "incorrect": "make research",
        "correct": "conduct research"
      }}
    ]
  }},
  "vocabularyCEFR": "A1|A2|B1|B2|C1|C2",
  "justification": "1 sentence"
}}"""

    def _create_fluency_prompt(self, text: str, context: Optional[str]) -> str:
        """Focused fluency analysis with Azure data if available"""
        
        azure_section = ""
        if context:
            azure_section = f"""
Azure Speech Data Available:
{context}

Use this to inform:
- Hesitation detection (pauses, fillers)
- Speaking rate consistency
- Pronunciation fluency
"""
        
        return f"""You are a fluency expert. Analyze speech flow and naturalness.

Text: "{text}"
{azure_section}

Rate fluency 0-100 based on:
1. Filler words (um, uh, like, basically)
2. False starts and self-corrections
3. Repetitions and hesitations
4. Natural discourse markers (however, moreover, by the way)
5. Coherence and logical flow

CALIBRATION:
- "Um... I think... uh... it's like... good?": 25/100 - Excessive fillers
- "I believe it's beneficial. However, there are concerns.": 75/100 - Natural flow with markers
- Short utterance (<20 words): max 50/100 regardless of quality

Word count: {len(text.split())}

Respond ONLY with JSON:
{{
  "fluency_score": <int 0-100>,
  "filler_count": {{"um": int, "uh": int, "like": int}},
  "self_corrections": <int>,
  "discourse_markers": ["however", "moreover"],
  "coherence_rating": "poor|fair|good|excellent",
  "justification": "1 sentence"
}}"""

    def _create_pronunciation_prompt(
        self,
        text: str,
        native_lang: str,
        azure_data: Optional[str],
        pa_errors: Optional[list] = None,
        pa_fluency_score: Optional[float] = None,
        pa_prosody_score: Optional[float] = None,
    ) -> str:
        """Focused pronunciation analysis"""
        
        l1_patterns = {
            "Hindi": "retroflex consonants, v/w confusion, th→d/t substitution",
            "Spanish": "b/v confusion, final consonant dropping, vowel pure-ness",
            "Chinese": "l/r confusion, final consonants, tone-influenced stress",
            "French": "r-sound, th→z/s, final consonant liaison",
            "Arabic": "p/b confusion, vowel length, emphatic consonants",
        }
        
        expected_patterns = l1_patterns.get(native_lang, "General non-native patterns")
        
        azure_section = ""
        if azure_data:
            azure_section = f"""
Azure Pronunciation Data:
{azure_data}

This is GROUND TRUTH. Weight Azure data at 80% in your final score.
"""

        errors_section = ""
        if pa_errors:
            acoustic_lines = ["\nAcoustic assessment results (GROUND TRUTH — use these directly):"]
            if pa_fluency_score is not None:
                acoustic_lines.append(f"  Fluency score: {pa_fluency_score:.1f}/100")
            if pa_prosody_score is not None:
                acoustic_lines.append(f"  Prosody score: {pa_prosody_score:.1f}/100")

            dominant = _aggregate_pronunciation_patterns(pa_errors, top_n=2)
            if dominant:
                acoustic_lines.append(
                    "\nDOMINANT ERROR PATTERNS (from acoustic analysis — use ONLY these, do not invent others):"
                )
                for p in dominant:
                    ex_str = ", ".join(
                        f'"{ex["spoken"]}"→"{ex["correct"]}"'
                        for ex in p["examples"]
                        if ex.get("spoken") and ex.get("correct") and ex["spoken"] != ex["correct"]
                    )
                    count_label = f"({p['count']} word{'s' if p['count'] != 1 else ''} affected)"
                    acoustic_lines.append(
                        f"  [{p['category']}] {count_label}"
                        + (f": e.g. {ex_str}" if ex_str else "")
                    )
                acoustic_lines.append(
                    "\nIn 'justification': name ONLY the pattern labels above, cite the example words shown."
                )
                acoustic_lines.append(
                    "In 'problematic_words': include the specific words from the examples above."
                )
            errors_section = "\n".join(acoustic_lines) + "\n"

        return f"""You are a pronunciation expert specializing in L1 transfer analysis.

Native language: {native_lang}
Expected L1 patterns: {expected_patterns}

Text: "{text}"
{azure_section}{errors_section}
Rate pronunciation 0-100.

IMPORTANT:
- Accent ≠ Error. Hindi accent is fine if intelligible.
- Only penalize errors that impede understanding.
- If Azure data shows word-level scores, use those primarily.
- If known errors list is provided, address each word specifically in your feedback.

WITHOUT Azure data, you can only give rough estimates based on typical L1 patterns.
WITH Azure data, you have objective evidence.

Respond ONLY with JSON:
{{
  "pronunciation_score": <int 0-100>,
  "confidence": <float 0-1>,
  "problematic_words": [
    {{"word": "...", "issue": "...", "ipa_target": "..."}}
  ],
  "l1_influence": "description of detected L1 patterns",
  "accent_vs_error": "Clarify which features are accent (acceptable) vs errors",
  "justification": "1-2 sentences referencing specific mispronounced words"
}}"""

    # ─────────────────────────────────────────────────────────────
    # STAGE 2: ERROR VERIFICATION
    # ─────────────────────────────────────────────────────────────
    
    async def _verify_error_corrections(self, errors: List[Dict]) -> List[Dict]:
        """
        Verify that suggested corrections are actually better.
        Prevents false positives like "I went → I go" (worse).
        """
        if not errors:
            return []
        
        verified_errors = []
        
        for error in errors[:10]:  # Limit to 10 most important
            original = error.get("original", "")
            corrected = error.get("corrected", "")
            
            if not original or not corrected:
                continue
            
            # Quick check: is correction actually different?
            if original.lower().strip() == corrected.lower().strip():
                continue  # Skip non-changes
            
            verify_prompt = f"""Is this correction valid?

Original: "{original}"
Corrected: "{corrected}"

Answer with JSON:
{{
  "is_valid": true|false,
  "reason": "why correction is better/worse"
}}"""
            
            try:
                response = await asyncio.wait_for(
                    self.fast_model.generate_content_async(verify_prompt),
                    timeout=5.0
                )
                result = robust_json_parser(response.text)
                
                if result.get("is_valid"):
                    verified_errors.append(error)
                else:
                    logger.warning(f"Rejected invalid correction: {original} → {corrected}")
            
            except Exception as e:
                logger.error(f"Verification failed for error: {e}")
                # If verification fails, keep the error (benefit of doubt)
                verified_errors.append(error)
        
        return verified_errors

    # ─────────────────────────────────────────────────────────────
    # STAGE 3: CONFIDENCE SCORING
    # ─────────────────────────────────────────────────────────────
    
    # STAGE 4: FINAL SYNTHESIS
    # ─────────────────────────────────────────────────────────────
    
    async def _synthesize_scores(
        self,
        grammar_data: Dict,
        vocab_data: Dict,
        fluency_data: Dict,
        pronunciation_data: Dict,
        initial_cefr: CEFRLevel
    ) -> Tuple[AnalysisMetrics, CEFRAssessment]:
        """Combine individual analyses into final metrics"""
        
        grammar_score = min(max(grammar_data.get("overall_grammar", grammar_data.get("grammar_score", 50)), 0), 100)
        vocab_score = min(max(vocab_data.get("overall_vocabulary", vocab_data.get("vocabulary_score", 50)), 0), 100)
        fluency_score = min(max(fluency_data.get("fluency_score", 50), 0), 100)
        pronunciation_score = min(max(pronunciation_data.get("pronunciation_score", 50), 0), 100)
        
        # Calculate overall score (weighted)
        overall_score = (
            grammar_score * 0.25 +
            vocab_score * 0.20 +
            fluency_score * 0.25 +
            pronunciation_score * 0.30
        )
        
        # Calculate confidence
        confidence_result = self.confidence_calculator.calculate_confidence({
            "audio_quality": pronunciation_data.get("accuracy_score", 85),
            "duration": pronunciation_data.get("processing_time", 30),
            "word_count": vocab_data.get("word_count", 0)
        })

        metrics = AnalysisMetrics(
            wpm=vocab_data.get("word_count", 0) / 1.5,
            unique_words=vocab_data.get("unique_words", 0),
            grammar_score=grammar_score,
            pronunciation_score=pronunciation_score,
            fluency_score=fluency_score,
            vocabulary_score=vocab_score,
            overall_score=overall_score,
            grammar_breakdown=grammar_data.get("breakdown"),
            vocab_breakdown=vocab_data.get("breakdown"),
            confidence_metrics=confidence_result
        )
        
        # Determine CEFR level
        final_cefr = cefr_classifier.classify(metrics)
        # Update CEFR confidence from our new calculator
        final_cefr.confidence = confidence_result["overall_confidence"]["score"] / 100.0
        
        return metrics, final_cefr

    # ─────────────────────────────────────────────────────────────
    # MAIN ANALYSIS METHOD
    # ─────────────────────────────────────────────────────────────
    
    @cached(prefix="analysis_v2", ttl=settings.cache_ttl_analysis)
    async def analyze(self, request: AnalysisRequest) -> AnalysisResponse:
        """
        Multi-stage analysis with validation.
        
        Flow:
        1. Quick CEFR classification
        2. Parallel specialized analyses (grammar, vocab, fluency, pronunciation)
        3. Error verification
        4. Confidence calculation
        5. Final synthesis
        """
        if not self.model:
            raise RuntimeError("Analysis service is not configured.")
        
        start_time = time.time()
        
        # Stage 1: Baseline CEFR
        cefr_assessment = cefr_classifier.classify(request.text)

        captured_for_pron = extend_from_body_and_pop_store(
            request.session_id,
            request.pronunciation_issues,
        )
        
        # Stage 2: Parallel specialized analyses
        tasks = [
            self._analyze_grammar(request.text, cefr_assessment.level, secondary_text=request.secondary_text),
            self._analyze_vocabulary(request.text, cefr_assessment.level),
            self._analyze_fluency(request.text, request.context),
            self._analyze_pronunciation(
                request.text,
                request.user_native_language or "Unknown",
                request.context,
                captured_issues=captured_for_pron,
                pa_errors=request.pa_flagged_errors or [],
                pa_pronunciation_score=request.pa_pronunciation_score,
                pa_fluency_score=request.pa_fluency_score,
                pa_prosody_score=request.pa_prosody_score,
            ),
        ]

        captured_pron_normalized: List[Dict[str, Any]] = []
        
        try:
            grammar_data, vocab_data, fluency_data, pronunciation_data = await asyncio.gather(
                *tasks,
                return_exceptions=True
            )
            
            # Handle exceptions
            if isinstance(grammar_data, Exception):
                logger.error(f"Grammar analysis failed: {grammar_data}")
                grammar_data = {"grammar_score": 50, "errors": [], "justification": "Analysis failed"}
            
            if isinstance(vocab_data, Exception):
                logger.error(f"Vocabulary analysis failed: {vocab_data}")
                vocab_data = {"vocabulary_score": 50, "word_count": 0, "unique_words": 0}
            
            if isinstance(fluency_data, Exception):
                logger.error(f"Fluency analysis failed: {fluency_data}")
                fluency_data = {"fluency_score": 50}
            
            if isinstance(pronunciation_data, Exception):
                logger.error(f"Pronunciation analysis failed: {pronunciation_data}")
                pronunciation_data = {"pronunciation_score": 50, "confidence": 0.3}

            if isinstance(pronunciation_data, dict):
                captured_pron_normalized = (
                    pronunciation_data.pop(
                        "_captured_pronunciation_issues_normalized", None
                    )
                    or []
                )

            # Backfill pronunciation_issues from PA flagged_errors when live-tutor path is empty
            if not captured_pron_normalized and request.pa_flagged_errors:
                captured_pron_normalized = [
                    {
                        "word": (e.get("correct") or e.get("word") or ""),
                        "heard": (e.get("spoken") or e.get("spoken_approx") or ""),
                        "rule_category": e.get("rule_category", "general_mispronunciation"),
                        "severity": "high" if float(e.get("confidence") or 100) < 30 else "medium",
                        "confidence": min(float(e.get("confidence") or 50) / 100, 1.0),
                        "issueType": "substitution",
                        "suggestion": f"Practice the word '{e.get('correct', '')}'",
                    }
                    for e in request.pa_flagged_errors
                ]

        except Exception as e:
            logger.error(f"Parallel analysis failed: {e}", exc_info=True)
            # Return basic fallback
            return self._create_fallback_response(request.text, cefr_assessment)
            
        # Apply enhanced classifiers
        gemini_grammar = grammar_data.copy()
        grammar_data = self.grammar_classifier.classify_errors(gemini_grammar)
        grammar_data["justification"] = gemini_grammar.get("justification", "")
        # Preserve the blended deterministic+LLM score — classifier only provides breakdown
        grammar_data["overall_grammar"] = gemini_grammar.get("grammar_score", grammar_data.get("overall_grammar", 50))
        
        # Vocabulary: Merge LLM analysis with specialized analyzer
        # First preserve LLM-derived vocabulary results
        llm_vocab = vocab_data.copy() if isinstance(vocab_data, dict) else {}
        vocab_data = self.vocab_analyzer.analyze_vocabulary(request.text)
        # Merge: prefer LLM fields where available, but add analyzer results
        if llm_vocab:
            llm_vocab_analysis = llm_vocab.get("vocabulary_analysis", {}) or {}
            vocab_data["llm_advanced_words"] = llm_vocab_analysis.get("advanced_words", [])
            vocab_data["llm_domain_terms"] = llm_vocab_analysis.get("domain_terms", [])
            vocab_data["llm_collocation_errors"] = llm_vocab_analysis.get("collocation_errors", [])
        vocab_data["word_count"] = len(request.text.split())
        vocab_data["unique_words"] = len(set(request.text.lower().split()))
        vocab_data["justification"] = llm_vocab.get("justification", "Vocabulary enrichment and MTLD analysis complete.")
        
        # Stage 3: Verify errors
        all_errors = gemini_grammar.get("grammatical_errors", [])
        verified_errors = await self._verify_error_corrections(all_errors)
        
        
        # Stage 5: Synthesize final scores
        metrics, final_cefr = await self._synthesize_scores(
            grammar_data,
            vocab_data,
            fluency_data,
            pronunciation_data,
            cefr_assessment.level
        )
        
        # Build unified errors and dominant patterns BEFORE feedback
        unified = _build_unified_errors(
            gemini_grammar.get("errors", {}),
            request.pa_flagged_errors or [],
        )
        dominant = _aggregate_pronunciation_patterns(request.pa_flagged_errors or [], top_n=2)

        # Build feedback using dominant patterns
        feedback = self._generate_feedback(
            grammar_data,
            vocab_data,
            fluency_data,
            pronunciation_data,
            metrics,
            dominant_patterns=dominant,
        )

        # Build strengths and weaknesses
        strengths, weaknesses = self._extract_strengths_weaknesses(
            grammar_data,
            vocab_data,
            fluency_data,
            pronunciation_data
        )
        
        # Build final response
        cefr_assessment.level = final_cefr.level
        cefr_assessment.score = metrics.overall_score
        cefr_assessment.confidence = final_cefr.confidence
        cefr_assessment.strengths = strengths
        cefr_assessment.weaknesses = weaknesses
        
        pron_api = (
            _pronunciation_issues_api_shape(captured_pron_normalized)
            if captured_pron_normalized
            else []
        )
        pj = (
            str(pronunciation_data.get("justification", ""))
            if isinstance(pronunciation_data, dict)
            else ""
        )

        return AnalysisResponse(
            cefr_assessment=cefr_assessment,
            errors=[self._convert_to_error_detail(e) for e in verified_errors],
            metrics=metrics,
            feedback=feedback,
            strengths=strengths,
            improvement_areas=weaknesses,
            recommended_tasks=self._generate_tasks(verified_errors, weaknesses),
            accent_notes=(
                pronunciation_data.get("l1_influence")
                if isinstance(pronunciation_data, dict)
                else None
            ),
            processing_time=time.time() - start_time,
            scores={"pronunciation": int(round(metrics.pronunciation_score))},
            pronunciation_issues=pron_api,
            ai_feedback={"pronunciation": {"justification": pj}},
            unified_errors=unified or None,
        )
    
    # ─────────────────────────────────────────────────────────────
    # HELPER METHODS
    # ─────────────────────────────────────────────────────────────
    
    async def _analyze_grammar(
        self, text: str, cefr: CEFRLevel, secondary_text: str | None = None
    ) -> Dict:
        prompt = self._create_grammar_prompt(text, cefr)
        task_list: list = [
            asyncio.to_thread(_det_analyze_grammar, text),
            asyncio.wait_for(self.fast_model.generate_content_async(prompt), timeout=15.0),
        ]
        use_secondary = bool(
            secondary_text
            and secondary_text.strip()
            and secondary_text.strip().lower() != text.strip().lower()
        )
        if use_secondary:
            task_list.append(asyncio.to_thread(_det_analyze_grammar, secondary_text))

        results = await asyncio.gather(*task_list, return_exceptions=True)
        det_result = results[0]
        llm_response = results[1]
        det_secondary = results[2] if use_secondary else None

        if isinstance(llm_response, Exception):
            logger.warning("Gemini grammar analysis failed: %s", llm_response)
            llm_data: Dict = {"grammar_score": 50, "grammatical_errors": [], "justification": ""}
        else:
            llm_data = robust_json_parser(llm_response.text)

        if isinstance(det_result, Exception):
            logger.warning("Deterministic grammar (primary) failed: %s", det_result)
            det_result = {"score": 50, "errors": {}, "total_errors": 0, "justification": ""}

        # Augment primary det errors with secondary (Deepgram) det errors
        if det_secondary and not isinstance(det_secondary, Exception):
            for cat, sec_data in det_secondary.get("errors", {}).items():
                sec_count = sec_data.get("count", 0)
                if sec_count == 0:
                    continue
                pri = det_result["errors"].setdefault(cat, {"count": 0, "examples": []})
                pri["count"] = max(pri["count"], sec_count)
                seen = {ex.get("error_text", "") for ex in pri["examples"]}
                for ex in sec_data.get("examples", []):
                    if ex.get("error_text", "") not in seen:
                        pri["examples"].append(ex)
            # Recompute deterministic score with augmented error counts
            error_counts = {c: det_result["errors"][c]["count"] for c in det_result["errors"]}
            word_count = max(det_result.get("word_count", 1), len(text.split()))
            det_result["score"] = _det_score_grammar(error_counts, word_count)
            det_result["total_errors"] = sum(error_counts.values())
            logger.info(
                "Deepgram secondary grammar: +%d total errors after merge",
                det_secondary.get("total_errors", 0),
            )

        det_errors_shaped = _det_errors_to_gemini_shape(det_result.get("errors", {}))
        llm_errors = llm_data.get("grammatical_errors", [])
        merged_errors = _merge_grammar_errors(llm_errors, det_errors_shaped)

        det_score = float(det_result.get("score", 50))
        llm_score = float(llm_data.get("grammar_score", 50))
        blended = round(det_score * 0.6 + llm_score * 0.4)
        if merged_errors:
            blended = min(blended, 85)

        return {
            "grammar_score": blended,
            "grammatical_errors": merged_errors,
            "sentence_structures": llm_data.get("sentence_structures", []),
            "complexity_level": llm_data.get("complexity_level", "simple"),
            "justification": det_result.get("justification") or llm_data.get("justification", ""),
        }
    
    async def _analyze_vocabulary(self, text: str, cefr: CEFRLevel) -> Dict:
        prompt = self._create_vocabulary_prompt(text, cefr)
        response = await asyncio.wait_for(
            self.fast_model.generate_content_async(prompt),
            timeout=15.0
        )
        return robust_json_parser(response.text)
    
    async def _analyze_fluency(self, text: str, context: Optional[str]) -> Dict:
        prompt = self._create_fluency_prompt(text, context)
        response = await asyncio.wait_for(
            self.fast_model.generate_content_async(prompt),
            timeout=15.0
        )
        return robust_json_parser(response.text)
    
    async def _analyze_pronunciation(
        self,
        text: str,
        native_lang: str,
        azure_data: Optional[str],
        captured_issues: Optional[List[Dict[str, Any]]] = None,
        pa_errors: Optional[List[Dict[str, Any]]] = None,
        pa_pronunciation_score: Optional[float] = None,
        pa_fluency_score: Optional[float] = None,
        pa_prosody_score: Optional[float] = None,
    ) -> Dict:
        raw = [x for x in (captured_issues or []) if x]
        if raw:
            deduped = merge_issue_batches(raw)
            penalty = _pronunciation_penalty_from_severities(deduped)
            score = float(max(0, 100 - penalty))
            justification = _justification_from_captured_pron(deduped)
            return {
                "pronunciation_score": score,
                "confidence": min(0.95, 0.82 + 0.01 * min(len(deduped), 8)),
                "problematic_words": [
                    {
                        "word": i.get("word"),
                        "issue": i.get("heard", ""),
                        "ipa_target": "",
                    }
                    for i in deduped[:30]
                ],
                "l1_influence": (
                    f"Pronunciation items captured during the live session "
                    f"(native language context: {native_lang})."
                ),
                "accent_vs_error": (
                    "Flagged items come from tutor inline corrections and/or "
                    "phoneme approximation map hits."
                ),
                "justification": justification,
                "accuracy_score": score,
                "processing_time": 0,
                "_captured_pronunciation_issues_normalized": deduped,
            }

        # Confidence floor: filter general_mispronunciation below 40 (low-quality detections)
        filtered_pa = [
            e for e in (pa_errors or [])
            if not (
                e.get("rule_category") == "general_mispronunciation"
                and float(e.get("confidence") or 100) < 40
            )
        ]

        prompt = self._create_pronunciation_prompt(
            text, native_lang, azure_data,
            pa_errors=filtered_pa or None,
            pa_fluency_score=pa_fluency_score,
            pa_prosody_score=pa_prosody_score,
        )
        response = await asyncio.wait_for(
            self.fast_model.generate_content_async(prompt),
            timeout=15.0
        )
        result = robust_json_parser(response.text)
        if pa_pronunciation_score is not None:
            result["pronunciation_score"] = float(pa_pronunciation_score)
        elif filtered_pa:
            result["pronunciation_score"] = compute_weighted_pronunciation_score(filtered_pa)
        return result
    
    def _generate_feedback(
        self,
        grammar,
        vocab,
        fluency,
        pronunciation,
        metrics,
        dominant_patterns: Optional[List[Dict[str, Any]]] = None,
    ) -> str:
        """Pattern-based feedback: top 2 pronunciation patterns + WPM band + drill sentence."""
        if not dominant_patterns:
            if metrics.overall_score >= 80:
                return "Your English is clear and well-structured. Keep pushing toward natural flow."
            if metrics.overall_score >= 60:
                return "You're communicating effectively — focus on consistency in your strongest areas."
            return "Keep practicing daily. Target your most common patterns one at a time."

        parts: List[str] = []
        p1 = dominant_patterns[0]
        cat1 = p1["category"]
        label1 = _PATTERN_LABELS.get(cat1, cat1.replace("_", " "))
        tip1 = _MOUTH_TIPS.get(cat1, "focus on each syllable carefully")
        ex1 = next(
            (e for e in p1.get("examples", []) if e.get("spoken") and e.get("correct") and e["spoken"] != e["correct"]),
            None,
        )
        if ex1:
            parts.append(f"You said '{ex1['spoken']}' instead of '{ex1['correct']}' — classic {label1}; {tip1}.")
        else:
            parts.append(f"Watch out for {label1} — {tip1}.")

        if len(dominant_patterns) > 1:
            p2 = dominant_patterns[1]
            cat2 = p2["category"]
            label2 = _PATTERN_LABELS.get(cat2, cat2.replace("_", " "))
            ex2 = next(
                (e for e in p2.get("examples", []) if e.get("spoken") and e.get("correct") and e["spoken"] != e["correct"]),
                None,
            )
            if ex2:
                parts.append(f"Also: '{ex2['spoken']}' for '{ex2['correct']}' shows {label2}.")
            else:
                parts.append(f"Also work on {label2}.")

        wpm = metrics.wpm if metrics.wpm > 0 else None
        if wpm:
            if wpm < 100:
                parts.append("You spoke slowly — aim for 110-130 words per minute for more natural flow.")
            elif wpm > 160:
                parts.append("You spoke quite fast — slow down a little so each word lands clearly.")

        if len(dominant_patterns) > 1:
            cat2 = dominant_patterns[1]["category"]
            label2 = _PATTERN_LABELS.get(cat2, cat2.replace("_", " "))
            parts.append(f"Today: drill five words with {label1}, then five with {label2}.")
        else:
            parts.append(f"Drill {label1} — say five target words slowly, then at full speed.")

        return " ".join(parts[:4])
    
    def _extract_strengths_weaknesses(self, grammar, vocab, fluency, pronunciation) -> Tuple[List[str], List[str]]:
        strengths = []
        weaknesses = []
        
        # Grammar
        if grammar.get("grammar_score", 0) >= 70:
            strengths.append("Strong grammatical accuracy")
        elif grammar.get("grammar_score", 0) < 50:
            weaknesses.append("Improve basic grammar structures")
        
        # Vocabulary
        if vocab.get("lexical_diversity", 0) >= 0.6:
            strengths.append("Good vocabulary variety")
        elif vocab.get("lexical_diversity", 0) < 0.4:
            weaknesses.append("Expand vocabulary range")
        
        # Fluency
        filler_count = sum(fluency.get("filler_count", {}).values())
        if filler_count <= 2:
            strengths.append("Natural fluency")
        elif filler_count >= 5:
            weaknesses.append("Reduce filler words")
        
        # Pronunciation
        if pronunciation.get("pronunciation_score", 0) >= 75:
            strengths.append("Clear pronunciation")
        elif pronunciation.get("pronunciation_score", 0) < 60:
            weaknesses.append("Work on pronunciation clarity")
        
        return strengths[:3], weaknesses[:3]
    
    def _generate_tasks(self, errors: List[Dict], weaknesses: List[str]) -> List[Dict]:
        tasks = []
        
        # Tasks from errors
        error_types = Counter([e.get("rule", "") for e in errors])
        for error_type, count in error_types.most_common(2):
            if error_type:
                tasks.append({
                    "type": "grammar_drill",
                    "topic": error_type,
                    "reason": f"Found {count} error(s) in this area"
                })
        
        # Tasks from weaknesses
        for weakness in weaknesses:
            if "vocabulary" in weakness.lower():
                tasks.append({
                    "type": "vocabulary_expansion",
                    "topic": "Synonyms and alternatives",
                    "reason": weakness
                })
        
        return tasks[:3]
    
    def _convert_to_error_detail(self, error_dict: Dict) -> ErrorDetail:
        """Convert dict to ErrorDetail model"""
        severity_map = {
            "TIER_1": ErrorSeverity.CRITICAL,
            "TIER_2": ErrorSeverity.MAJOR,
            "TIER_3": ErrorSeverity.MINOR,
            "critical": ErrorSeverity.CRITICAL,
            "major": ErrorSeverity.MAJOR,
            "minor": ErrorSeverity.MINOR,
        }
        
        # New prompt uses 'error_type', 'explanation' and 'severity' (TIERs)
        # Handle None severity - coerce to empty string before .upper()
        severity_value = error_dict.get("severity")
        if severity_value is None:
            severity_value = ""
        
        return ErrorDetail(
            type=ErrorType.GRAMMAR,
            severity=severity_map.get(severity_value.upper(), ErrorSeverity.MINOR),
            original_text=error_dict.get("original", ""),
            corrected_text=error_dict.get("corrected", ""),
            explanation=error_dict.get("explanation") or error_dict.get("rule", ""),
            suggestion=error_dict.get("explanation", "")
        )
    
    def _create_fallback_response(self, text: str, cefr: CEFRAssessment) -> AnalysisResponse:
        """Fallback when analysis fails completely"""
        word_count = len(text.split())
        
        return AnalysisResponse(
            cefr_assessment=cefr,
            errors=[],
            metrics=AnalysisMetrics(
                wpm=word_count / 1.5,
                unique_words=len(set(text.split())),
                grammar_score=50,
                pronunciation_score=50,
                fluency_score=50,
                vocabulary_score=50,
                overall_score=50,
            ),
            feedback="Analysis temporarily unavailable. Please try again.",
            strengths=[],
            improvement_areas=[],
            recommended_tasks=[],
            processing_time=0.1,
            scores={"pronunciation": 50},
            pronunciation_issues=[],
            ai_feedback={
                "pronunciation": {
                    "justification": "Analysis temporarily unavailable.",
                }
            },
        )

    # ─────────────────────────────────────────────────────────────
    # PRESERVED JOINT ANALYSIS METHODS
    # ─────────────────────────────────────────────────────────────

    def _create_joint_analysis_prompt(self, request: JointAnalysisRequest) -> str:
        """Create a prompt for analyzing a joint conversation between two or more participants."""
        segments_data = []
        for s in request.segments:
            segments_data.append(f"[{s.speaker_id} at {s.timestamp}s]: {s.text}")
        
        transcript_block = "\n".join(segments_data)

        pa_lines: list[str] = []
        pa_by_speaker: dict[str, list] = {}
        for s in request.segments:
            if s.pa_flagged_errors:
                pa_by_speaker.setdefault(s.speaker_id, []).extend(s.pa_flagged_errors)
        for speaker_id, errors in pa_by_speaker.items():
            for e in errors:
                spoken = e.get("spoken", "")
                correct = e.get("correct", "")
                rule = e.get("rule_category", "general_mispronunciation")
                conf = e.get("confidence", 50)
                target = f' (expected: "{correct}")' if correct else ""
                pa_lines.append(
                    f'- [{speaker_id}] heard "{spoken}"{target} — {rule}, confidence {conf}'
                )
        pa_block = (
            "\n".join(pa_lines)
            if pa_lines
            else "No Azure pronunciation flags for this session."
        )
        
        return f"""You are a professional ESL Conversational Coach and Linguist.
Analyze the following multi-speaker transcript of an English practice session.

**Transcript:**
---
{transcript_block}
---

**Azure Pronunciation Assessment (objective acoustic evidence — weight heavily for pronunciation_score):**
---
{pa_block}
---

**ANALYSIS OBJECTIVES:**
1. **Conversational Metrics**: Analyze interaction quality (turn-taking, backchanneling like 'uh-huh', building on partner's ideas).
2. **Peer Comparison**: Compare participant strengths and weaknesses relatively.
3. **Individual Feedback**: Provide granular feedback for EACH participant (scores, errors, confidence, vocabulary).
4. **Learning Synergy**: Identify what participants can learn from each other.
5. **Pronunciation**: When Azure flags exist for a speaker, reflect them in pronunciation_score and cite specific mispronunciations in errors/feedback. Do not ignore acoustic evidence.

**CRITICAL SCORING CALIBRATION (you MUST follow these rules):**
- Count the number of MEANINGFUL words each participant spoke (exclude greetings, "hello", "hi", "am I audible", "can you hear me", "yes", "no", "okay").
- If a participant spoke fewer than 10 meaningful words: cap ALL their scores at 20 maximum, set cefr_level to "A1".
- If a participant spoke fewer than 25 meaningful words: cap ALL their scores at 40 maximum.
- If a participant spoke fewer than 50 meaningful words: cap ALL their scores at 60 maximum.
- Greetings-only or connectivity-check speech ("hello", "am I audible?", "can you hear me?") = A1 level, all scores 10-15.
- Score based on BOTH quality AND quantity of language produced. Short, trivial utterances must NEVER receive high scores.
- A score of 80+ requires substantial, complex speech with varied vocabulary and grammar structures.

**Respond with ONLY this JSON structure:**
{{
    "interaction_metrics": {{
        "turn_taking_score": <int 0-100>,
        "backchanneling_detected": [<str>],
        "conversation_flow_feedback": "<string>",
        "active_listening_score": <int 0-100>
    }},
    "peer_comparison": {{
        "speaking_time_distribution": {{ "<speaker_id>": "<percentage>%" }},
        "relative_strengths": {{ "<speaker_id>": ["Strength 1", "..."] }},
        "synergy_feedback": "<string describing how they helped each other>"
    }},
    "participant_analyses": [
        {{
            "participant_id": "<speaker_id>",
            "analysis_data": {{
                "scores": {{
                    "grammar_score": <int 0-100>,
                    "pronunciation_score": <int 0-100>,
                    "fluency_score": <int 0-100>,
                    "vocabulary_score": <int 0-100>,
                    "overall_score": <int 0-100>
                }},
                "cefr_level": "<A1-C2>",
                "errors": [
                    {{
                        "type": "GRAMMAR" | "VOCABULARY" | "TENSE" | "ARTICLE" | "FLUENCY",
                        "severity": "CRITICAL" | "MAJOR" | "MINOR" | "SUGGESTION",
                        "original_text": "<exact phrase or sentence the speaker said>",
                        "corrected_text": "<corrected phrase/sentence>",
                        "explanation": "<WHY this is wrong: cite the grammar rule or usage principle>",
                        "suggestion": "<a rewritten version of the FULL sentence, not just the phrase>",
                        "example": "<optional: a separate example sentence showing correct usage in a different context>"
                    }}
                ],
                "feedback": "<2-3 sentences>",
                "strengths": [<str>],
                "improvement_areas": [<str>]
            }},
            "confidence_timeline": [
                {{ "timestamp": <float>, "confidence_score": <int 0-100> }}
            ],
            "hesitation_markers": {{
                "filler_usage": {{ "um": <int>, "uh": <int>, "...": <int> }},
                "self_corrections": <int>,
                "false_starts": <int>
            }},
            "topic_vocabulary": {{
                "detected_domains": ["<domain1>", "..."],
                "appropriate_terms": ["<term1>", "..."],
                "suggested_alternatives": {{ "<generic_word>": ["<vivid_word1>", "..."] }}
            }}
        }}
    ]
}}"""

    def _joint_error_to_detail(self, e: Dict[str, Any]) -> ErrorDetail:
        """Convert LLM joint-analysis error dict to ErrorDetail. LLM returns uppercase type/severity; enums expect lowercase. Unknown types fall back to GENERAL."""
        raw_type = (e.get("type") or "grammar")
        raw_severity = (e.get("severity") or "minor")
        type_str = raw_type.lower() if isinstance(raw_type, str) else "grammar"
        severity_str = raw_severity.lower() if isinstance(raw_severity, str) else "minor"
        valid_types = {t.value for t in ErrorType}
        if type_str not in valid_types:
            type_str = "general"
        try:
            et = ErrorType(type_str)
        except ValueError:
            et = ErrorType.GENERAL
        try:
            sev = ErrorSeverity(severity_str)
        except ValueError:
            sev = ErrorSeverity.MINOR
        return ErrorDetail(
            type=et,
            severity=sev,
            original_text=str(e.get("original_text", e.get("original", "")) or ""),
            corrected_text=str(e.get("corrected_text", e.get("corrected", "")) or ""),
            explanation=str(e.get("explanation", "")) or "",
            suggestion=str(e.get("suggestion", "")) or "",
            example=str(e.get("example", "")) or None,
        )

    @cached(prefix="analysis", ttl=settings.cache_ttl_analysis)
    async def analyze_joint(self, request: JointAnalysisRequest) -> JointAnalysisResponse:
        """
        Analyzes a multi-speaker conversation for interaction quality and individual performance.
        """
        if not self.model:
            raise RuntimeError("Analysis service is not configured.")

        start_time = time.time()
        prompt = self._create_joint_analysis_prompt(request)
        
        try:
            response = await asyncio.wait_for(
                self.model.generate_content_async(prompt),
                timeout=60.0
            )
            analysis_data = robust_json_parser(response.text)
        except Exception as e:
            logger.error(f"Gemini joint analysis failed: {e}", exc_info=True)
            # Fallback / Error handling
            raise e

        # Build speaker_id → segment lookup for per-participant PA data
        _seg_by_speaker: Dict[str, Any] = {s.speaker_id: s for s in request.segments}

        # Construct JointAnalysisResponse
        participant_analyses = []
        for pa in analysis_data.get("participant_analyses", []):
            ad = pa.get("analysis_data", {})
            ai_scores = ad.get("scores", {})
            # Normalize LLM errors: Gemini returns uppercase type/severity; ErrorDetail expects lowercase
            errors_normalized = [
                self._joint_error_to_detail(e) for e in ad.get("errors", [])
            ]

            # Map to ParticipantAnalysis model - validate CEFR level safely
            try:
                cefr_level_str = ad.get("cefr_level", "B1")
                cefr_level = CEFRLevel(cefr_level_str)
            except (ValueError, AttributeError):
                logger.warning(f"Invalid CEFR level '{cefr_level_str}' defaulting to B1")
                cefr_level = CEFRLevel.B1
            
            _seg = _seg_by_speaker.get(pa["participant_id"])
            _pa_flagged = list(_seg.pa_flagged_errors or []) if _seg and _seg.pa_flagged_errors else []
            _unified = _build_unified_errors({}, _pa_flagged) if _pa_flagged else None

            # Never invent neutral 50s — Nest CQS overwrites; missing keys stay 0.
            def _score(key: str) -> float:
                val = ai_scores.get(key)
                if val is None:
                    return 0.0
                try:
                    return float(val)
                except (TypeError, ValueError):
                    return 0.0

            participant_analyses.append(ParticipantAnalysis(
                participant_id=pa["participant_id"],
                analysis=AnalysisResponse(
                    cefr_assessment=CEFRAssessment(
                        level=cefr_level,
                        score=_score("overall_score"),
                        confidence=0.9,
                        strengths=ad.get("strengths", []),
                        weaknesses=ad.get("improvement_areas", []),
                        next_level_requirements=[]
                    ),
                    errors=errors_normalized,
                    metrics=AnalysisMetrics(
                        wpm=0, # Placeholder
                        unique_words=0, # Placeholder
                        grammar_score=_score("grammar_score"),
                        pronunciation_score=_score("pronunciation_score"),
                        fluency_score=_score("fluency_score"),
                        vocabulary_score=_score("vocabulary_score"),
                        overall_score=_score("overall_score"),
                    ),
                    feedback=ad.get("feedback", ""),
                    strengths=ad.get("strengths", []),
                    improvement_areas=ad.get("improvement_areas", []),
                    recommended_tasks=[],
                    processing_time=0,
                    unified_errors=_unified or None,
                ),
                confidence_timeline=pa.get("confidence_timeline"),
                hesitation_markers=pa.get("hesitation_markers"),
                topic_vocabulary=pa.get("topic_vocabulary")
            ))

        # Ensure every segment speaker has an analysis (LLM sometimes returns only one)
        segment_speaker_ids = {s.speaker_id for s in request.segments}
        have_ids = {pa.participant_id for pa in participant_analyses}
        for speaker_id in segment_speaker_ids:
            if speaker_id in have_ids:
                continue
            logger.warning(
                "joint_analysis_missing_participant",
                speaker_id=speaker_id,
                session_id=request.session_id,
            )
            participant_analyses.append(ParticipantAnalysis(
                participant_id=speaker_id,
                analysis=AnalysisResponse(
                    cefr_assessment=CEFRAssessment(
                        level=CEFRLevel("A1"),
                        score=0,
                        confidence=0.5,
                        strengths=[],
                        weaknesses=[],
                        next_level_requirements=[],
                    ),
                    errors=[],
                    metrics=AnalysisMetrics(
                        wpm=0,
                        unique_words=0,
                        grammar_score=0,
                        pronunciation_score=0,
                        fluency_score=0,
                        vocabulary_score=0,
                        overall_score=0,
                    ),
                    feedback="Analysis based on shared conversation.",
                    strengths=[],
                    improvement_areas=[],
                    recommended_tasks=[],
                    processing_time=0,
                ),
            ))

        return JointAnalysisResponse(
            session_id=request.session_id,
            interaction_metrics=analysis_data.get("interaction_metrics", {}),
            peer_comparison=analysis_data.get("peer_comparison", {}),
            participant_analyses=participant_analyses
        )

# Export singleton
analysis_service = AnalysisService()
