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
from app.features.pronunciation.g2p_fallback import g2p_phonemes

logger = logging.getLogger(__name__)

DEFAULT_ACCURACY_THRESHOLD = 82  # Stricter default for better mispronunciation recall.
FUNCTION_WORD_THRESHOLD = 86     # Function words (the/this/that) need tighter scoring.
PHONEME_BAD_THRESHOLD = 70       # Lowered: general phonemes flagged more aggressively.
CRITICAL_PHONEME_THRESHOLD = 70  # Explicit threshold for V/W/TH/zh/r/h — even more sensitive.
FALSE_POSITIVE_SUPPRESSION = 97  # Suppress only when confidence is very high.

# Accent-level function words: only flag if Azure accuracy is below this threshold.
# Above it = accent difference, not an intelligibility error.
FUNCTION_WORD_EXEMPT_THRESHOLD = 50

FUNCTION_WORD_EXEMPTION: frozenset[str] = frozenset({
    "was", "for", "that", "from", "have", "good", "is",
    "are", "the", "a", "an", "and", "to", "of", "in",
    "it", "at", "by", "be", "do", "he", "we", "on",
    "as", "or", "but", "not", "so", "if", "me", "my",
    "us", "up", "go", "no", "had", "has", "did", "got",
    "get", "him", "his", "her", "our", "its",
})

