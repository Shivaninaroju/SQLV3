import os
import asyncio
from google import genai

async def check_key_status(api_key):
    print(f"--- Checking Key 1 Status ---")
    print(f"Key: {api_key[:10]}...{api_key[-4:]}")
    
    models_to_test = ["gemini-2.0-flash", "gemini-1.5-flash-latest"]
    
    for model in models_to_test:
        print(f"\nTesting Model: {model}")
        try:
            client = genai.Client(api_key=api_key)
            # Use native async to match production environment
            response = await client.aio.models.generate_content(
                model=model,
                contents="OK"
            )
            print(f"  [SUCCESS] Key is WORKING and has QUOTA for {model}.")
        except Exception as e:
            msg = str(e)
            if "429" in msg or "RESOURCE_EXHAUSTED" in msg:
                print(f"  [EXHAUSTED] Key has NO QUOTA left for {model}.")
                print(f"  Details: {msg[:100]}...")
            elif "404" in msg:
                print(f"  [NOT FOUND] Model {model} is not available for this key/region.")
            else:
                print(f"  [ERROR] {msg}")

if __name__ == "__main__":
    key1 = "AIzaSyDjA1QvTzosdmZiwNnnBOCEgbV3slThHk0"
    asyncio.run(check_key_status(key1))
