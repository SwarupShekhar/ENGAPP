"""
Pronunciation detector — multi-layer analysis of Azure PA results.

Layer 1 (Azure PA): flags words Azure explicitly marks + words below accuracy threshold.
Layer 2 (Phoneme edit distance): catches real-word substitutions like barking→walking
         that Azure PA scores 100 because the spoken word is phonetically valid.
Layer 4 (STT confusion pairs): hardcoded Indian English ASR substitution patterns
         where the ASR writes a different real word (e.g. "berry" when user said "very").
"""
from __future__ import annotations

import logging
from typing import Any

from app.phoneme_loader import get_phoneme_map, get_reel_map

logger = logging.getLogger(__name__)

DEFAULT_ACCURACY_THRESHOLD = 70  # Raised: Azure is lenient with Indian accents, need higher bar to catch real errors
FUNCTION_WORD_THRESHOLD = 75     # Higher bar for function words (the/this/that) — common th_to_d errors
PHONEME_BAD_THRESHOLD = 65       # Flag if any Indian English error phoneme scores below this
FALSE_POSITIVE_SUPPRESSION = 80  # Only suppress if word accuracy >= this AND not in our phoneme map

# These phonemes are the ONLY ones that indicate Indian English pattern errors.
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

FUNCTION_WORDS_TH = {"the", "this", "that", "them", "they", "there", "then", "those", "these"}

