import urllib.request
import urllib.parse
import json
import re
import logging
import html
import unicodedata
from functools import lru_cache
from typing import List, Dict
from deep_translator import GoogleTranslator
from app.services.llm_client import safe_chat_completion

logger = logging.getLogger(__name__)

def _normalize_caption_text(text: str) -> str:
    text = html.unescape(text or "")
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

@lru_cache(maxsize=2048)
def _translate_cached(text: str, target_lang: str) -> str:
    """
    Translates text to target_lang using Google Translate via deep-translator.
    """
    if not text.strip() or target_lang.lower() == "none":
        return text

    # Map languages if necessary
    lang_mapping = {
        "zh-cn": "zh-CN",
        "zh": "zh-CN"
    }
    tl = lang_mapping.get(target_lang.lower(), target_lang)

    try:
        translated_text = GoogleTranslator(source='auto', target=tl).translate(text)
        if translated_text:
            translated_text = _normalize_caption_text(translated_text)
            if translated_text.strip():
                return translated_text
    except Exception as e:
        logger.error(f"Google Translation via deep-translator failed for text '{text[:30]}...': {e}")

    return text

def translate_text_google(text: str, target_lang: str) -> str:
    normalized_text = _normalize_caption_text(text)
    normalized_lang = (target_lang or "none").strip()
    return _translate_cached(normalized_text, normalized_lang)

def translate_text_llm(text: str, target_lang: str) -> str:
    """
    Translates text to target_lang using Qwen via OpenRouter if target_lang is 'ta' or 'ta-tanglish'.
    Optimizes the text to be short, colloquial, and easily readable.
    """
    normalized_text = _normalize_caption_text(text)
    normalized_lang = (target_lang or "none").strip().lower()

    if not normalized_text:
        return ""

    from app.services.prompt_editing_agent import prompt_editing_agent

    # Fallback to Google Translate if client isn't available or configured
    if not hasattr(prompt_editing_agent, "client") or not prompt_editing_agent.client:
        logger.warning("LLM client not available, falling back to Google Translate.")
        return translate_text_google(normalized_text, "ta" if normalized_lang == "ta-tanglish" else normalized_lang)

    system_msg = (
        "You are an expert video subtitler and translator. Translate the given English text to Tamil.\n"
        "The translation must be short, punchy, conversational, and extremely easy to read quickly (suitable for vertical video captions like Reels/Shorts).\n"
        "Avoid long formal/literary Tamil words. Use common English loanwords transliterated strictly into Tamil script where appropriate "
        "(e.g., 'வீடியோ' for video, 'போன்' for phone, 'லிங்க்' for link, 'ஆப்ஸ்' for apps, 'டிப்ஸ்' for tips, 'சூப்பர்' for super, 'பிரேம்' for frame, 'எபெக்ட்' for effect).\n"
        "CRITICAL RULES:\n"
        "1. Write the entire output strictly in Tamil characters (Tamil script). Do not output any English/Latin letters (A-Z, a-z) or mixed-script hybrid words (such as 'பறெம்ffect' or 'frameஎபெக்ட்') under any circumstances.\n"
        "2. All words must be written entirely in Tamil script. If you use an English loanword, write its transliterated phonetic version entirely in Tamil characters.\n"
        "3. Output ONLY the raw translation. Do not include any notes, explanations, quotes, or conversational filler."
    )

    if normalized_lang == "ta-tanglish":
        system_msg = (
            "You are an expert video subtitler and translator. Translate the given English text to Tanglish "
            "(Tamil spoken language written in English/Latin characters, commonly used in chat and social media).\n"
            "The translation must be short, punchy, colloquial, and extremely easy to read quickly.\n"
            "Use standard colloquial spelling (e.g., 'irunga' instead of 'porungal', 'solren' instead of 'vilakkugiren', "
            "'work aagudhu' instead of 'velai seigiradhu').\n"
            "CRITICAL RULES:\n"
            "1. Write the entire output strictly in English/Latin letters. Do not output any Tamil script characters under any circumstances.\n"
            "2. Avoid mixing Tamil characters and English characters in the output. Keep it strictly to Latin characters.\n"
            "3. Output ONLY the raw translation. Do not include any notes, explanations, quotes, or conversational filler."
        )

    try:
        response = safe_chat_completion(
            client=prompt_editing_agent.client,
            model=prompt_editing_agent.model,
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": normalized_text}
            ],
            is_openrouter=prompt_editing_agent.is_openrouter,
            temperature=0.3,
            max_tokens=150
        )
        result = response.choices[0].message.content.strip()
        result = result.strip('"').strip("'").strip()
        if result:
            return result
    except Exception as e:
        logger.error(f"LLM translation failed for text '{normalized_text[:30]}...': {e}")

    # Fallback to Google Translate if LLM fails
    fallback_lang = "ta" if normalized_lang == "ta-tanglish" else normalized_lang
    return translate_text_google(normalized_text, fallback_lang)

def translate_and_distribute_words(shifted_words: List[Dict], target_lang: str) -> List[Dict]:
    """
    Groups word-level timestamps into sentence lines, translates them as whole phrases,
    and returns entries with proper timing. Each translated phrase is kept as a single
    entry (not split into individual words) to produce clean, readable captions.
    """
    if not shifted_words or target_lang.lower() == "none":
        return shifted_words

    from app.services.subtitle_service import subtitle_service

    # 1. Group words into short semantic lines
    lines = subtitle_service.group_words_into_lines(shifted_words)

    translated_words = []

    # 2. For each line, translate the entire line text and keep it as one entry
    for line in lines:
        line_start = line["start"]
        line_end = line["end"]

        orig_line_text = " ".join([w["text"].strip() for w in line["words"]])
        if not orig_line_text:
            continue

        # Translate the full line
        if target_lang.lower() in ["ta", "ta-tanglish", "ta-colloquial"]:
            translated_line_text = translate_text_llm(orig_line_text, target_lang)
        else:
            translated_line_text = translate_text_google(orig_line_text, target_lang)
            
        translated_line_text = _normalize_caption_text(translated_line_text)

        if not translated_line_text.strip():
            continue

        # Keep the entire translated phrase as one entry with the original line timing.
        # This produces clean whole-phrase subtitles instead of fragmented word-by-word text.
        translated_words.append({
            "start": line_start,
            "end": line_end,
            "text": translated_line_text
        })

    return translated_words

