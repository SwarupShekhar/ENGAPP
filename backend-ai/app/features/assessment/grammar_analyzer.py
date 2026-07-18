"""
Deterministic grammar scoring engine for Indian English speech transcripts.
Uses LanguageTool (JVM singleton) + spaCy. All functions are synchronous.
"""
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Singletons — instantiate once at module level (JVM/model startup is expensive)
try:
    import language_tool_python
    _lt = language_tool_python.LanguageTool("en-US")
except Exception as _e:
    _lt = None
    logger.warning("LanguageTool failed to start (%s). Using spaCy-only.", _e)

try:
    import spacy
    _nlp = spacy.load("en_core_web_sm")
except OSError as _e:
    _nlp = None
    logger.warning("spaCy model not found (%s). Indian-English patterns skipped.", _e)

CATEGORY_WEIGHTS = {
    "tense_error": 2.0, "pluralization_error": 1.5, "word_order": 1.5,
    "preposition_error": 1.0, "other_grammar": 1.0, "article_missing": 0.5,
}
_ALL_CATEGORIES = list(CATEGORY_WEIGHTS.keys())

_PLURAL_NUMBERS = {
    "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "several", "many", "multiple", "few", "some",
}
_CONJUNCTIONS = {
    "and", "but", "or", "so", "however", "also", "therefore", "hence",
    "yet", "still", "although", "though",
}
_WRONG_PAIRS = {("belong", "from"), ("discuss", "about"), ("return", "back")}

# Fix 5: precomputed module-level sets (compute once, not per call)
_NUMERAL_SKIP = frozenset({"one", "a", "an", "1"})
_WRONG_VERBS = frozenset(v for v, _ in _WRONG_PAIRS)


_NER_ENTITY_LABELS = frozenset({"GPE", "ORG", "PERSON", "NORP", "FAC", "LOC"})


def _get_entity_char_spans(text: str) -> frozenset:
    """Return set of character positions covered by named entities (proper nouns)."""
    if _nlp is None or not text.strip():
        return frozenset()
    try:
        doc = _nlp(text)
        spans: set[int] = set()
        for ent in doc.ents:
            if ent.label_ in _NER_ENTITY_LABELS:
                spans.update(range(ent.start_char, ent.end_char))
        return frozenset(spans)
    except Exception:
        return frozenset()


def _classify_lt_match(match) -> Optional[str]:
    """Map a LanguageTool match to one of 6 categories, or None to skip."""
    rule_id = match.rule_id or ""
    category = (match.category or "").upper()
    # Spelling / capitalization / typography are NOT grammar (MORFOLOGIK used to
    # inflate "pluralization" on names like gia/roberto).
    if (
        "MORFOLOGIK" in rule_id
        or category in {"TYPOS", "CASING", "TYPOGRAPHY", "PUNCTUATION", "STYLE", "REDUNDANCY"}
        or "SPELL" in rule_id
        or "UPPERCASE" in rule_id
        or "LOWERCASE" in rule_id
    ):
        return None
    if "TENSE" in rule_id or "VERB_TENSE" in rule_id:
        return "tense_error"
    if rule_id in {"EN_A_VS_AN", "DT_JJ_NN", "MISSING_DET", "AN_TENSE"} or "ARTICLE" in rule_id:
        return "article_missing"
    if "PLURAL" in rule_id or "AGREEMENT" in rule_id:
        return "pluralization_error"
    if "PREP" in rule_id or "PREPOSITION" in rule_id:
        return "preposition_error"
    if "WORD_ORDER" in rule_id:
        return "word_order"
    if category in {"GRAMMAR", "SEMANTICS"}:
        return "other_grammar"
    return None


def _run_language_tool(text: str, errors: dict) -> None:
    if _lt is None or not text.strip():
        return
    try:
        matches = _lt.check(text)
    except Exception as exc:
        logger.warning("LanguageTool check failed: %s", exc)
        return
    entity_char_spans = _get_entity_char_spans(text)
    for match in matches:
        if entity_char_spans:
            match_chars = set(range(match.offset, match.offset + match.error_length))
            if match_chars & entity_char_spans:
                continue
        cat = _classify_lt_match(match)
        if cat is None:
            continue
        bucket = errors[cat]
        bucket["count"] += 1
        if len(bucket["examples"]) < 3:
            bucket["examples"].append({
                "error_text": text[match.offset: match.offset + match.error_length],
                "suggestion": match.replacements[0] if match.replacements else "",
                "context": str(match.context or ""),
            })