# ── Layer 4: STT Confusion Pairs ──────────────────────────────────────
# When ASR writes word A but the user likely said word B (common Indian English swaps).
# Format: transcribed_word → (intended_word, rule_category)
STT_CONFUSION_PAIRS: dict[str, tuple[str, str]] = {
    # ── v/w swaps (Indian English most common) ──────────────────────────
    "berry": ("very", "v_to_w_reversal"),
    "wary": ("very", "w_to_v"),
    "vest": ("west", "v_to_w_reversal"),
    "veil": ("whale", "v_to_w_reversal"),
    "wile": ("vile", "w_to_v"),
    "wine": ("vine", "w_to_v"),
    "worse": ("voice", "w_to_v"),
    "wiper": ("viper", "w_to_v"),
    "vet": ("wet", "v_to_w_reversal"),
    "vow": ("wow", "v_to_w_reversal"),
    "wane": ("vain", "w_to_v"),
    "weil": ("veil", "w_to_v"),
    "wast": ("vast", "w_to_v"),
    "wery": ("very", "w_to_v"),
    "wideo": ("video", "w_to_v"),
    "wellcome": ("welcome", "w_to_v"),  # hypercorrection
    "woice": ("voice", "w_to_v"),
    "wiolent": ("violent", "w_to_v"),
    "wery": ("very", "w_to_v"),
    "walue": ("value", "w_to_v"),
    "wehicle": ("vehicle", "w_to_v"),
    "wersion": ("version", "w_to_v"),
    "wision": ("vision", "w_to_v"),
    "wictory": ("victory", "w_to_v"),
    "willage": ("village", "w_to_v"),
    "wait": ("bait", "v_to_w_reversal"),
    "wane": ("vane", "w_to_v"),
    "vowel": ("bowel", "v_to_w_reversal"),
    # ── th/d swaps ──────────────────────────────────────────────────────
    "den": ("then", "th_to_d"),
    "dare": ("there", "th_to_d"),
    "day": ("they", "th_to_d"),
    "dose": ("those", "th_to_d"),
    "dis": ("this", "th_to_d"),
    "dough": ("though", "th_to_d"),
    "doze": ("those", "th_to_d"),
    "udder": ("other", "th_to_d"),
    "mudder": ("mother", "th_to_d"),
    "fadder": ("father", "th_to_d"),
    "broder": ("brother", "th_to_d"),
    "wid": ("with", "th_to_d"),
    "dere": ("there", "th_to_d"),
    "dem": ("them", "th_to_d"),
    "dat": ("that", "th_to_d"),
    "der": ("their", "th_to_d"),
    "dey": ("they", "th_to_d"),
    "dese": ("these", "th_to_d"),
    "dose": ("those", "th_to_d"),
    "den": ("then", "th_to_d"),
    "dis": ("this", "th_to_d"),
    "anoder": ("another", "th_to_d"),
    "toder": ("together", "th_to_d"),
    "widout": ("without", "th_to_d"),
    "altough": ("although", "th_to_d"),
    # ── th/t swaps ──────────────────────────────────────────────────────
    "tick": ("thick", "th_to_t"),
    "tin": ("thin", "th_to_t"),
    "tree": ("three", "th_to_t"),
    "tank": ("thank", "th_to_t"),
    "taught": ("thought", "th_to_t"),
    "true": ("through", "th_to_t"),
    "trow": ("throw", "th_to_t"),
    "tread": ("thread", "th_to_t"),
    "trust": ("thrust", "th_to_t"),
    "bat": ("bath", "th_to_t"),
    "mats": ("maths", "th_to_t"),
    "wit": ("with", "th_to_t"),
    "boat": ("both", "th_to_t"),
    "moat": ("moth", "th_to_t"),
    "tink": ("think", "th_to_t"),
    "tought": ("thought", "th_to_t"),
    "tings": ("things", "th_to_t"),
    "ting": ("thing", "th_to_t"),
    "tird": ("third", "th_to_t"),
    "tirty": ("thirty", "th_to_t"),
    "tousand": ("thousand", "th_to_t"),
    "trough": ("through", "th_to_t"),
    "trilling": ("thrilling", "th_to_t"),
    "treaten": ("threaten", "th_to_t"),
    "teme": ("theme", "th_to_t"),
    "teory": ("theory", "th_to_t"),
    # ── Short/long vowel pairs (i → ee) ─────────────────────────────────
    "ship": ("sheep", "i_to_ee"),
    "bit": ("beat", "i_to_ee"),
    "sit": ("seat", "i_to_ee"),
    "fill": ("feel", "i_to_ee"),
    "hill": ("heel", "i_to_ee"),
    "lip": ("leap", "i_to_ee"),
    "live": ("leave", "i_to_ee"),
    "slip": ("sleep", "i_to_ee"),
    "rich": ("reach", "i_to_ee"),
    "dip": ("deep", "i_to_ee"),
    "chip": ("cheap", "i_to_ee"),
    "his": ("he's", "i_to_ee"),
    "bitch": ("beach", "i_to_ee"),
    "pitch": ("peach", "i_to_ee"),
    "mitt": ("meat", "i_to_ee"),
    "fit": ("feet", "i_to_ee"),
    "lid": ("lead", "i_to_ee"),
    "tin": ("teen", "i_to_ee"),
    "bin": ("been", "i_to_ee"),
    "grin": ("green", "i_to_ee"),
    "grit": ("greet", "i_to_ee"),
    "wick": ("week", "i_to_ee"),
    # ── oo/u vowel pairs ─────────────────────────────────────────────────
    "pull": ("pool", "o_to_aa"),
    "full": ("fool", "o_to_aa"),
    "look": ("Luke", "o_to_aa"),
    "wood": ("would", "o_to_aa"),
    "bull": ("bool", "o_to_aa"),
    "cook": ("kook", "o_to_aa"),
    # ── ae/e vowel confusion ─────────────────────────────────────────────
    "bed": ("bad", "ae_to_e"),
    "set": ("sat", "ae_to_e"),
    "men": ("man", "ae_to_e"),
    "pet": ("pat", "ae_to_e"),
    "pen": ("pan", "ae_to_e"),
    "met": ("mat", "ae_to_e"),
    "ten": ("tan", "ae_to_e"),
    "bend": ("band", "ae_to_e"),
    "send": ("sand", "ae_to_e"),
    "lend": ("land", "ae_to_e"),
    "hem": ("ham", "ae_to_e"),
    "peck": ("pack", "ae_to_e"),
    "neck": ("knack", "ae_to_e"),
    "deck": ("dack", "ae_to_e"),
    # ── h-dropping ───────────────────────────────────────────────────────
    "ello": ("hello", "h_dropping"),
    "im": ("him", "h_dropping"),
    "er": ("her", "h_dropping"),
    "is": ("his", "h_dropping"),
    "ope": ("hope", "h_dropping"),
    "old": ("hold", "h_dropping"),
    "ear": ("hear", "h_dropping"),
    "eavy": ("heavy", "h_dropping"),
    # ── zh/j sound ───────────────────────────────────────────────────────
    "jision": ("vision", "zh_to_j"),
    "jision": ("vision", "zh_to_j"),
    "jezure": ("measure", "zh_to_j"),
    "plejure": ("pleasure", "zh_to_j"),
    "trejure": ("treasure", "zh_to_j"),
    "divijion": ("division", "zh_to_j"),
    "conclusjon": ("conclusion", "zh_to_j"),
    # ── r-rolling ────────────────────────────────────────────────────────
    "wery": ("very", "r_rolling"),
    "woad": ("road", "r_rolling"),
    "wun": ("run", "r_rolling"),
    "wight": ("right", "r_rolling"),
    # ── Schwa/vowel reduction patterns ───────────────────────────────────
    "abbout": ("about", "schwa_prothesis"),
    "abuot": ("about", "schwa_prothesis"),
    "eenglish": ("English", "schwa_prothesis"),
    "ispecially": ("especially", "schwa_prothesis"),
    "istart": ("start", "schwa_prothesis"),
    "eschool": ("school", "schwa_prothesis"),
    "bet": ("bat", "ae_to_e"),
    # h-dropping
    "art": ("heart", "h_dropping"),
    "air": ("hair", "h_dropping"),
    "arm": ("harm", "h_dropping"),
    "ear": ("hear", "h_dropping"),
    "eat": ("heat", "h_dropping"),
    "old": ("hold", "h_dropping"),
    "ill": ("hill", "h_dropping"),
    "all": ("hall", "h_dropping"),
    # r variants (retroflex)
    "barking": ("walking", "r_rolling"),
    "bored": ("board", "r_rolling"),
    "card": ("cod", "r_rolling"),
    # zh/j confusion
    "major": ("measure", "zh_to_j"),
    "pledger": ("pleasure", "zh_to_j"),
    "jure": ("sure", "zh_to_j"),
}

