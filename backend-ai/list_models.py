import google.generativeai as genai
import os
from app.core.config import settings

def list_models():
    api_key = settings.google_api_key
    if not api_key:
        print("Error: GOOGLE_API_KEY not found in settings")
        return

    genai.configure(api_key=api_key)
    
    print("Listing available models...")
    with open("available_models.txt", "w") as f:
        try:
            for m in genai.list_models():
                if 'generateContent' in m.supported_generation_methods:
                    line = f"Name: {m.name}\n"
                    print(line.strip())
                    f.write(line)
        except Exception as e:
            print(f"Error listing models: {e}")
            f.write(f"Error: {e}\n")

if __name__ == "__main__":
    list_models()
