# Pronunciation detector fixes — verification

Status of the four requested fixes as of the current codebase.

---

## Fix 1 — Duplicate suppression (test_09)

**Required:** Deduplicate `flagged_errors` by `"correct"` word before returning; when duplicates exist, keep the entry with **lower** confidence (more likely genuine).

**Status: DONE**

- **Where:** `app/services/pronunciation_detector.py`, after building `flagged`, before `return`.
- **Logic:** Build `seen_correct` keyed by `error["correct"]`. For each error, keep it only if this is the first time we see that `correct` or the new error has **lower** confidence than the one already stored; then `return list(seen_correct.values())`.
- **Result:** For test_09, if "that" is flagged twice with the same `correct`, only one entry is returned, the one with lower confidence.

---

## Fix 2 — High-confidence false positive suppression (test_01, test_03, test_04)

**Required:** If confidence ≥ 85 and the **spoken** form is **not** in the phoneme map’s `by_approximation` index, suppress the flag (do not add to `flagged_errors`).

**Status: DONE**

- **Where:** `app/services/pronunciation_detector.py`, in the main word loop, after computing `is_bad` and before appending.
- **Logic:**  
  `if is_bad and accuracy >= 85 and word_lower not in by_approx: is_bad = False`  
  So high-confidence words that are not in `by_approximation` are not flagged (e.g. "drrink", "went/vent", "it/eet" when spoken correctly and not in the map).

---

## Fix 3 — test_10 category correction (unknown substitution)

**Required:** When the two-pass flow detects a mismatch and the spoken form does **not** exist in `by_approximation`, do not assign a wrong category; set `rule_category = "unknown_substitution"`, `reel_id = null`, and still include the item in `flagged_errors` for logging.

**Status: DONE (with caveat)**

- **Where:** `app/services/pronunciation_detector.py`, in the `if is_bad` block when adding an error.
- **Logic:** When we have no rule from the map (`not rule_category`), we set:
  - `rule_category = "unknown_substitution"`
  - `reel_id = None`
  and still append to `flagged`. So wrong reel triggers are avoided when the word is not in the map.
- **Caveat:** The detector only sees the word string coming from Azure (one `Word` per item). With `enable_miscue=True`, Azure may expose reference vs recognized differently per word. If the payload gives the **reference** word (e.g. "will") with a low score, and "will" is in `by_correct` with e.g. `w_to_v`, we would still assign that category. Fully avoiding mis-categorisation for test_10 (will→bill, win→been) may require the pipeline to pass the **recognized** (spoken) form per word and, when it differs from reference, treat it as “no map match” and force `unknown_substitution` (and optionally still check spoken not in `by_approximation`). Current code does the right thing whenever the word we look up is not in the map.

---

## Fix 4 — test_02 reference text pairing

**Required:** Ensure the test script pairs test_02 audio with the correct reference text so the detector is not given the wrong reference (e.g. "is"/"this" flagged when reference is "The cat sat on the mat" suggests wrong reference or wrong audio).

**Status: DONE**

- **Where:** `run_all_tests.py`.
- **Logic:** `TEST_CASES` explicitly sets  
  `"test_02.wav.m4a": "The cat sat on the mat."`  
  and the script sends `reference_text` in the form data when calling the assess API:  
  `data['reference_text'] = ref_text` when `ref_text` is not `None`.
- **Result:** test_02 is always assessed with "The cat sat on the mat." as reference. If "is"/"this" still appear in flagged_errors for test_02, the next place to check is the API (that it uses the submitted `reference_text` for Azure PA) and the audio file itself (that it matches that sentence).

---

## Summary

| Fix | Description                     | Status | Notes                                      |
|-----|---------------------------------|--------|--------------------------------------------|
| 1   | Dedupe by `correct`, keep lower confidence | Done   | Implemented at end of detector.             |
| 2   | Suppress if confidence ≥ 85 and not in `by_approximation` | Done   | Implemented in word loop.                   |
| 3   | `unknown_substitution` + `reel_id = null` when no map match | Done   | Depends on Azure word being “spoken” where relevant. |
| 4   | test_02 reference text pairing  | Done   | `run_all_tests.py` uses correct reference.   |

---

## Files touched

- `app/services/pronunciation_detector.py` — Fixes 1, 2, 3 (and removal of unused `deduped`).
- `run_all_tests.py` — Fix 4 (reference text for test_02 and overall pairing).