# Precomputed reverse lookup: intended → list of possible ASR outputs
_STT_REVERSE: dict[str, list[tuple[str, str]]] = {}
for _asr, (_intended, _cat) in STT_CONFUSION_PAIRS.items():
    _STT_REVERSE.setdefault(_intended.lower(), []).append((_asr.lower(), _cat))


# ── Layer 2: Phoneme Edit Distance ───────────────────────────────────
_pronouncing_loaded = False
_pronouncing_available = False


def _ensure_pronouncing():
    """Lazy-load the pronouncing package (CMU dict)."""
    global _pronouncing_loaded, _pronouncing_available
    if _pronouncing_loaded:
        return _pronouncing_available
    _pronouncing_loaded = True
    try:
        import pronouncing  # noqa: F401
        import editdistance  # noqa: F401
        _pronouncing_available = True
    except ImportError:
        logger.warning("pronouncing/editdistance not installed — Layer 2 disabled")
        _pronouncing_available = False
    return _pronouncing_available


def _phoneme_edit_distance(word_a: str, word_b: str) -> int | None:
    """
    Compute phoneme-level edit distance between two English words using CMU dict.
    Returns None if either word is not in CMU dict.
    """
    import pronouncing
    import editdistance as ed

    phones_a = pronouncing.phones_for_word(word_a.lower())
    phones_b = pronouncing.phones_for_word(word_b.lower())
    if not phones_a or not phones_b:
        return None
    # Use first pronunciation variant, strip stress markers
    a_seq = [p.rstrip("012") for p in phones_a[0].split()]
    b_seq = [p.rstrip("012") for p in phones_b[0].split()]
    return ed.eval(a_seq, b_seq)


