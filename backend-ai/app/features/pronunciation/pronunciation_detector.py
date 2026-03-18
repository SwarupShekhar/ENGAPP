"""
Pronunciation detector: consumes Azure Pronunciation Assessment result (per-word/phoneme scores),
filters low-accuracy words, looks up phoneme_error_map, returns flagged errors with reel_id.
"""
from __future__ import annotations

import logging
from typing import Any

from app.phoneme_loader import get_phoneme_map, get_reel_map

logger = logging.getLogger(__name__)

DEFAULT_ACCURACY_THRESHOLD = 55  # Lowered from 65 to catch more errors in call mode

# These phonemes are the ONLY ones that indicate Indian English pattern errors.
# Low scores on k, b, p, d, t alone are consonant-cluster noise — not pattern errors.
INDIAN_ENGLISH_ERROR_PHONEMES = {
    "w", "v", "h",          # w_to_v, v_to_w, h_dropping
    "th", "dh",              # th_to_t, th_to_d (Azure may use these)
    "t", "d",                # th_to_t, th_to_d (Azure uses t/d for theta/eth)
    "zh", "z", "jh",         # zh_to_j, z_to_j
    "r",                     # r_rolling
    "ae", "eh",              # ae_to_e
    "ih", "iy",              # i_to_ee
    "ao", "aa",              # o_to_aa
    "ng",                    # nasal errors (marning)
}

# Function words where th_to_d errors are extremely common.
# Use a LOWER threshold so they are easier to flag.
FUNCTION_WORDS_TH = {"the", "this", "that", "them", "they", "there", "then", "those", "these"}


def _normalize(s: str) -> str:
    return (s or "").strip().lower()


