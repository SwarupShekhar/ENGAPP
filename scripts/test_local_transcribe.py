import requests
import json

url = "http://localhost:8001/api/transcribe"
payload = {
    "audio_url": "https://raw.githubusercontent.com/rafaelreis-hotmart/Audio-Sample-files/master/sample.wav",
    "user_id": "test_user_123",
    "session_id": "test_session_123",
    "language": "en-US"
}
headers = {
    "Content-Type": "application/json",
    "Accept": "text/html, application/json"
}

try:
    print(f"Sending request to {url}...")
    response = requests.post(url, json=payload, headers=headers)
    print(f"Status Code: {response.status_code}")
    print("Response Body:")
    try:
        print(json.dumps(response.json(), indent=2))
    except ValueError:
        print("Response involves non-JSON content. Raw text:")
        print(response.text[:2000]) # First 2000 chars should contain the error
except Exception as e:
    print(f"Request failed: {e}")
