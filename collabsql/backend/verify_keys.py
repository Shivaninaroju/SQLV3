import os
import json
import requests
from dotenv import load_dotenv

load_dotenv()

def test_key(api_key):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    headers = {'Content-Type': 'application/json'}
    payload = {
        "contents": [{"parts": [{"text": "hi"}]}]
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=10)
        if response.status_code == 200:
            return "ALIVE (WORKING)"
        elif response.status_code == 429:
            return "EXHAUSTED (QUOTA LIMIT)"
        elif response.status_code == 400:
            return "INVALID (BAD KEY)"
        else:
            return f"FAILED (Error {response.status_code}: {response.text[:50]})"
    except Exception as e:
        return f"ERROR ({str(e)})"

# Load keys
keys = []
if os.path.exists("api_keys.json"):
    with open("api_keys.json", "r") as f:
        data = json.load(f)
        keys.extend(data.get("keys", []))

env_key = os.getenv("GEMINI_API_KEY")
if env_key:
    keys.append(env_key)

# Remove duplicates & placeholders
keys = list(set([k for k in keys if k and len(k) > 10 and "PASTE" not in k.upper()]))

print("Checking API Key Health...")
for i, key in enumerate(keys):
    preview = f"{key[:10]}...{key[-4:]}"
    status = test_key(key)
    print(f"Key {i+1} [{preview}]: {status}")
