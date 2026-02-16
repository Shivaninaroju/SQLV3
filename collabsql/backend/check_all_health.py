import os
import asyncio
import json
from dotenv import load_dotenv
from google import genai

async def check_all_keys():
    with open("api_keys.json", "r") as f:
        keys = json.load(f).get("keys", [])
    
    env_key = os.getenv("GEMINI_API_KEY")
    if env_key: keys.append(env_key)
    
    keys = list(set([k for k in keys if k and len(k) > 10]))
    
    print(f"--- Checking All {len(keys)} Keys ---")
    
    for i, key in enumerate(keys):
        print(f"\nKey #{i+1} [{key[:6]}...{key[-4:]}]:")
        client = genai.Client(api_key=key)
        try:
            # Try a very lightweight call
            await client.aio.models.generate_content(
                model="gemini-2.0-flash",
                contents="hi"
            )
            print("  [OK] WORKING & HAS QUOTA (Gemini 2.0)")
        except Exception as e:
            msg = str(e)
            if "429" in msg or "RESOURCE_EXHAUSTED" in msg:
                print("  [EXHAUSTED] NO QUOTA LEFT (Gemini 2.0)")
            elif "401" in msg or "INVALID" in msg:
                print("  [INVALID] API KEY IS DEAD")
            else:
                print(f"  [FAILED] {msg[:100]}")

if __name__ == "__main__":
    load_dotenv()
    asyncio.run(check_all_keys())
