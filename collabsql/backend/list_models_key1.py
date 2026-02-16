import os
import json
from google import genai

def list_models_for_key(api_key):
    print(f"Listing models for key: {api_key[:10]}...")
    client = genai.Client(api_key=api_key)
    try:
        models = client.models.list()
        for m in models:
            print(f"- {m.name}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    key1 = "AIzaSyDjA1QvTzosdmZiwNnnBOCEgbV3slThHk0"
    list_models_for_key(key1)
