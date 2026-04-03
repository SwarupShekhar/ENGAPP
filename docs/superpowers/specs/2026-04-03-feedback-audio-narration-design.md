# Feedback Audio Narration — Design Spec

**Date:** 2026-04-03  
**Feature:** Listen to post-call feedback section-by-section via TTS  
**Status:** Approved

---

## Overview

Users can tap a play button on each score card in the post-call feedback screen to hear their feedback narrated aloud. This removes the need to read through long text feedback. Audio is generated on-demand per section when the user taps play.

---

## Scope

Four sections, each independently playable:
1. **Pronunciation** (highest priority)
2. **Grammar**
3. **Vocabulary**
4. **Fluency**

---

## Architecture

### Flow

```
Mobile (CallFeedbackScreen)
  → taps play on a score card
  → POST /api/tts/feedback-narration  (backend-ai)
  → NarrationService builds English script from templates
  → InworldTTSService (async) synthesizes audio
  → returns { audio_base64, text }
  → Mobile plays audio via expo-av
```

### Backend-AI: New `features/tts/` module

**`features/tts/narration_service.py`**
- Builds a short English narration script (≤120 words) per section from deterministic templates
- Inputs: section name, score (0–100), justification string, errors array
- Returns: plain English string ready for TTS synthesis
- No Gemini — templates only (fast, free, tunable server-side)

Script structure per section:
- Opening: "Your [section] score is [score] out of 100."
- Middle: 1–2 sentence justification
- Errors: up to 2 specific examples with correction (pronunciation and grammar only)
- Close: brief encouraging tip

**`features/tts/routes.py`**
- `POST /api/tts/feedback-narration`
- Request body:
  ```json
  {
    "section": "pronunciation",
    "score": 62,
    "justification": "You struggled with consonant sounds...",
    "errors": [
      { "spoken": "dis", "correct": "this", "rule_category": "th_to_d" },
      { "spoken": "wery", "correct": "very", "rule_category": "v_to_w" }
    ]
  }
  ```
- Response:
  ```json
  { "audio_base64": "<mp3 bytes base64>", "text": "<narration script>" }
  ```
- Registered in `main.py` under `/api/tts`

**`InworldTTSService` — async fix**
- Current `synthesize_hinglish()` uses blocking `httpx.Client` — blocks the FastAPI event loop
- Replace with `async def synthesize()` using `httpx.AsyncClient`
- This is the primary latency fix (~200–400ms improvement)
- Language: English (Inworld Hinglish mixing is unreliable; English is clean and clear)
- Voice: `settings.inworld_character_id` (defaults to "Abby")

**`config.py`**
- Set `tts_provider` default to `"inworld"` (was `"azure"`)

---

### Mobile: `CallFeedbackScreen.tsx`

**Per score card UI:**
- Add a small `Ionicons` play/pause icon button in the top-right corner of each score card
- States: idle → loading (spinner) → playing → idle
- Only one section plays at a time — tapping a second card stops the first

**Audio playback:**
- Use `expo-av` `Audio.Sound`
- Receive `audio_base64` from response
- Write to a temp file with `expo-file-system` (`FileSystem.cacheDirectory`)
- Load and play from the temp URI
- Clean up sound object on unmount and when a new section starts

**Data sent (already available in component state):**
- Section name
- Score from existing `scores` object
- `justification` from `session.analyses[0].justifications[section]`
- `errors` — pronunciation issues (for pronunciation section) or grammar mistakes (for grammar section)

**New API function:** `mobile/src/api/englivo/tts.ts`
- `fetchFeedbackNarration(payload): Promise<{ audio_base64: string, text: string }>`

---

## Latency Budget

| Step | Target |
|------|--------|
| Script generation (templates) | <5ms |
| Inworld TTS API (async) | ~800–1200ms |
| Audio decode + file write | ~50ms |
| **Total to first sound** | **~1–1.5s** |

Scripts are kept under 120 words to minimize TTS generation time.

---

## Error Handling

- If Inworld TTS returns empty bytes → show a toast "Couldn't load audio, try again"
- If network fails → same toast, button returns to idle state
- No retry logic — user can tap again

---

## Out of Scope

- Pre-generating audio at call end (future optimization)
- Hinglish narration (deferred — Inworld Hinglish unreliable)
- Caching audio between sessions
- Narrating the full AI summary or transcript