def detect_from_azure_result(
    azure_result: dict[str, Any],
    *,
    reference_text: str = "",
    accuracy_threshold: int = DEFAULT_ACCURACY_THRESHOLD,
) -> list[dict[str, Any]]:
    """
    Consumes Azure Pronunciation Assessment result and returns flagged Indian English errors.

    Two-pass context: In two-pass mode Azure returns the REFERENCE word in the Word field,
    not what was actually spoken. We detect errors via low phoneme scores and ErrorType,
    then look up the reference word in by_correct_word to get the rule_category.

    Single-pass context: Azure may return the spoken approximation directly if enableMiscue=True
    and the word was miscued. We check by_approximation for those.

    reference_text: When provided, words that appear in the reference are not flagged in
    by_approx (person said the correct word). Enables clean separation: "went" in reference → skip;
    "da" not in reference → flag.
    """
    # Log input for debugging
    logger.info(f"detect_from_azure_result called with accuracy_threshold={accuracy_threshold}")
    logger.info(f"Reference text: {reference_text[:100] if reference_text else '(empty)'}")
    
    # Log Azure result structure
    if azure_result:
        _nb = azure_result.get('NBest') or azure_result.get('Nbests') or azure_result.get('nbest') or []
        _nb_words = _nb[0].get('Words', []) if _nb and isinstance(_nb, list) and len(_nb) > 0 else []
        word_count = len(azure_result.get('Words', []) or _nb_words)
        logger.info(f"Azure result contains {word_count} words, keys={list(azure_result.keys())}")
    else:
        logger.warning("detect_from_azure_result received empty azure_result!")
    
    phoneme_map = get_phoneme_map()
    reel_map = get_reel_map()
    by_approx: dict = phoneme_map.get("by_approximation") or {}
    by_correct: dict = phoneme_map.get("by_correct_word") or {}

    reference_words = set(_normalize(w) for w in (reference_text or "").split()) if reference_text else set()

    # --- Extract word list from Azure result shape ---
    words: list[dict] = []
    nbests = azure_result.get("NBest") or azure_result.get("Nbests") or azure_result.get("nbest")
    if nbests and isinstance(nbests, list) and len(nbests) > 0:
        first = nbests[0]
        words = first.get("Words") or first.get("words") or []
    elif "Words" in azure_result:
        words = azure_result["Words"]
    elif "words" in azure_result:
        words = azure_result["words"]

    flagged: list[dict[str, Any]] = []

    # Log per-word scores for debugging (only first 30 words to keep logs manageable)
    _log_limit = min(len(words), 30)
    for _i, _w in enumerate(words[:_log_limit]):
        _wt = (_w.get("Word") or _w.get("word") or "?")
        _pa = _w.get("PronunciationAssessment", {})
        _et = _pa.get("ErrorType", "None")
        _as = _pa.get("AccuracyScore", _w.get("AccuracyScore", "?"))
        logger.info(f"  word[{_i}] '{_wt}' accuracy={_as} errorType={_et}")
    if len(words) > _log_limit:
        logger.info(f"  ... ({len(words) - _log_limit} more words not shown)")

    for w in words:
        word_text = w.get("Word") or w.get("word") or ""
        word_lower = _normalize(word_text)
        if not word_lower:
            continue

        pa = w.get("PronunciationAssessment", {})
        error_type = (pa.get("ErrorType") or "").strip()
        accuracy_score = pa.get("AccuracyScore")
        if accuracy_score is not None:
            accuracy = float(accuracy_score)
        else:
            w_accuracy = w.get("AccuracyScore")
            if w_accuracy is not None:
                accuracy = float(w_accuracy)
            else:
                accuracy = 100.0

        # --- Collect phoneme-level data ---
        phonemes = w.get("Phonemes", [])
        min_phoneme_score = 100.0
        worst_phoneme_name = ""
        for p in phonemes:
            p_pa = p.get("PronunciationAssessment", {})
            # Explicitly check for None to preserve 0 scores
            p_pa_score = p_pa.get("AccuracyScore")
            if p_pa_score is not None:
                p_score = p_pa_score
            else:
                p_score = p.get("AccuracyScore")
                if p_score is None:
                    p_score = p.get("Score")
            p_name = _normalize(p.get("Phoneme") or p.get("phoneme") or "")
            if p_score is not None:
                score_f = float(p_score)
                if score_f < min_phoneme_score:
                    min_phoneme_score = score_f
                    worst_phoneme_name = p_name

        # ----------------------------------------------------------------
        # STEP 1: Check if Azure returned the spoken approximation directly
        # (single-pass miscue or enableMiscue result).
        # by_approx lookup: word_lower IS the mispronounced form.
        # ----------------------------------------------------------------
        approx_entry = by_approx.get(word_lower)
        if approx_entry:
            # Case 1: Word is in reference text — person likely said it correctly
            # Only skip if high confidence AND high phoneme scores
            if reference_words and word_lower in reference_words:
                if accuracy >= 80 and min_phoneme_score >= 65:
                    continue  # Said correctly, skip
            # Case 2: Word is NOT in reference text — Azure returned the approximation form
            # This is a genuine mispronunciation (e.g. "bijan" when "vision" was expected)
            # Always flag these regardless of confidence score
            correct_word = _normalize(approx_entry.get("correct_word", ""))
            rule_category = (approx_entry.get("rule_category") or "").strip()
            if word_lower == correct_word:
                continue
            reel_id = reel_map.get(rule_category) or None
            flagged.append({
                "spoken": word_lower,
                "correct": correct_word,
                "rule_category": rule_category,
                "reel_id": reel_id,
                "confidence": accuracy,
            })
            continue

        # ----------------------------------------------------------------
        # STEP 2: Two-pass mode — word_lower is the REFERENCE (correct) word.
        # Detect error via accuracy / phoneme scores / ErrorType,
        # then pull rule_category from by_correct_word.
        # ----------------------------------------------------------------

        # Determine threshold — function words get a lower bar (easier to flag)
        if word_lower in FUNCTION_WORDS_TH:
            effective_threshold = 60
        else:
            effective_threshold = accuracy_threshold

        # Determine if this word was mispronounced
        is_bad = False

        if error_type in ("Mispronunciation", "Insertion", "Omission"):
            # Azure explicitly flagged it — always trust this
            is_bad = True
        elif accuracy < effective_threshold:
            # Word-level score below threshold
            is_bad = True
        elif min_phoneme_score < 50 and worst_phoneme_name in INDIAN_ENGLISH_ERROR_PHONEMES:
            # A specific Indian English phoneme scored very low (lowered from 60 to 50)
            is_bad = True
            logger.info(f"Low phoneme score: {min_phoneme_score} for phoneme '{worst_phoneme_name}' in word '{word_lower}'")

        if not is_bad:
            continue

        # ----------------------------------------------------------------
        # STEP 3: Suppress high-confidence false positives.
        # If accuracy is high AND no ErrorType AND the word is not in our
        # by_correct map at all — it's likely noise (consonant cluster, etc.)
        # ----------------------------------------------------------------
        if accuracy >= 85 and (error_type in ("None", "", "none") or not error_type):
            if word_lower not in by_correct:
                # Not a word we track and high confidence — suppress
                continue

        # ----------------------------------------------------------------
        # STEP 4: Look up rule_category from by_correct_word
        # ----------------------------------------------------------------
        correct_entry = by_correct.get(word_lower)
        if correct_entry:
            rule_category = (correct_entry.get("rule_category") or "").strip()
            spoken_approx = _normalize(correct_entry.get("approximation") or word_lower)
            correct_word = word_lower
        else:
            # Word triggered is_bad but is not in our phoneme map.
            # If Azure explicitly flagged it as Mispronunciation, keep it — it's a
            # genuine error Azure's forced aligner detected, just not in our dictionary.
            if error_type == "Mispronunciation":
                rule_category = "general_mispronunciation"
                spoken_approx = f"[mispronounced: {word_lower}]"
                correct_word = word_lower
            else:
                rule_category = "unknown_substitution"
                spoken_approx = word_lower
                correct_word = word_lower

        # Final guard: never flag when spoken == correct
        # BUT allow through Azure-explicit Mispronunciation and unknown words with low scores
        if spoken_approx == correct_word and error_type != "Mispronunciation" and accuracy >= effective_threshold:
            continue

        reel_id = reel_map.get(rule_category) or None

        flagged.append({
            "spoken": spoken_approx,
            "correct": correct_word,
            "rule_category": rule_category,
            "reel_id": reel_id,
            "confidence": accuracy,
        })

    # ----------------------------------------------------------------
    # STEP 5: Deduplicate by correct word — keep lowest confidence (most genuine)
    # ----------------------------------------------------------------
    seen: dict[str, dict] = {}
    for error in flagged:
        key = error["correct"]
        if key not in seen or error["confidence"] < seen[key]["confidence"]:
            seen[key] = error

    # Filter out unknown_substitution but keep general_mispronunciation (Azure-flagged)
    result = [e for e in seen.values() if e["rule_category"] != "unknown_substitution"]

    logger.info(f"detect_from_azure_result returning {len(result)} flagged errors: {result}")
    return result


def detect_from_words(
    words: list[dict[str, Any]],
    *,
    accuracy_threshold: int = DEFAULT_ACCURACY_THRESHOLD,
) -> list[dict[str, Any]]:
    """Same as detect_from_azure_result but accepts a flat list of word dicts."""
    return detect_from_azure_result({"Words": words}, accuracy_threshold=accuracy_threshold)