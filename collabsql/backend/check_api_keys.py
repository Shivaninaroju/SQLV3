"""
Script to check the status of all Gemini API keys
"""
import os
import json
from dotenv import load_dotenv

load_dotenv()

def check_api_key(api_key, index=None):
    """Test if an API key is valid and has quota available"""
    try:
        from google import genai
        
        client = genai.Client(api_key=api_key)
        
        # Try a simple test request
        response = client.models.generate_content(
            model="gemini-1.5-flash",
            contents="Say 'OK' if you can read this."
        )
        
        # If we get here, the key works
        key_preview = f"{api_key[:10]}...{api_key[-4:]}" if len(api_key) > 14 else api_key
        status = "[OK] WORKING"
        
        # Check usage metadata
        usage = getattr(response, 'usage_metadata', None)
        if usage:
            tokens = getattr(usage, 'total_token_count', 0)
            status += f" (Test used {tokens} tokens)"
        
        return {
            "index": index,
            "key_preview": key_preview,
            "status": status,
            "working": True,
            "error": None
        }
        
    except Exception as e:
        error_msg = str(e)
        key_preview = f"{api_key[:10]}...{api_key[-4:]}" if len(api_key) > 14 else api_key
        
        # Determine the type of error
        if "429" in error_msg or "RESOURCE_EXHAUSTED" in error_msg:
            status = "[FAIL] QUOTA EXHAUSTED"
        elif "invalid" in error_msg.lower() or "API_KEY_INVALID" in error_msg:
            status = "[FAIL] INVALID KEY"
        elif "not found" in error_msg.lower():
            status = "[FAIL] NOT FOUND / DISABLED"
        else:
            status = f"[FAIL] ERROR: {error_msg[:50]}"
        
        return {
            "index": index,
            "key_preview": key_preview,
            "status": status,
            "working": False,
            "error": error_msg
        }

def main():
    print("=" * 70)
    print("GEMINI API KEY STATUS CHECK")
    print("=" * 70)
    print()
    
    # Load API keys from api_keys.json
    api_keys_file = "api_keys.json"
    pool_keys = []
    
    if os.path.exists(api_keys_file):
        with open(api_keys_file, "r") as f:
            data = json.load(f)
            pool_keys = data.get("keys", [])
            # Filter out placeholders
            pool_keys = [k for k in pool_keys if k and "PASTE" not in k.upper() and len(k) > 10]
    
    # Load fallback key from .env
    env_key = os.getenv("GEMINI_API_KEY")
    if env_key and "PASTE" not in env_key.upper() and len(env_key) > 10:
        fallback_key = env_key
    else:
        fallback_key = None
    
    # Display summary
    print(f"API Keys Pool (api_keys.json): {len(pool_keys)} keys")
    print(f"Fallback Key (.env):           {'1 key' if fallback_key else 'None'}")
    print()
    
    if not pool_keys and not fallback_key:
        print("[!] NO API KEYS FOUND!")
        print("   Please add valid Gemini API keys to api_keys.json or .env file")
        print()
        return
    
    # Test pool keys
    if pool_keys:
        print("-" * 70)
        print("TESTING API KEYS POOL (api_keys.json)")
        print("-" * 70)
        
        results = []
        for i, key in enumerate(pool_keys):
            print(f"\nTesting Key #{i+1}...", end=" ", flush=True)
            result = check_api_key(key, i+1)
            results.append(result)
            print(result["status"])
            if result["error"] and len(result["error"]) < 200:
                print(f"  Error: {result['error']}")
        
        # Summary
        working_count = sum(1 for r in results if r["working"])
        print()
        print(f"Pool Summary: {working_count}/{len(pool_keys)} keys are working")
        print()
    
    # Test fallback key
    if fallback_key:
        print("-" * 70)
        print("TESTING FALLBACK KEY (.env)")
        print("-" * 70)
        print(f"\nTesting fallback key...", end=" ", flush=True)
        result = check_api_key(fallback_key, "ENV")
        print(result["status"])
        if result["error"] and len(result["error"]) < 200:
            print(f"  Error: {result['error']}")
        print()
    
    print("=" * 70)
    print("CHECK COMPLETE")
    print("=" * 70)
    
    # Recommendations
    print("\nRECOMMENDATIONS:")
    if pool_keys:
        working_pool = sum(1 for r in results if r["working"])
        if working_pool == 0:
            print("   [!] All pool keys are exhausted or invalid!")
            print("   --> Add new working keys to api_keys.json")
        elif working_pool < len(pool_keys):
            print(f"   [!] {len(pool_keys) - working_pool} pool key(s) need replacement")
            print("   --> Remove exhausted keys and add new ones to api_keys.json")
        else:
            print("   [OK] All pool keys are working!")
    
    if fallback_key:
        if not result["working"]:
            print("   [!] Fallback key (.env) is not working!")
            print("   --> Update GEMINI_API_KEY in .env file")
        else:
            print("   [OK] Fallback key is working!")
    
    if not pool_keys and fallback_key:
        print("   [*] Consider adding multiple keys to api_keys.json for rotation")
    
    print()

if __name__ == "__main__":
    main()