# Layer 2: max phoneme edit distance (CMU or aligned IPA) to call it a substitution
PHONEME_SUBSTITUTION_MAX_DISTANCE = 3

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
_phonemizer_loaded = False
_phonemizer_available = False


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
    Compute phoneme-level edit distance using CMU dict, with g2p-en fallback.
    Returns None if either word has no phoneme sequence.
    """
    import pronouncing
    import editdistance as ed

    word_a_l = word_a.lower().strip()
    word_b_l = word_b.lower().strip()

    phones_a = pronouncing.phones_for_word(word_a_l)
    phones_b = pronouncing.phones_for_word(word_b_l)

    if phones_a and phones_b:
        a_seq = [p.rstrip("012") for p in phones_a[0].split()]
        b_seq = [p.rstrip("012") for p in phones_b[0].split()]
        return ed.eval(a_seq, b_seq)

    # Fallback: use g2p-en for BOTH words if either is missing from CMU
    seq_a = g2p_phonemes(word_a_l)
    seq_b = g2p_phonemes(word_b_l)
    if seq_a and seq_b:
        return ed.eval(seq_a, seq_b)

    logger.debug(f"No phoneme sequence for '{word_a_l}' or '{word_b_l}'")
    return None


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
            if dist is not None and dist <= PHONEME_SUBSTITUTION_MAX_DISTANCE and dist < best_dist:
                best_dist = dist
                best_ref = ref_w
        if best_ref and best_dist <= PHONEME_SUBSTITUTION_MAX_DISTANCE:
            extra_flags.append({
                "spoken": wl,
                "correct": best_ref,
                "rule_category": "phoneme_substitution",
                "reel_id": None,
                "confidence": max(20.0, 50.0 - best_dist * 15),
            })
    return extra_flags


def _run_nbest_word_substitution_check(
    azure_result: dict[str, Any],
    words: list[dict[str, Any]],
    reference_words: set[str],
) -> list[dict[str, Any]]:
    """
    Layer 3: Check N-Best word candidates for hidden substitutions.

    Scenario: User says "very", Azure's top hypothesis is "berry" (conf 0.85),
    but candidate 2 is "very" (conf 0.82). Top word not in reference, but
    a lower candidate IS → flag as substitution even if top word scored high.
    """
    flags: list[dict[str, Any]] = []

    # Preferred path: Azure top-level NBest hypotheses (actual SDK shape).
    nbest_hyps = (
        azure_result.get("NBest")
        or azure_result.get("Nbests")
        or azure_result.get("nbest")
        or []
    )
    if isinstance(nbest_hyps, list) and len(nbest_hyps) >= 2:
        top_words = nbest_hyps[0].get("Words") or nbest_hyps[0].get("words") or []
        for idx, top_word_entry in enumerate(top_words):
            top_word = _normalize(top_word_entry.get("Word", ""))
            if not top_word or top_word in reference_words:
                continue

            # Scan same word position across alternate hypotheses.
            for alt_hyp in nbest_hyps[1:]:
                alt_words = alt_hyp.get("Words") or alt_hyp.get("words") or []
                if idx >= len(alt_words):
                    continue
                cand_word = _normalize(alt_words[idx].get("Word", ""))
                if cand_word in reference_words:
                    flags.append({
                        "spoken": top_word,
                        "correct": cand_word,
                        "rule_category": "nbest_word_substitution",
                        "reel_id": None,
                        "confidence": float(alt_hyp.get("Confidence", 50.0)),
                    })
                    logger.info(
                        "Layer 3 N-Best substitution: top='%s' → candidate='%s' (alt_conf=%s)",
                        top_word,
                        cand_word,
                        alt_hyp.get("Confidence"),
                    )
                    break
        if flags:
            return flags

    # Backward-compatible fallback: per-word NBest alternatives (if provided by caller/tests).
    for word_entry in words:
        top_word = _normalize(word_entry.get("Word", ""))
        if not top_word or top_word in reference_words:
            continue
        local_nbests = word_entry.get("NBest", [])
        if len(local_nbests) < 2:
            continue
        for candidate in local_nbests[1:]:
            cand_word = _normalize(candidate.get("Word", ""))
            if cand_word in reference_words:
                flags.append({
                    "spoken": top_word,
                    "correct": cand_word,
                    "rule_category": "nbest_word_substitution",
                    "reel_id": None,
                    "confidence": float(candidate.get("Confidence", 50.0)),
                })
                logger.info(
                    "Layer 3 N-Best substitution (fallback): top='%s' → candidate='%s' (candidate_conf=%s)",
                    top_word,
                    cand_word,
                    candidate.get("Confidence"),
                )
                break
    return flags


def _run_stt_confusion_check(
    recognized_words: list[str],
    by_approx: dict,
) -> list[dict[str, Any]]:
    """
    Layer 4 standalone: Flag any recognized word that appears in the STT confusion table.
    PLUS dynamically generate pairs for any by_approximation entry with a sound-confusion category.
    """
    flags: list[dict[str, Any]] = []
    seen = set()

    # Predefined hardcoded pairs
    for word in recognized_words:
        wl = _normalize(word)
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

    # DYNAMIC GENERATION: Add by_approximation entries that follow sound-confusion patterns
    sound_confusion_categories = {
        "v_w_confusion", "w_to_v", "v_to_w_reversal",
        "th_d_confusion", "th_to_d", "th_to_t",
        "zh_j_confusion", "zh_to_j", "z_j",
        "h_dropping",
        "i_to_ee", "ae_to_e", "o_to_aa",
    }

    for word in recognized_words:
        wl = _normalize(word)
        if wl in seen:
            continue
        if wl in by_approx:
            entry = by_approx[wl]
            cat = entry.get("rule_category", "").strip()
            if cat in sound_confusion_categories:
                correct = entry.get("correct_word", "").lower().strip()
                if correct and correct != wl:
                    seen.add(wl)
                    flags.append({
                        "spoken": wl,
                        "correct": correct,
                        "rule_category": cat,
                        "reel_id": None,
                        "confidence": 40.0,
                    })
                    logger.info(f"Layer 4 dynamic STT confusion: '{wl}' → '{correct}' ({cat})")

    return flags


def _normalize(s: str) -> str:
    return (s or "").strip().lower()


def _extract_phoneme_score(phoneme: dict[str, Any]) -> float:
    """Extract a phoneme score while preserving zero-valued scores."""
    p_pa = phoneme.get("PronunciationAssessment", {})
    p_pa_score = p_pa.get("AccuracyScore")
    if p_pa_score is not None:
        return float(p_pa_score)
    p_score = phoneme.get("AccuracyScore")
    if p_score is not None:
        return float(p_score)
    p_score = phoneme.get("Score")
    if p_score is not None:
        return float(p_score)
    return 100.0


def _count_syllables(word: str) -> int:
    """Vowel-run heuristic syllable counter."""
    word = word.lower().strip(".,!?;:'\"")
    count = 0
    prev_vowel = False
    for ch in word:
        is_v = ch in "aeiouy"
        if is_v and not prev_vowel:
            count += 1
        prev_vowel = is_v
    if word.endswith("e") and count > 1:
        count -= 1
    return max(1, count)


def _classify_phonological_error(word: str, phonemes: list, accuracy: float) -> str:
    """
    Classify WHY a general_mispronunciation occurred, using Azure phoneme data
    and lexical heuristics. Returns one of:
      retroflex_substitution, syllable_compression, final_cluster_reduction,
      vowel_shift, consonant_cluster_simplification, general_mispronunciation.
    """
    word_lower = word.lower()
    VOWELS = {"aa", "ae", "ah", "ao", "aw", "ay", "eh", "er", "ey", "ih", "iy", "ow", "oy", "uh", "uw"}
    TH_PHONEMES = {"th", "dh"}

    bad_vowels: list[str] = []
    bad_consonants: list[str] = []
    if phonemes:
        for p in phonemes:
            score = _extract_phoneme_score(p)
            ph = (p.get("Phoneme") or p.get("phoneme") or "").lower()
            if score < PHONEME_BAD_THRESHOLD and ph:
                if ph in TH_PHONEMES or (ph in ("t", "d") and word_lower in FUNCTION_WORDS_TH):
                    return "retroflex_substitution"
                if ph in VOWELS:
                    bad_vowels.append(ph)
                else:
                    bad_consonants.append(ph)

    # Long words with low accuracy → syllable compression
    if _count_syllables(word_lower) >= 4 and accuracy < 78:
        return "syllable_compression"

    # Words ending in consonant clusters → final cluster reduction
    FINAL_CLUSTERS = ("nths", "ths", "nds", "nts", "sts", "rds", "lds", "mps", "lts", "rts", "cts", "xts", "sks")
    if any(word_lower.endswith(c) for c in FINAL_CLUSTERS) and accuracy < 82:
        return "final_cluster_reduction"

    # Words starting with consonant clusters → cluster simplification
    INITIAL_CLUSTERS = (
        "str", "spr", "spl", "scr", "thr", "shr",
        "fl", "fr", "gl", "gr", "bl", "br", "cl", "cr",
        "dr", "pr", "tr", "sl", "sm", "sn", "sp", "st", "sw", "sk",
    )
    if any(word_lower.startswith(c) for c in INITIAL_CLUSTERS) and bad_consonants:
        return "consonant_cluster_simplification"

    # Vowel-dominant phoneme errors → vowel shift
    if bad_vowels and len(bad_vowels) >= len(bad_consonants):
        return "vowel_shift"

    return "general_mispronunciation"


def detect_from_azure_result(
    azure_result: dict[str, Any],
    *,
    reference_text: str = "",
    accuracy_threshold: int = DEFAULT_ACCURACY_THRESHOLD,
    proper_nouns: frozenset[str] = frozenset(),
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
        if word_lower in proper_nouns:
            logger.info("Proper noun skip: '%s'", word_lower)
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
            p_score = _extract_phoneme_score(p)
            p_name = _normalize(p.get("Phoneme") or p.get("phoneme") or "")
            if p_score < min_phoneme_score:
                min_phoneme_score = p_score
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
                if accuracy >= 90 and min_phoneme_score >= 75:
                    logger.info(
                        "Suppressed approx-word flag for '%s' (reference hit, accuracy=%.1f, min_phoneme=%.1f)",
                        word_lower,
                        accuracy,
                        min_phoneme_score,
                    )
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
            # Different thresholds for critical vs general phonemes
            critical_phonemes = {"w", "v", "th", "dh", "zh", "z", "jh", "r", "h"}
            effective_phoneme_threshold = (
                CRITICAL_PHONEME_THRESHOLD if worst_phoneme_name in critical_phonemes
                else PHONEME_BAD_THRESHOLD
            )
            if min_phoneme_score < effective_phoneme_threshold:
                is_bad = True
                logger.info(
                    f"Low phoneme score: {min_phoneme_score:.1f} for phoneme '{worst_phoneme_name}' in word '{word_lower}'"
                )
        elif accuracy < 90 and phonemes:
            # Layer 5: Even if word accuracy looks "acceptable", still catch weak
            # Indian-English-sensitive phonemes that Azure may not hard-flag.
            weak_phoneme_count = sum(
                1 for p in phonemes
                if _extract_phoneme_score(p) < 75
                and _normalize(p.get("Phoneme") or p.get("phoneme") or "") in INDIAN_ENGLISH_ERROR_PHONEMES
            )
            if weak_phoneme_count >= 1:
                is_bad = True
                logger.info(
                    "Layer 5 weak phoneme trigger: %d weak phoneme(s) in '%s' (word accuracy=%.1f)",
                    weak_phoneme_count,
                    word_lower,
                    accuracy,
                )

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
        # Require ALL phonemes to be strong, not just the min.
        # ----------------------------------------------------------------
        if (
            accuracy >= FALSE_POSITIVE_SUPPRESSION
            and (error_type in ("None", "", "none") or not error_type)
            and word_lower not in by_correct
        ):
            all_phonemes_strong = True
            if phonemes:
                for p in phonemes:
                    p_score = _extract_phoneme_score(p)
                    if p_score < 85:
                        all_phonemes_strong = False
                        break
            else:
                all_phonemes_strong = False  # no phoneme data — be conservative

            if all_phonemes_strong:
                logger.info(
                    "Suppressed potential false positive for '%s' (accuracy=%.1f, all phonemes ≥85)",
                    word_lower, accuracy
                )
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
                rule_category = _classify_phonological_error(word_lower, phonemes, accuracy)
                spoken_approx = word_lower
                correct_word = word_lower
            else:
                rule_category = "unknown_substitution"
                spoken_approx = word_lower
                correct_word = word_lower

        # ----------------------------------------------------------------
        # STEP 3b (post-category): Function word exemption.
        # Suppress accent-level errors on function words. Keep only the
        # diagnostically meaningful Indian English categories: th_to_d,
        # th_to_t, h_dropping, v_to_w, w_to_v, retroflex_substitution.
        # ----------------------------------------------------------------
        _ACCENT_LEVEL_CATS = frozenset({
            "general_mispronunciation",
            "vowel_shift",
            "final_cluster_reduction",
            "consonant_cluster_simplification",
            "syllable_compression",
        })
        if word_lower in FUNCTION_WORD_EXEMPTION and rule_category in _ACCENT_LEVEL_CATS:
            logger.info(
                "Function word exemption: suppressed '%s' (%s = accent noise)",
                word_lower, rule_category,
            )
            continue

        # Guard B: prioritize STT confusion table IF word triggered as bad
        if word_lower in STT_CONFUSION_PAIRS:
            intended, cat = STT_CONFUSION_PAIRS[word_lower]
            rule_category = cat
            correct_word = intended
            spoken_approx = word_lower
        elif spoken_approx == correct_word and error_type != "Mispronunciation" and accuracy >= effective_threshold:
            continue

        reel_id = reel_map.get(rule_category) or None

        # Skip: Azure flagged it but we have no substitution data (spoken==correct)
        if spoken_approx == correct_word and rule_category == "general_mispronunciation":
            logger.info(
                "No-substitution skip: '%s' (spoken==correct, no useful data for feedback)",
                word_lower,
            )
            continue

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
    by_approx = phoneme_map.get("by_approximation") or {}
    stt_flags = _run_stt_confusion_check(recognized_word_list, by_approx)
    for sf in stt_flags:
        if sf["spoken"] not in already_flagged_words and sf["correct"] not in already_flagged_words:
            flagged.append(sf)
            already_flagged_words.add(sf["spoken"])
            already_flagged_words.add(sf["correct"])
            logger.info(f"  Layer 4 STT confusion: '{sf['spoken']}' → '{sf['correct']}' ({sf['rule_category']})")

    # Layer 3: N-Best word substitution (requires reference_words)
    if reference_words:
        nbest_flags = _run_nbest_word_substitution_check(azure_result, words, reference_words)
        for nf in nbest_flags:
            if nf["spoken"] not in already_flagged_words and nf["correct"] not in already_flagged_words:
                flagged.append(nf)
                already_flagged_words.add(nf["spoken"])
                already_flagged_words.add(nf["correct"])
                logger.info(f"  Layer 3 N-Best: '{nf['spoken']}' → '{nf['correct']}' ({nf['rule_category']})")

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


if __name__ == "__main__":
    d1 = _phoneme_edit_distance("pepul", "people")
    d2 = _phoneme_edit_distance("peeple", "people")
    d3 = _phoneme_edit_distance("verry", "very")
    print("_phoneme_edit_distance('pepul', 'people') =", d1)
    print("_phoneme_edit_distance('peeple', 'people') =", d2)
    print("_phoneme_edit_distance('verry', 'very') =", d3)