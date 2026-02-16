import os
import json
from dotenv import load_dotenv
from google import genai

load_dotenv()

def list_models():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        if os.path.exists("api_keys.json"):
            with open("api_keys.json", "r") as f:
                data = json.load(f)
                api_key = data.get("keys", [None])[0]
    
    if not api_key:
        print("No API key found.")
        return

    print(f"Listing models for key: {api_key[:6]}...")
    client = genai.Client(api_key=api_key)
    try:
        models = client.models.list()
        for m in models:
            print(f"- {m.name}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    list_models()
