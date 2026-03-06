import requests
import os
import json

BASE_URL = "http://localhost:8001/api/pronunciation"
AUDIO_DIR = "/Users/swarupshekhar/AndroidStudioProjects/EngR_app/backend-ai"

# Reference texts for each test file
TEST_CASES = {
    "test_01.wav.m4a": "I drink water every morning.",  # Issue 3: force reference so "water" appears in word list (avoid STT "butter")
    "test_02.wav.m4a": "The cat sat on the mat.",  # Fix 4: Correct reference text
    "test_03.wav.m4a": "I went to the store this morning.",
    "test_04.wav.m4a": "This is it.",
    "test_05.wav.m4a": "I can hear you.",
    "test_06.wav.m4a": "The quick brown fox jumps over the lazy dog.",
    "test_07.wav.m4a": "The dog ran into the house.",
    "test_08.wav.m4a": None, # Free speech
    "test_09.wav.m4a": "That is that.",
    "test_10.wav.m4a": "I will win this game.",
}

all_results = {}

for filename, ref_text in TEST_CASES.items():
    print(f"Processing {filename}...")
    audio_path = os.path.join(AUDIO_DIR, filename)
    
    files = {'audio': open(audio_path, 'rb')}
    data = {}
    if ref_text:
        data['reference_text'] = ref_text
    
    response = requests.post(f"{BASE_URL}/assess", files=files, data=data)
    
    if response.status_code == 200:
        result = response.json()
        all_results[filename] = result.get("flagged_errors", [])

        # Issue 2: Debug — print raw word-level scores for test_07 and test_09
        if filename in ("test_07.wav.m4a", "test_09.wav.m4a"):
            raw = result.get("azure_result") or {}
            nbests = raw.get("Nbests") or raw.get("NBest") or []
            first_best = nbests[0] if nbests else {}
            words_list = raw.get("Words") or first_best.get("Words") or first_best.get("words") or []
            print(f"  [DEBUG {filename}] Word-level scores:")
            for w in words_list:
                word = w.get("Word") or w.get("word") or "?"
                acc = w.get("AccuracyScore") or (w.get("PronunciationAssessment") or {}).get("AccuracyScore") or "?"
                err = (w.get("PronunciationAssessment") or {}).get("ErrorType") or "?"
                print(f"    Word={word!r} AccuracyScore={acc} ErrorType={err}")
    else:
        print(f"Error processing {filename}: {response.text}")

# Save consolidated results
with open("all_flagged_errors.json", "w") as f:
    json.dump(all_results, f, indent=2)

print("Done! Results saved to all_flagged_errors.json")
