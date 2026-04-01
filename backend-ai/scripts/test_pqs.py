
import json
import asyncio
from app.features.scoring.service import call_quality_service
from app.features.pronunciation.pronunciation_detector import detect_from_azure_result

async def run_test():
    # 1. SAMPLE AZURE RESULT (MISPRONUNCIATION)
    # Goal: 'very' was expected, user said 'berry' (common Indian English v/w swap)
    azure_result = {
        "Words": [
            {
                "Word": "berry",
                "PronunciationAssessment": {
                    "AccuracyScore": 10.0,
                    "ErrorType": "Mispronunciation"
                },
                "Phonemes": [
                    {"Phoneme": "b", "AccuracyScore": 5.0},
                    {"Phoneme": "eh", "AccuracyScore": 80.0},
                    {"Phoneme": "r", "AccuracyScore": 80.0},
                    {"Phoneme": "iy", "AccuracyScore": 80.0}
                ]
            }
        ],
        "fluency_score": 45.0,
        "prosody_score": 40.0
    }
    
    # 2. TEST DETECTOR
    print("\n--- TEST DETECTOR ---")
    errors = detect_from_azure_result(azure_result, reference_text="very")
    print(f"Flagged Errors: {json.dumps(errors, indent=2)}")
    
    # Check if Layer 4 (STT confusion) or Layer 1/2 worked
    found_v_to_w = any(e["rule_category"] == "v_to_w_reversal" or e["rule_category"] == "w_to_v" for e in errors)
    print(f"Found v/w error: {found_v_to_w}")

    # 3. TEST PQS CALCULATION
    print("\n--- TEST PQS CALCULATION ---")
    pqs_result = call_quality_service.compute_pronunciation_quality_score([azure_result])
    print(f"PQS Result: {json.dumps(pqs_result, indent=2)}")
    
    # Expectation: PQS should be fairly low due to low accuracy, fluency, and mispronunciation
    if pqs_result["pqs"] > 0 and pqs_result["pqs"] < 60:
        print("PQS Calculation Test: PASSED")
    else:
        print(f"PQS Calculation Test: FAILED (pqs={pqs_result['pqs']})")

if __name__ == "__main__":
    asyncio.run(run_test())
