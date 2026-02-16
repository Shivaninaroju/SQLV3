import os
import json
from dotenv import load_dotenv

load_dotenv()

api_keys_file = "api_keys.json"
pool_keys = []
if os.path.exists(api_keys_file):
    with open(api_keys_file, "r") as f:
        data = json.load(f)
        pool_keys = data.get("keys", [])

fallback_key = os.getenv("GEMINI_API_KEY")

print(f"Keys in pool: {len(pool_keys)}")
for i, k in enumerate(pool_keys):
    print(f"  Pool Key #{i+1}: {k[:10]}...{k[-4:]}")

if fallback_key:
    print(f"Fallback Key: {fallback_key[:10]}...{fallback_key[-4:]}")
else:
    print("No fallback key in .env")

print(f"Total Unique Keys: {len(set([k for k in pool_keys if k] + ([fallback_key] if fallback_key else [])))}")