def _run_phoneme_distance_pass(
    recognized_words: list[str],
    reference_words: set[str],
) -> list[dict[str, Any]]:
    """
    Layer 2: For each recognized word, check if a phonetically similar but different word
    in the reference set is a closer match — indicating a real-word substitution.
    """
    if not _ensure_pronouncing():
        return []

    extra_flags: list[dict[str, Any]] = []

    for word in recognized_words:
        wl = word.lower().strip()
        if not wl or len(wl) < 3:
            continue
        # Skip if the word IS in the reference (correct match)
        if wl in reference_words:
            continue
        # Check STT confusion pairs first (Layer 4) — fast lookup
        if wl in STT_CONFUSION_PAIRS:
            intended, cat = STT_CONFUSION_PAIRS[wl]
            extra_flags.append({
                "spoken": wl,
                "correct": intended,
                "rule_category": cat,
                "reel_id": None,
                "confidence": 30.0,  # Low confidence = severe issue
            })
            continue
        # Phoneme edit distance against reference words
        best_ref = None
        best_dist = 999
        for ref_w in reference_words:
            if ref_w == wl:
                continue
            dist = _phoneme_edit_distance(wl, ref_w)
            if dist is not None and dist <= 2 and dist < best_dist:
                best_dist = dist
                best_ref = ref_w
        if best_ref and best_dist <= 2:
            extra_flags.append({
                "spoken": wl,
                "correct": best_ref,
                "rule_category": "phoneme_substitution",
                "reel_id": None,
                "confidence": max(20.0, 50.0 - best_dist * 15),
            })
    return extra_flags


