
import time
import json
import asyncio
from typing import Dict, Any, List, Optional, Tuple
import google.generativeai as genai
import re
from collections import Counter

from app.core.config import settings
from app.core.logging import logger
from app.models.request import AnalysisRequest, JointAnalysisRequest, SpeakerSegment
from app.models.response import AnalysisResponse, AnalysisMetrics, JointAnalysisResponse, ParticipantAnalysis
from app.models.base import CEFRAssessment, ErrorDetail, ErrorType, ErrorSeverity, CEFRLevel
from app.cache.manager import cached
from app.services.cefr_classifier import cefr_classifier
from app.utils.robust_json_parser import robust_json_parser
from app.assessment.scoring.grammar_classifier import GrammarErrorClassifier
from app.assessment.scoring.vocabulary_analyzer import VocabularyAnalyzer
from app.assessment.scoring.confidence_calculator import ConfidenceCalculator


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
            self.fast_model = genai.GenerativeModel('gemini-2.0-flash')
            # Use standard model for complex analyses
            self.model = genai.GenerativeModel('gemini-2.0-flash')
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
        Focused grammar analysis with examples for calibration.
        Shorter, more precise than your original.
        """
        return f"""You are a grammar expert. Analyze ONLY grammar in this text.

Expected level: {cefr_level.value}

Text: "{text}"

Find grammar errors and rate grammar quality 0-100.

CALIBRATION EXAMPLES:
- "I go to school yesterday" (A1): 25/100 - Wrong tense
- "Although I was tired, but I continued working" (B1): 55/100 - Redundant conjunction
- "Having finished the project, we celebrated" (C1): 90/100 - Correct participle clause
- "Me and John went shopping" (A2): 40/100 - Pronoun case error

STRICT RULES:
- Simple correct sentence (A1-A2): max 50/100
- No complex structures (B1): max 65/100
- Perfect simple + some complex (B2): 70-85/100
- Native-like complexity (C1-C2): 85-100/100