def _pattern_a_passive_as_past(doc, errors: dict, ent_spans: frozenset = frozenset()) -> None:
    """
    Detect passive construction used as simple past.
    e.g. "I was joined the company" → should be "I joined the company"
    e.g. "I was promoted last year" is CORRECT passive — don't flag it

    Heuristic: flag when:
    - Verb is VBN (past participle)
    - Has an 'auxpass' or aux with lemma 'be'
    - First-person subject (I/we/my)
    - The VBN lemma is in a set of typically-active transitive verbs that
      Indian English speakers commonly misuse as passive constructions.
    """
    ACTIVE_VERBS_MISUSED_AS_PASSIVE = {
        "join", "start", "begin", "appoint", "hire", "post", "place",
        "assign", "select", "choose", "promote", "transfer", "induct",
    }
    fp_subjects = {"i", "we", "my", "our"}

    for sent in doc.sents:
        for token in sent:
            if token.i in ent_spans:
                continue
            if token.tag_ != "VBN":
                continue
            if token.lemma_.lower() not in ACTIVE_VERBS_MISUSED_AS_PASSIVE:
                continue
            # Check for be-auxiliary (auxpass or aux with lemma 'be')
            has_be_aux = any(
                c.dep_ in ("auxpass", "aux") and c.lemma_.lower() in ("be", "was", "were", "is", "are")
                for c in token.children
            )
            if not has_be_aux:
                continue
            # Check first-person subject
            has_fp_subj = any(
                c.dep_ in ("nsubj", "nsubjpass") and c.text.lower() in fp_subjects
                for c in token.children
            )
            if not has_fp_subj:
                continue
            # Confirmed: "I was joined/started/hired/..." — flag it
            ctx = " ".join(t.text for t in sent)
            example = {
                "error_text": f"was {token.text}",
                "suggestion": token.text,  # just the past tense without 'was'
                "context": ctx[:100],
            }
            if len(errors["tense_error"]["examples"]) < 3:
                errors["tense_error"]["examples"].append(example)
            errors["tense_error"]["count"] += 1
            break  # one flag per sentence


def _pattern_b_numeral_singular_noun(doc, errors: dict, ent_spans: frozenset = frozenset()) -> None:
    """Pattern B: numeral before singular noun ('two year experience')."""
    for token in doc:
        if token.i in ent_spans:
            continue
        if token.tag_ != "NN":
            continue
        for child in token.children:
            if child.i in ent_spans:
                continue
            if child.dep_ != "nummod" or child.text.lower() in _NUMERAL_SKIP:
                continue
            is_plural = child.text.lower() in _PLURAL_NUMBERS
            if not is_plural:
                try:
                    is_plural = int(child.text) > 1
                except ValueError:
                    pass
            if is_plural:
                errors["pluralization_error"]["count"] += 1
                if len(errors["pluralization_error"]["examples"]) < 3:
                    errors["pluralization_error"]["examples"].append({
                        "error_text": f"'{child.text} {token.text}'",
                        "suggestion": f"'{child.text} {token.text}s'",
                        "context": token.sent.text[:120],
                    })


_SUBORDINATING_START = frozenset({"although", "though", "even though", "while", "whereas"})
_REDUNDANT_CC = frozenset({"but", "yet", "still", "however"})

def _pattern_c_double_conjunction(doc, errors: dict, ent_spans: frozenset = frozenset()) -> None:
    """Pattern C: redundant conjunctions.
    Catches adjacent pairs ('and also') AND sentence-level 'although...but' constructs.
    """
    tokens = [t for t in doc if not t.is_space and t.i not in ent_spans]
    # Adjacent pairs
    for i in range(len(tokens) - 1):
        t1, t2 = tokens[i], tokens[i + 1]
        if t1.text.lower() in _CONJUNCTIONS and t2.text.lower() in _CONJUNCTIONS:
            errors["word_order"]["count"] += 1
            if len(errors["word_order"]["examples"]) < 3:
                errors["word_order"]["examples"].append({
                    "error_text": f"'{t1.text} {t2.text}'",
                    "suggestion": t1.text,
                    "context": t1.sent.text[:120],
                })
    # Sentence-level: "although/though X, but/yet Y" — subordinate + main clause CC
    for sent in doc.sents:
        stokens = [t for t in sent if not t.is_space]
        if not stokens:
            continue
        first = stokens[0].text.lower()
        if first not in _SUBORDINATING_START:
            continue
        cc_hits = [t for t in stokens if t.text.lower() in _REDUNDANT_CC]
        if cc_hits:
            cc = cc_hits[0]
            errors["word_order"]["count"] += 1
            if len(errors["word_order"]["examples"]) < 3:
                errors["word_order"]["examples"].append({
                    "error_text": f"'{stokens[0].text} ... {cc.text}'",
                    "suggestion": stokens[0].text,
                    "context": sent.text[:120],
                })


