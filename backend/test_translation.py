import os
import sys

# Ensure backend/app is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), 'app')))
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.services.translation_service import translate_text_google, translate_and_distribute_words

try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    pass

def test_translation_languages():
    test_cases = [
        ("Hello, how are you today?", "es", "Spanish"),
        ("This is a simple caption for testing.", "fr", "French"),
        ("Artificial Intelligence is shaping the future.", "hi", "Hindi"),
        ("Make it fast and funny.", "zh-cn", "Chinese Simplified"),
        ("Please subscribe to the channel.", "ja", "Japanese")
    ]

    print("--- Running Google Translate Service Verification Tests ---")
    for text, lang, lang_name in test_cases:
        try:
            result = translate_text_google(text, lang)
            print(f"[{lang_name} ({lang})]")
            print(f"  Original:   {text}")
            print(f"  Translated: {result}")
            if result == text:
                print("  WARNING: Translation matches original text. (Might be fallback or untranslated)")
            else:
                print("  Status:     SUCCESS")
        except Exception as e:
            print(f"  Status:     FAILED with error: {e}")
        print()

def test_word_distribution():
    print("--- Running Word/Character Distribution Verification Test ---")
    words = [
        {"start": 0.0, "end": 1.0, "text": "Welcome"},
        {"start": 1.0, "end": 2.0, "text": "to"},
        {"start": 2.0, "end": 3.0, "text": "the"},
        {"start": 3.0, "end": 4.0, "text": "future"}
    ]
    target_lang = "es" # Spanish: "Bienvenido al futuro" (3 words from 4 original)
    
    try:
        translated_words = translate_and_distribute_words(words, target_lang)
        print(f"Original Words: {words}")
        print(f"Translated Words (Spanish): {translated_words}")
        if translated_words and len(translated_words) > 0:
            print("  Status:     SUCCESS")
        else:
            print("  Status:     FAILED (empty result)")
    except Exception as e:
        print(f"  Status:     FAILED with error: {e}")
    print()

if __name__ == "__main__":
    test_translation_languages()
    test_word_distribution()