Respond ONLY with JSON:
{{
  "grammar_score": <int 0-100>,
  "grammatical_errors": [
    {{
      "original": "exact phrase with error",
      "corrected": "correct version",
      "error_type": "wrong_tense_context|subject_verb_disagreement|missing_auxiliary|word_order_chaos|article_error|preposition_error|plural_form_error|wrong_verb_form|article_omission_casual|uncountable_plural|redundant_preposition|colloquial_contraction",
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
  "justification": "1 sentence explaining the score"
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

    def _create_pronunciation_prompt(self, text: str, native_lang: str, azure_data: Optional[str]) -> str:
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
        
        return f"""You are a pronunciation expert specializing in L1 transfer analysis.

Native language: {native_lang}
Expected L1 patterns: {expected_patterns}

Text: "{text}"
{azure_section}

Rate pronunciation 0-100.

IMPORTANT:
- Accent ≠ Error. Hindi accent is fine if intelligible.
- Only penalize errors that impede understanding.
- If Azure data shows word-level scores, use those primarily.

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
  "justification": "1 sentence"
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
        
        grammar_score = min(max(grammar_data.get("score", 50), 0), 100)
        vocab_score = min(max(vocab_data.get("score", 50), 0), 100)
        fluency_score = min(max(fluency_data.get("score", 50), 0), 100)
        pronunciation_score = min(max(pronunciation_data.get("score", 50), 0), 100)
        
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
        
        # Stage 2: Parallel specialized analyses
        tasks = [
            self._analyze_grammar(request.text, cefr_assessment.level),
            self._analyze_vocabulary(request.text, cefr_assessment.level),
            self._analyze_fluency(request.text, request.context),
            self._analyze_pronunciation(
                request.text,
                request.user_native_language or "Unknown",
                request.context
            ),
        ]
        
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
        
        except Exception as e:
            logger.error(f"Parallel analysis failed: {e}", exc_info=True)
            # Return basic fallback
            return self._create_fallback_response(request.text, cefr_assessment)
            
        # Apply enhanced classifiers
        gemini_grammar = grammar_data.copy()
        grammar_data = self.grammar_classifier.classify_errors(gemini_grammar)
        grammar_data["justification"] = gemini_grammar.get("justification", "")
        
        # Vocabulary: Use the specialized analyzer
        vocab_data = self.vocab_analyzer.analyze_vocabulary(request.text)
        vocab_data["word_count"] = len(request.text.split())
        vocab_data["unique_words"] = len(set(request.text.lower().split()))
        vocab_data["justification"] = "Vocabulary enrichment and MTLD analysis complete."
        
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
        
        # Build feedback
        feedback = self._generate_feedback(
            grammar_data,
            vocab_data,
            fluency_data,
            pronunciation_data,
            metrics
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
        
        return AnalysisResponse(
            cefr_assessment=cefr_assessment,
            errors=[self._convert_to_error_detail(e) for e in verified_errors],
            metrics=metrics,
            feedback=feedback,
            strengths=strengths,
            improvement_areas=weaknesses,
            recommended_tasks=self._generate_tasks(verified_errors, weaknesses),
            accent_notes=pronunciation_data.get("l1_influence"),
            processing_time=time.time() - start_time
        )
    
    # ─────────────────────────────────────────────────────────────
    # HELPER METHODS
    # ─────────────────────────────────────────────────────────────
    
    async def _analyze_grammar(self, text: str, cefr: CEFRLevel) -> Dict:
        prompt = self._create_grammar_prompt(text, cefr)
        response = await asyncio.wait_for(
            self.fast_model.generate_content_async(prompt),
            timeout=15.0
        )
        return robust_json_parser(response.text)
    
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
    
    async def _analyze_pronunciation(self, text: str, native_lang: str, azure_data: Optional[str]) -> Dict:
        prompt = self._create_pronunciation_prompt(text, native_lang, azure_data)
        response = await asyncio.wait_for(
            self.fast_model.generate_content_async(prompt),
            timeout=15.0
        )
        return robust_json_parser(response.text)
    
    def _generate_feedback(self, grammar, vocab, fluency, pronunciation, metrics) -> str:
        """Combine justifications into coherent feedback"""
        parts = []
        
        if metrics.overall_score >= 80:
            parts.append("Excellent work! Your English proficiency is strong.")
        elif metrics.overall_score >= 60:
            parts.append("Good progress! You're communicating effectively.")
        else:
            parts.append("Keep practicing! You're building your skills.")
        
        parts.append(grammar.get("justification", ""))
        parts.append(vocab.get("justification", ""))
        
        return " ".join(parts)
    
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
        return ErrorDetail(
            type=ErrorType.GRAMMAR,
            severity=severity_map.get(error_dict.get("severity", "").upper(), ErrorSeverity.MINOR),
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
            processing_time=0.1
        )

    # ─────────────────────────────────────────────────────────────
    # PRESERVED JOINT ANALYSIS METHODS
    # ─────────────────────────────────────────────────────────────

    def _create_joint_analysis_prompt(self, request: JointAnalysisRequest) -> str:
        """Create a prompt for analyzing a joint conversation between two or more participants."""
        segments_data = []
        for s in request.segments:
            segments_data.append(f"[{s.speaker_id} at {s.timestamp}s]: {s.text}")
        
        transcript_block = "\\n".join(segments_data)
        
        return f"""You are a professional ESL Conversational Coach and Linguist.
Analyze the following multi-speaker transcript of an English practice session.

**Transcript:**
---
{transcript_block}
---

**ANALYSIS OBJECTIVES:**
1. **Conversational Metrics**: Analyze interaction quality (turn-taking, backchanneling like 'uh-huh', building on partner's ideas).
2. **Peer Comparison**: Compare participant strengths and weaknesses relatively.
3. **Individual Feedback**: Provide granular feedback for EACH participant (scores, errors, confidence, vocabulary).
4. **Learning Synergy**: Identify what participants can learn from each other.

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
                        "original_text": "<text>",
                        "corrected_text": "<text>",
                        "explanation": "<text>",
                        "suggestion": "<text>"
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

        # Construct JointAnalysisResponse
        participant_analyses = []
        for pa in analysis_data.get("participant_analyses", []):
            ad = pa.get("analysis_data", {})
            ai_scores = ad.get("scores", {})
            
            # Map to ParticipantAnalysis model
            participant_analyses.append(ParticipantAnalysis(
                participant_id=pa["participant_id"],
                analysis=AnalysisResponse(
                    cefr_assessment=CEFRAssessment(
                        level=CEFRLevel(ad.get("cefr_level", "B1")),
                        score=ai_scores.get("overall_score", 50),
                        confidence=0.9,
                        strengths=ad.get("strengths", []),
                        weaknesses=ad.get("improvement_areas", []),
                        next_level_requirements=[]
                    ),
                    errors=[ErrorDetail(**e) for e in ad.get("errors", [])],
                    metrics=AnalysisMetrics(
                        wpm=0, # Placeholder
                        unique_words=0, # Placeholder
                        grammar_score=ai_scores.get("grammar_score", 50),
                        pronunciation_score=ai_scores.get("pronunciation_score", 50),
                        fluency_score=ai_scores.get("fluency_score", 50),
                        vocabulary_score=ai_scores.get("vocabulary_score", 50),
                        overall_score=ai_scores.get("overall_score", 50),
                    ),
                    feedback=ad.get("feedback", ""),
                    strengths=ad.get("strengths", []),
                    improvement_areas=ad.get("improvement_areas", []),
                    recommended_tasks=[],
                    processing_time=0
                ),
                confidence_timeline=pa.get("confidence_timeline"),
                hesitation_markers=pa.get("hesitation_markers"),
                topic_vocabulary=pa.get("topic_vocabulary")
            ))

        return JointAnalysisResponse(
            session_id=request.session_id,
            interaction_metrics=analysis_data.get("interaction_metrics", {}),
            peer_comparison=analysis_data.get("peer_comparison", {}),
            participant_analyses=participant_analyses
        )

# Export singleton
analysis_service = AnalysisService()
