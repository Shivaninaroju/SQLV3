import os
import json
import asyncio
from dotenv import load_dotenv
from google import genai

load_dotenv()

async def test_15():
    api_keys_file = "api_keys.json"
    keys = []
    if os.path.exists(api_keys_file):
        with open(api_keys_file, "r") as f:
            data = json.load(f)
            keys = data.get("keys", [])
    
    env_key = os.getenv("GEMINI_API_KEY")
    if env_key:
        keys.append(env_key)
        
    keys = list(set([k for k in keys if k and len(k) > 10 and "PASTE" not in k.upper()]))
    
    print(f"Testing {len(keys)} keys against gemini-1.5-flash...")
    
    for i, k in enumerate(keys):
        try:
            client = genai.Client(api_key=k)
            # Testing both sync and async just in case
            response = await client.aio.models.generate_content(
                model="gemini-1.5-flash",
                contents="hi"
            )
            print(f"Key {i+1} [{k[:6]}...]: SUCCESS (1.5 Flash)")
        except Exception as e:
            print(f"Key {i+1} [{k[:6]}...]: FAILED - {str(e)[:100]}")

if __name__ == "__main__":
    asyncio.run(test_15())
