import urllib.request
import urllib.parse
import json
import re
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)

def translate_text_google(text: str, target_lang: str) -> str:
    """
    Translates text to target_lang using Google Translate free web API.
    """
    if not text.strip() or target_lang.lower() == "none" or target_lang.lower() == "en" and text.isascii():
        return text

    # Map languages if necessary
    lang_mapping = {
        "zh-cn": "zh-CN",
        "zh": "zh-CN"
    }
    tl = lang_mapping.get(target_lang.lower(), target_lang)
    
    url = "https://translate.googleapis.com/translate_a/single"
    params = {
        "client": "gtx",
        "sl": "auto",
        "tl": tl,
        "dt": "t",
        "q": text
    }
    query_string = urllib.parse.urlencode(params)
    req = urllib.request.Request(f"{url}?{query_string}", headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode("utf-8"))
            translated_text = "".join([sentence[0] for sentence in data[0] if sentence[0]])
            return translated_text
    except Exception as e:
        logger.error(f"Google translation failed for text '{text[:30]}...': {e}")
        return text

def translate_and_distribute_words(shifted_words: List[Dict], target_lang: str) -> List[Dict]:
    """
    Groups word-level timestamps into sentence lines, translates them, 
    and distributes word timing proportionally over the translated words list.
    """
    if not shifted_words or target_lang.lower() == "none":
        return shifted_words

    from app.services.subtitle_service import subtitle_service
    
    # 1. Group words into short semantic lines
    lines = subtitle_service.group_words_into_lines(shifted_words)
    
    translated_words = []
    
    # 2. For each line, translate the entire line text
    for line in lines:
        line_start = line["start"]
        line_end = line["end"]
        line_duration = line_end - line_start
        
        orig_line_text = " ".join([w["text"].strip() for w in line["words"]])
        if not orig_line_text:
            continue
            
        # Translate the full line
        translated_line_text = translate_text_google(orig_line_text, target_lang)
        
        # Split translated sentence into words
        words_in_translation = translated_line_text.strip().split()
        if not words_in_translation:
            continue
            
        # Distribute timing proportionally
        num_words = len(words_in_translation)
        word_dur = line_duration / num_words
        
        for idx, word_text in enumerate(words_in_translation):
            w_start = line_start + idx * word_dur
            w_end = w_start + word_dur
            translated_words.append({
                "start": w_start,
                "end": w_end,
                "text": word_text
            })
            
    return translated_words