def _run_stt_confusion_check(
    recognized_words: list[str],
) -> list[dict[str, Any]]:
    """
    Layer 4 standalone: Flag any recognized word that appears in the STT confusion table.
    Runs independently of Azure PA scores.
    """
    flags: list[dict[str, Any]] = []
    seen = set()
    for word in recognized_words:
        wl = word.lower().strip()
        if wl in seen:
            continue
        if wl in STT_CONFUSION_PAIRS:
            seen.add(wl)
            intended, cat = STT_CONFUSION_PAIRS[wl]
            flags.append({
                "spoken": wl,
                "correct": intended,
                "rule_category": cat,
                "reel_id": None,
                "confidence": 30.0,
            })
    return flags


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
        # Handle both Azure NBest and our internal Nbests naming
        _nb = azure_result.get('Nbests') or azure_result.get('NBest') or azure_result.get('nbest') or []
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

        # Function words like "the/this/that" get a higher bar (easier to flag)
        # because th_to_d errors are extremely common in Indian English
        if word_lower in FUNCTION_WORDS_TH:
            effective_threshold = FUNCTION_WORD_THRESHOLD
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
        elif min_phoneme_score < PHONEME_BAD_THRESHOLD and worst_phoneme_name in INDIAN_ENGLISH_ERROR_PHONEMES:
            # A specific Indian English error phoneme scored below our threshold
            is_bad = True
            logger.info(f"Low phoneme score: {min_phoneme_score:.1f} for phoneme '{worst_phoneme_name}' in word '{word_lower}'")
        elif accuracy < 85 and phonemes:
            # Layer 5: Even if word accuracy looks OK (70-84), check if multiple phonemes
            # are weak — this catches Indian accent softening that Azure doesn't hard-flag
            weak_phoneme_count = sum(
                1 for p in phonemes
                if (p.get("PronunciationAssessment", {}).get("AccuracyScore") or p.get("AccuracyScore") or 100) < 70
                and _normalize(p.get("Phoneme") or p.get("phoneme") or "") in INDIAN_ENGLISH_ERROR_PHONEMES
            )
            if weak_phoneme_count >= 2:
                is_bad = True
                logger.info(f"Layer 5 multi-phoneme weak: {weak_phoneme_count} weak phonemes in '{word_lower}' (word accuracy={accuracy:.1f})")

        if not is_bad:
            continue

        # ----------------------------------------------------------------
        # STEP 2b: Phoneme distance fallback — no phoneme data from Azure.
        # In free-speech mode Azure sometimes omits Phonemes for low-scoring
        # words. Run phoneme edit distance against STT_CONFUSION_PAIRS keys to
        # identify the likely intended word before we hit the suppression step.
        # ----------------------------------------------------------------
        if not phonemes and _ensure_pronouncing():
            best_cf_match: tuple[str, str, str] | None = None
            best_cf_dist = 999
            for cf_key, (cf_intended, cf_cat) in STT_CONFUSION_PAIRS.items():
                d = _phoneme_edit_distance(word_lower, cf_key)
                if d is not None and d <= 1 and d < best_cf_dist:
                    best_cf_dist = d
                    best_cf_match = (cf_key, cf_intended, cf_cat)
            if best_cf_match:
                _, cf_intended, cf_cat = best_cf_match
                if cf_intended.lower() != word_lower:
                    reel_id = reel_map.get(cf_cat)
                    flagged.append({
                        "spoken": word_lower,
                        "correct": cf_intended,
                        "rule_category": cf_cat,
                        "reel_id": reel_id,
                        "confidence": accuracy,
                    })
                    logger.info(
                        f"  Step2b phoneme-dist fallback (no phonemes): '{word_lower}' → '{cf_intended}' ({cf_cat}, dist={best_cf_dist})"
                    )
                    continue

        # ----------------------------------------------------------------
        # STEP 3: Suppress high-confidence false positives.
        # If accuracy is high AND no ErrorType AND the word is not in our
        # by_correct map at all — it's likely noise (consonant cluster, etc.)
        # ----------------------------------------------------------------
        if accuracy >= FALSE_POSITIVE_SUPPRESSION and (error_type in ("None", "", "none") or not error_type):
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

        # Guard B: prioritize STT confusion table IF word triggered as bad
        if word_lower in STT_CONFUSION_PAIRS:
            intended, cat = STT_CONFUSION_PAIRS[word_lower]
            rule_category = cat
            correct_word = intended
            spoken_approx = word_lower
        elif spoken_approx == correct_word and error_type != "Mispronunciation" and accuracy >= effective_threshold:
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
    # STEP 5: Layer 2 (phoneme edit distance) + Layer 4 (STT confusion pairs)
    # Run independently of Azure PA — catches real-word substitutions.
    # ----------------------------------------------------------------
    recognized_word_list = [
        _normalize(w.get("Word") or w.get("word") or "")
        for w in words
        if (w.get("Word") or w.get("word") or "").strip()
    ]
    already_flagged_words = {e["correct"] for e in flagged} | {e["spoken"] for e in flagged}

    # Layer 4: STT confusion pairs (fast, no deps)
    stt_flags = _run_stt_confusion_check(recognized_word_list)
    for sf in stt_flags:
        if sf["spoken"] not in already_flagged_words and sf["correct"] not in already_flagged_words:
            flagged.append(sf)
            already_flagged_words.add(sf["spoken"])
            already_flagged_words.add(sf["correct"])
            logger.info(f"  Layer 4 STT confusion: '{sf['spoken']}' → '{sf['correct']}' ({sf['rule_category']})")

    # Layer 2: Phoneme edit distance (requires pronouncing + editdistance)
    if reference_words:
        ped_flags = _run_phoneme_distance_pass(recognized_word_list, reference_words)
        for pf in ped_flags:
            if pf["spoken"] not in already_flagged_words and pf["correct"] not in already_flagged_words:
                flagged.append(pf)
                already_flagged_words.add(pf["spoken"])
                already_flagged_words.add(pf["correct"])
                logger.info(f"  Layer 2 phoneme dist: '{pf['spoken']}' → '{pf['correct']}' ({pf['rule_category']})")

    # ----------------------------------------------------------------
    # STEP 6: Deduplicate by correct word — keep lowest confidence (most genuine)
    # ----------------------------------------------------------------
    seen: dict[str, dict] = {}
    for error in flagged:
        key = error["correct"]
        if key not in seen or error["confidence"] < seen[key]["confidence"]:
            seen[key] = error

    # Filter out unknown_substitution but keep everything else
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