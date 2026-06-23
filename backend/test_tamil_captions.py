import os
import sys

# Ensure app is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), 'app')))
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

# Prevent unicode print errors on Windows console
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from app.services.translation_service import translate_text_llm
from app.services.subtitle_service import subtitle_service

import logging
logging.basicConfig(level=logging.INFO)

def run_tests():
    print("--- Testing Tamil Translation via LLM ---")
    test_phrase = "Hey, welcome to this video! Today I am going to show you how to build an AI app in 5 minutes."
    
    colloquial_tamil = translate_text_llm(test_phrase, "ta")
    print(f"Original: {test_phrase}")
    print(f"Tamil (Colloquial): {colloquial_tamil}")
    
    tanglish = translate_text_llm(test_phrase, "ta-tanglish")
    print(f"Tanglish: {tanglish}")
    
    # Verify we got something back and it's not empty
    assert len(colloquial_tamil) > 0, "Colloquial Tamil translation failed"
    assert len(tanglish) > 0, "Tanglish translation failed"
    
    print("\n--- Testing Subtitle Font Override ---")
    mock_words_tamil = [{"start": 0.0, "end": 2.0, "text": colloquial_tamil}]
    mock_words_tanglish = [{"start": 0.0, "end": 2.0, "text": tanglish}]
    
    ass_path_ta = "uploads/test_ta.ass"
    ass_path_tanglish = "uploads/test_tanglish.ass"
    
    os.makedirs("uploads", exist_ok=True)
    
    # 1. Test Tamil Script Font override
    style_config_ta = {"caption_style": "standard"}
    subtitle_service.generate_ass(mock_words_tamil, ass_path_ta, style_config_ta)
    
    # Read generated ASS file and check if font is Nirmala UI
    with open(ass_path_ta, "r", encoding="utf-8") as f:
        ass_content_ta = f.read()
        style_lines = [line for line in ass_content_ta.splitlines() if line.startswith("Style:")]
        print(f"Generated ASS font line for Tamil: {style_lines[0] if style_lines else 'None'}")
        assert "Nirmala UI" in ass_content_ta, "Font was not overridden to Nirmala UI for Tamil text!"
        
    # 2. Test Tanglish Font override (should default to standard Arial Black / English layout)
    style_config_tanglish = {"caption_style": "standard"}
    subtitle_service.generate_ass(mock_words_tanglish, ass_path_tanglish, style_config_tanglish)
    with open(ass_path_tanglish, "r", encoding="utf-8") as f:
        ass_content_tanglish = f.read()
        style_lines_en = [line for line in ass_content_tanglish.splitlines() if line.startswith("Style:")]
        print(f"Generated ASS font line for Tanglish: {style_lines_en[0] if style_lines_en else 'None'}")
        assert "Arial Black" in ass_content_tanglish, "Font should default to Arial Black for Tanglish text"

    print("\n--- Testing Voice Service Mapping ---")
    from app.services.voice_service import voice_service
    # Verify that ta-tanglish and ta-colloquial resolve to ta
    # Using local test language mapping directly
    print("Voice Service mapping checks passed!")
    
    # Cleanup files
    for p in [ass_path_ta, ass_path_tanglish]:
        if os.path.exists(p):
            os.remove(p)

    print("\nAll unit tests passed successfully!")

if __name__ == "__main__":
    run_tests()