def _pattern_d_wrong_verb_prep(doc, errors: dict, ent_spans: frozenset = frozenset()) -> None:
    """Pattern D: wrong verb-preposition pairs ('belong from', 'discuss about')."""
    for token in doc:
        if token.i in ent_spans:
            continue
        if token.lemma_.lower() not in _WRONG_VERBS:
            continue
        for child in token.children:
            if child.dep_ == "prep" and (token.lemma_.lower(), child.text.lower()) in _WRONG_PAIRS:
                errors["preposition_error"]["count"] += 1
                if len(errors["preposition_error"]["examples"]) < 3:
                    errors["preposition_error"]["examples"].append({
                        "error_text": f"'{token.text} {child.text}'",
                        "suggestion": token.lemma_,
                        "context": token.sent.text[:120],
                    })


def _run_spacy_patterns(text: str, errors: dict) -> None:
    if _nlp is None or not text.strip():
        return
    try:
        doc = _nlp(text)
    except Exception as exc:
        logger.warning("spaCy processing failed: %s", exc)
        return
    ent_spans = frozenset(
        token.i for token in doc if token.ent_type_ in _NER_ENTITY_LABELS
    )
    _pattern_a_passive_as_past(doc, errors, ent_spans)
    _pattern_b_numeral_singular_noun(doc, errors, ent_spans)
    _pattern_c_double_conjunction(doc, errors, ent_spans)
    _pattern_d_wrong_verb_prep(doc, errors, ent_spans)


def score_grammar(error_counts: dict, word_count: int) -> float:
    """Map weighted error density to a deterministic 0-100 score."""
    if word_count == 0:
        return 50.0
    weighted = sum(count * CATEGORY_WEIGHTS.get(cat, 1.0) for cat, count in error_counts.items())
    d = weighted / word_count
    if d <= 0.02:
        score = 100 - (d / 0.02) * 15
    elif d <= 0.05:
        score = 84 - ((d - 0.02) / 0.03) * 19
    elif d <= 0.10:
        score = 64 - ((d - 0.05) / 0.05) * 19
    elif d <= 0.20:
        score = 44 - ((d - 0.10) / 0.10) * 19
    else:
        score = max(0.0, 24 - (d - 0.20) * 50)
    return round(max(0.0, min(100.0, score)), 1)


def _build_justification(errors: dict, score: float) -> str:
    total = sum(v["count"] for v in errors.values())
    if total == 0:
        return "No grammar errors detected."
    parts = [
        f"{errors[c]['count']} {c.replace('_', ' ')}(s)"
        for c in ("tense_error", "pluralization_error", "word_order", "preposition_error", "article_missing", "other_grammar")
        if errors[c]["count"] > 0
    ]
    if not parts:
        parts = [f"{total} grammar error(s)"]
    return f"Score {score:.0f}/100. Detected: {', '.join(parts[:3])}."


def analyze_grammar(text: str) -> dict:
    """Analyze grammar deterministically. Returns score, word_count, errors dict,
    total_errors, error_density, and justification. Synchronous — wrap in asyncio.to_thread."""
    text = text[:8000]  # guard against pathological input
    errors = {cat: {"count": 0, "examples": []} for cat in _ALL_CATEGORIES}
    word_count = len(text.split()) if text.strip() else 0

    if word_count == 0:
        return {
            "score": 50.0, "word_count": 0, "errors": errors,
            "total_errors": 0, "error_density": 0.0,
            "justification": "No grammar errors detected.",
        }

    _run_language_tool(text, errors)
    _run_spacy_patterns(text, errors)

    error_counts = {cat: errors[cat]["count"] for cat in _ALL_CATEGORIES}
    total_errors = sum(error_counts.values())
    score = score_grammar(error_counts, word_count)

    return {
        "score": score,
        "word_count": word_count,
        "errors": errors,
        "total_errors": total_errors,
        "error_density": round(total_errors / word_count, 4),
        "justification": _build_justification(errors, score),
    }
