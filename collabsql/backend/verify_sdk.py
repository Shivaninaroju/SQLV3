import os
import json
from dotenv import load_dotenv
from google import genai

load_dotenv()

def test_key_sdk(api_key):
    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-1.5-flash",
            contents="hi"
        )
        return "ALIVE"
    except Exception as e:
        msg = str(e)
        if "429" in msg or "RESOURCE_EXHAUSTED" in msg:
            return "QUOTA EXCEEDED"
        return f"ERROR: {msg[:100]}"

# Load keys
keys = []
if os.path.exists("api_keys.json"):
    with open("api_keys.json", "r") as f:
        data = json.load(f)
        keys.extend(data.get("keys", []))

env_key = os.getenv("GEMINI_API_KEY")
if env_key:
    keys.append(env_key)

keys = list(set([k for k in keys if k and len(k) > 10 and "PASTE" not in k.upper()]))

print("Performing SDK-based Verification...")
for i, key in enumerate(keys):
    preview = f"{key[:10]}...{key[-4:]}"
    status = test_key_sdk(key)
    print(f"Key {i+1} [{preview}]: {status}")
