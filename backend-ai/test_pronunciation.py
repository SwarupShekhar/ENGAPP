import sys
import base64
import requests
import json
import os

def test_audio(file_path):
    if not os.path.exists(file_path):
        print(f"Error: File not found: {file_path}")
        return

    # 1. Transcribe to get reference text
    with open(file_path, "rb") as f:
        audio_content = f.read()
    
    audio_base64 = base64.b64encode(audio_content).decode('utf-8')
    
    print(f"--- Step 1: Transcribing {os.path.basename(file_path)} ---")
    try:
        transcribe_resp = requests.post(
            "http://localhost:8001/api/transcribe",
            json={
                "audio_url": "",
                "audio_base64": audio_base64,
                "user_id": "test_user",
                "session_id": "test_session",
                "language": "en-US"
            }
        )
        transcribe_resp.raise_for_status()
        data = transcribe_resp.json()
        
        if not data.get("success"):
            print("Transcription failed in logic")
            print(json.dumps(data, indent=2))
            return

        reference_text = data["data"]["text"]
        print(f"Detected Text: \"{reference_text}\"")
        
    except Exception as e:
        print(f"Transcription API Error: {e}")
        return

    # 2. Run assessment
    print(f"\n--- Step 2: Running pronunciation assessment ---")
    try:
        with open(file_path, "rb") as f:
            assess_resp = requests.post(
                "http://localhost:8001/api/pronunciation/assess",
                files={"audio": f},
                data={"reference_text": reference_text}
            )
        assess_resp.raise_for_status()
        
        print("\nJSON Result (flagged_errors only):")
        result = assess_resp.json()
        print(json.dumps(result.get("flagged_errors", []), indent=2))
        
        # Save full result to a file
        output_file = f"result_{os.path.basename(file_path)}.json"
        with open(output_file, "w") as f:
            json.dump(result, f, indent=2)
        print(f"\nFull result saved to: {output_file}")

    except Exception as e:
        print(f"Assessment API Error: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 test_pronunciation.py [PATH_TO_AUDIO]")
    else:
        test_audio(sys.argv[1])
