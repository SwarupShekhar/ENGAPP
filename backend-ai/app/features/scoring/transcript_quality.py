"""
Transcript-quality signals for call scoring.

spaCy/LanguageTool alone cannot mark broken English as ungrammatical — parsers
always produce *a* tree. These heuristics measure structural breakdown,
disfluency (beyond Azure pace), and lexical misuse (beyond TTR).
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Set

from wordfreq import word_frequency

_FILLERS = ("um", "uh", "er", "ah", "like", "you know", "basically", "literally")
_FUNCTION = frozenset(
    {
        "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
        "my", "your", "his", "its", "our", "their", "a", "an", "the", "to", "of", "in",
        "on", "at", "for", "with", "and", "but", "or", "so", "no", "not", "do", "does",
        "did", "is", "are", "was", "were", "be", "been", "am", "that", "this", "very",
        "too", "some", "all", "my",
    }
)
# Common content verbs — absence across long spans signals broken clauses.
_CONTENT_VERBS = frozenset(
    {
        "speak", "find", "think", "try", "tried", "throw", "go", "going", "went", "buy",
        "buying", "bought", "give", "gave", "take", "took", "want", "need", "make", "made",
        "get", "got", "have", "has", "had", "say", "said", "know", "see", "come", "came",
        "work", "live", "like", "love", "eat", "drink", "walk", "talk", "call", "help",
        "helped", "learn", "learning", "practice", "practiced", "choose", "chose",
    }
)


def tokenize(text: str) -> List[str]:
    return re.findall(r"[a-zA-Z']+", (text or "").lower())


def consecutive_repetition_rate(words: List[str]) -> float:
    if len(words) < 2:
        return 0.0
    reps = sum(1 for i in range(1, len(words)) if words[i] == words[i - 1])
    return reps / float(len(words) - 1)


def filler_rate(text: str, words: List[str]) -> float:
    if not words:
        return 0.0
    low = text.lower()
    # Word-boundary only — bare "er"/"ah" must not match inside "were"/"learning".
    count = 0
    for f in _FILLERS:
        count += len(re.findall(rf"\b{re.escape(f)}\b", low))
    return min(1.0, float(count) / float(len(words)))


def pronoun_salad_rate(words: List[str], text: str = "") -> float:
    """High when personal pronouns appear without a nearby finite/content verb."""
    if len(words) < 6:
        return 0.0

    try:
        from app.features.assessment.grammar_analyzer import _nlp

        if _nlp is not None and text.strip():
            doc = _nlp(text)
            # Map spaCy token indices roughly onto our whitespace tokens via lower text
            spacy_verbs = {
                t.i for t in doc if t.pos_ in {"VERB", "AUX"} and not t.is_space
            }
            # Fall through to lexical if spaCy path is noisy; also use lemma list below
            if spacy_verbs:
                # Approximate: count AUX/VERB density via spaCy for salad
                pronouns = {"i", "you", "he", "she", "we", "they", "me", "him", "her", "us", "them"}
                hits = 0
                for token in doc:
                    if token.text.lower() not in pronouns:
                        continue
                    window = [
                        t
                        for t in doc[max(0, token.i - 1) : token.i + 6]
                        if not t.is_space
                    ]
                    if not any(t.pos_ in {"VERB", "AUX"} for t in window):
                        hits += 1
                return min(1.0, float(hits) / max(1.0, float(len(words) / 8.0)))
    except Exception:
        pass

    pronouns = {"i", "you", "he", "she", "we", "they", "me", "him", "her", "us", "them"}
    hits = 0
    window = 6
    for i, w in enumerate(words):
        if w not in pronouns:
            continue
        span = words[max(0, i - 1) : i + window]
        if not any(
            t in _CONTENT_VERBS
            or t.endswith("ing")
            or t.endswith("ed")
            or t in {"am", "is", "are", "was", "were", "be", "been", "have", "has", "had", "do", "does", "did"}
            for t in span
            if t != w
        ):
            hits += 1
    return min(1.0, float(hits) / max(1.0, float(len(words) / 8.0)))


def verb_density(words: List[str], text: str = "") -> float:
    """
    Fraction of tokens that look like verbs. Prefer spaCy VERB/AUX when available
    so clean prose with common verbs (enjoy, help, connect, …) is not under-counted
    by the closed lexical fallback list.
    """
    if not words:
        return 0.0

    try:
        from app.features.assessment.grammar_analyzer import _nlp

        if _nlp is not None and text.strip():
            doc = _nlp(text)
            alphas = [t for t in doc if t.is_alpha]
            if alphas:
                verbs = sum(1 for t in alphas if t.pos_ in {"VERB", "AUX"})
                return float(verbs) / float(len(alphas))
    except Exception:
        pass

    verbs = sum(
        1
        for w in words
        if w in _CONTENT_VERBS
        or w.endswith("ing")
        or w.endswith("ed")
        or w in {"is", "are", "was", "were", "am", "be", "have", "has", "had", "do", "does", "did"}
    )
    return float(verbs) / float(len(words))


def unpunctuated_runon_rate(text: str, words: List[str]) -> float:
    """
    Fallback structural signal when spaCy is unavailable / blind: a long stretch of
    speech with no sentence-ending punctuation is almost never well-formed English.
    Returns 0 for short or properly punctuated text.
    """
    if len(words) < 40:
        return 0.0
    if re.search(r"[.!?]", text or ""):
        return 0.0
    # Scale gently with length so very long unpunctuated dumps score worse.
    return min(1.0, (len(words) - 30) / 80.0)


def unknown_word_rate(words: List[str], skip: Optional[Set[str]] = None) -> float:
    """Words with near-zero frequency (typos / non-words), excluding skip set."""
    if not words:
        return 0.0
    skip = skip or set()
    bad = 0
    for w in words:
        if w in skip or len(w) <= 1:
            continue
        if word_frequency(w, "en") < 1e-7:
            bad += 1
    return float(bad) / float(len(words))


def odd_collocation_rate(words: List[str]) -> float:
    """
    Flag common 'wrong word' patterns from learner speech without needing an LLM.
    Conservative list — each hit is a strong misuse signal.
    """
    if len(words) < 2:
        return 0.0
    patterns = [
        ("no", "speak"),
        ("english", "no"),
        ("throw", "bird"),
        ("bend", "to"),
        ("power", "buying"),
        ("give", "her", "good"),  # checked as trigram below
        ("do", "apple"),
        ("age", "not"),
        ("going", "good"),
        ("is", "bird"),
        ("draw", "the", "right"),  # "draw the right words"
    ]
    joined = " ".join(words)
    hits = 0
    for p in patterns:
        needle = " ".join(p)
        if needle in joined:
            hits += 1
    # Adjacent function-word piles: i all i you
    pile = 0
    run = 0
    for w in words:
        if w in {"i", "you", "he", "she", "we", "they", "all", "do", "my"}:
            run += 1
            if run >= 3:
                pile += 1
                run = 0
        else:
            run = 0
    hits += pile
    return min(1.0, float(hits) / max(4.0, float(len(words) / 20.0)))


def missing_finite_verb_rate(text: str) -> float:
    """
    Fraction of sentences with no finite predicate. Generalizable syntactic
    breakage signal: a sentence is well-formed if its ROOT is a VERB/AUX or it
    contains an nsubj attached to a verb. Returns 0.0 when spaCy is unavailable.
    """
    try:
        from app.features.assessment.grammar_analyzer import _nlp
    except Exception:
        return 0.0
    if _nlp is None or not text.strip():
        return 0.0

    try:
        doc = _nlp(text)
    except Exception:
        return 0.0

    sentences = [s for s in doc.sents if any(t.is_alpha for t in s)]
    if not sentences:
        return 0.0

    malformed = 0
    for sent in sentences:
        root_ok = any(t.dep_ == "ROOT" and t.pos_ in {"VERB", "AUX"} for t in sent)
        subj_verb = any(
            t.dep_ in {"nsubj", "nsubjpass"} and t.head.pos_ in {"VERB", "AUX"}
            for t in sent
        )
        if not (root_ok or subj_verb):
            malformed += 1
    return float(malformed) / float(len(sentences))


def compute_structural_grammar_score(text: str) -> Dict[str, Any]:
    """
    0–100 grammar proxy from syntactic breakdown (not parser success).
    Syntax only: pronoun salad, verb density, missing finite verbs, and
    unpunctuated run-ons (fallback when spaCy cannot see sentence boundaries).
    """
    words = tokenize(text)
    n = len(words)
    if n == 0:
        return {"score": 0.0, "measured": False, "signals": {}}
    if n < 8:
        return {
            "score": 40.0,
            "measured": True,
            "signals": {"reason": "too_short_for_confident_grammar"},
        }

    salad = pronoun_salad_rate(words, text)
    vden = verb_density(words, text)
    mfv = missing_finite_verb_rate(text)
    runon = unpunctuated_runon_rate(text, words)
    # Prefer spaCy's finite-verb signal; fall back to run-on rate when spaCy is
    # blind (no model / no sentence splits on a punctuation-free dump).
    structure_break = max(mfv, runon)

    # Low verb density only penalizes when structure is already broken. Otherwise
    # clean prose with fewer hand-listed verbs gets unfairly punished and can
    # rank *below* broken speech that happens to hit the content-verb set.
    if structure_break > 0 or salad > 0:
        if vden < 0.08:
            verb_density_penalty = (0.08 - vden) * 250.0
        elif vden < 0.12:
            verb_density_penalty = (0.12 - vden) * 100.0
        else:
            verb_density_penalty = 0.0
    else:
        verb_density_penalty = 0.0

    score = 82.0 - salad * 55.0 - verb_density_penalty - structure_break * 45.0
    score = max(5.0, min(95.0, score))
    return {
        "score": round(score, 2),
        "measured": True,
        "signals": {
            "pronoun_salad_rate": round(salad, 4),
            "verb_density": round(vden, 4),
            "missing_finite_verb_rate": round(mfv, 4),
            "unpunctuated_runon_rate": round(runon, 4),
        },
    }


def compute_disfluency_penalty(text: str) -> Dict[str, Any]:
    """
    Delivery-only penalty to subtract from Azure pace/fluency: repetitions and
    fillers. Word-choice/syntax signals belong to vocabulary/grammar, not here.
    """
    words = tokenize(text)
    if not words:
        return {"penalty": 0.0, "signals": {}}
    rep = consecutive_repetition_rate(words)
    fill = filler_rate(text, words)
    penalty = min(45.0, rep * 100.0 + fill * 35.0)
    return {
        "penalty": round(penalty, 2),
        "signals": {
            "repetition_rate": round(rep, 4),
            "filler_rate": round(fill, 4),
        },
    }


def compute_lexical_accuracy_score(text: str, depth_score: float = 0.0) -> Dict[str, Any]:
    """
    Vocabulary pillar: word choice. Blends depth/TTR with separately-capped
    misuse penalties so one tripped pattern cannot slam the score to the floor.
    """
    words = tokenize(text)
    if not words:
        return {"score": 0.0, "measured": False, "signals": {}}

    unk = unknown_word_rate(words)
    odd = odd_collocation_rate(words)
    # Depth contributes at most 55 — misuse can drag further
    base = min(55.0, float(depth_score) * 0.55) if depth_score > 0 else 35.0
    # Type-token ratio still a small positive (max 20)
    ttr = len(set(words)) / float(len(words))
    base += min(20.0, ttr * 25.0)
    # Cap each penalty separately: no single signal can collapse the score.
    odd_penalty = min(30.0, odd * 30.0)
    unk_penalty = min(30.0, unk * 90.0)
    score = base - odd_penalty - unk_penalty
    score = max(5.0, min(90.0, score))
    return {
        "score": round(score, 2),
        "measured": True,
        "signals": {
            "unknown_word_rate": round(unk, 4),
            "odd_collocation_rate": round(odd, 4),
            "ttr": round(ttr, 4),
            "depth_contribution": round(min(55.0, float(depth_score) * 0.55), 2),
        },
    }


def proper_noun_skip_set(text: str) -> Set[str]:
    """Lowercased tokens to exclude from pronunciation aggregates (names, places)."""
    skip: Set[str] = set()
    try:
        from app.features.assessment.grammar_analyzer import _nlp

        if _nlp is None or not text.strip():
            return skip
        doc = _nlp(text)
        for ent in doc.ents:
            if ent.label_ in {"PERSON", "GPE", "ORG", "NORP", "FAC", "LOC"}:
                for t in ent.text.lower().split():
                    skip.add(re.sub(r"[^a-z']", "", t))
        for token in doc:
            if token.pos_ == "PROPN":
                skip.add(token.text.lower())
    except Exception:
        pass
    return {s for s in skip if s}
