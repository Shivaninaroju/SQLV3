import os
print("Step 1: os imported")

import re
print("Step 2: re imported")

import json
print("Step 3: json imported")

from typing import List
print("Step 4: typing imported")

try:
    import google.generativeai as genai
    print("Step 5: google.generativeai imported SUCCESSFULLY!")
except Exception as e:
    print(f"Step 5 FAILED: {e}")
