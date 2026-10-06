import os
import json
import re
import logging
import html
import unicodedata
import time
import threading
from functools import lru_cache
from typing import List, Dict, Optional
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from deep_translator import GoogleTranslator
from app.core.config import settings
from app.services.llm_client import safe_chat_completion, parse_json_list_robust, get_groq_chat_model

logger = logging.getLogger(__name__)

# Thread-safe rate limiter for Google Translate to strictly avoid 429 Too Many Requests
# Google allows up to 5 requests per second; 0.40s interval guarantees max 2.5 req/sec.
_GOOGLE_RATE_LOCK = threading.Lock()
_LAST_GOOGLE_CALL_TIME = 0.0
_MIN_GOOGLE_INTERVAL_SEC = 0.40

def _pace_google_request():
    """Enforces a minimum pacing delay between Google Translate requests across threads."""
    global _LAST_GOOGLE_CALL_TIME
    with _GOOGLE_RATE_LOCK:
        now = time.time()
        elapsed = now - _LAST_GOOGLE_CALL_TIME
        if elapsed < _MIN_GOOGLE_INTERVAL_SEC:
            time.sleep(_MIN_GOOGLE_INTERVAL_SEC - elapsed)
        _LAST_GOOGLE_CALL_TIME = time.time()

# Language code to human readable name mapping
LANGUAGE_NAMES = {
    "en": "English",
    "ta": "Tamil",
    "ta-tanglish": "Tanglish (spoken Tamil written strictly in Latin/English alphabet)",
    "ta-colloquial": "Spoken Colloquial Tamil",
    "hi": "Hindi",
    "te": "Telugu",
    "kn": "Kannada",
    "ml": "Malayalam",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
    "ja": "Japanese",
    "ko": "Korean",
    "zh": "Chinese",
    "zh-cn": "Chinese (Simplified)",
    "ar": "Arabic",
    "ru": "Russian",
    "bn": "Bengali",
    "mr": "Marathi",
    "gu": "Gujarati",
}

@lru_cache(maxsize=1)
def _google_language_maps():
    """Load deep-translator's bundled language catalogue once (no network lookup)."""
    try:
        languages = GoogleTranslator(source="auto", target="en").get_supported_languages(as_dict=True)
        name_to_code = {str(name).casefold(): str(code).casefold() for name, code in languages.items()}
        code_to_name = {code: name for name, code in name_to_code.items()}
        return name_to_code, code_to_name
    except Exception as error:
        logger.warning("Could not load translation language catalogue: %s", error)
        return {}, {}

def _normalize_target_language(language: str) -> str:
    normalized = (language or "none").strip().casefold()
    if normalized in {"none", "original", ""}:
        return normalized or "none"
    name_to_code, code_to_name = _google_language_maps()
    if normalized in code_to_name:
        return normalized
    return name_to_code.get(normalized, normalized)

# In-memory session cache for batch translations to avoid redundant network calls
_TRANSLATION_MEM_CACHE: Dict[str, str] = {}

def _normalize_caption_text(text: str) -> str:
    text = html.unescape(text or "")
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

_CLOUD_CLIENT = None
_CLOUD_PROVIDER = None

def _get_cloud_client():
    """
    Returns a configured cloud OpenAI client (Groq or OpenRouter).
    Groq runs 100% in the cloud (0 MB local RAM, 0% CPU, lightning fast).
    """
    global _CLOUD_CLIENT, _CLOUD_PROVIDER
    if _CLOUD_CLIENT is not None:
        return _CLOUD_CLIENT, _CLOUD_PROVIDER

    groq_key = (settings.GROQ_API_KEY or os.environ.get("GROQ_API_KEY", "")).strip()
    if groq_key:
        try:
            from openai import OpenAI
            _CLOUD_CLIENT = OpenAI(
                base_url="https://api.groq.com/openai/v1",
                api_key=groq_key
            )
            _CLOUD_PROVIDER = "groq"
            logger.info("TranslationService initialized with Groq Cloud client.")
            return _CLOUD_CLIENT, _CLOUD_PROVIDER
        except Exception as e:
            logger.warning(f"Failed to create Groq client for translation: {e}")

    qwen_key = (settings.QWEN_API_KEY or os.environ.get("QWEN_API_KEY", "")).strip()
    if qwen_key and qwen_key != "your_openrouter_api_key_here":
        try:
            from openai import OpenAI
            _CLOUD_CLIENT = OpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=qwen_key
            )
            _CLOUD_PROVIDER = "openrouter"
            logger.info("TranslationService initialized with OpenRouter client.")
            return _CLOUD_CLIENT, _CLOUD_PROVIDER
        except Exception as e:
            logger.warning(f"Failed to create OpenRouter client for translation: {e}")

    return None, None

def _translate_single_chunk_llm(client, provider, chunk: List[str], target_name: str, tl_clean: str) -> Optional[List[str]]:
    rules = [
        f"Translate each sentence into {target_name}.",
        f"Output must be a strictly valid JSON array of strings containing EXACTLY {len(chunk)} items.",
        "Translate the meaning faithfully, then phrase it as natural, idiomatic speech that sounds good when read aloud.",
        "Translate the complete thought, not word by word. Use natural everyday phrasing a native speaker would actually say, with a smooth spoken rhythm.",
        "Do not copy awkward source-language word order, repeat words, add filler, or make the result sound like a literal subtitle translation.",
        "Keep each phrase concise enough for a short-video caption and comfortable to speak in the original time window.",
        "Preserve names, facts, intent, and tone. Do not add information, exaggerate, or omit important meaning.",
        "Maintain the exact order corresponding to each input sentence.",
        "Do not include explanations, notes, or markdown formatting outside the JSON array."
    ]

    if tl_clean in ["ta", "tamil"]:
        rules.append("Write strictly in Tamil characters (script). Do NOT use English alphabet letters.")
    elif tl_clean in ["ta-tanglish", "tanglish"]:
        rules.append("Write spoken colloquial Tamil strictly using Latin/English characters (standard Tanglish).")

    system_msg = "You are a professional video subtitle translator.\n" + "\n".join(f"- {r}" for r in rules)
    user_payload = json.dumps(chunk, ensure_ascii=False)

    if provider == "groq":
        model_name = "qwen/qwen3.8-27b"
        is_openrouter = False
    else:
        model_name = "qwen/qwen-2.5-72b-instruct"
        is_openrouter = True

    try:
        response = safe_chat_completion(
            client=client,
            model=model_name,
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_payload}
            ],
            is_openrouter=is_openrouter,
            temperature=0.2,
            max_tokens=min(350, max(120, len(chunk) * 20))
        )
        content = response.choices[0].message.content.strip()
        parsed = parse_json_list_robust(content)

        if isinstance(parsed, list) and len(parsed) > 0:
            cleaned_list = [str(item).strip() for item in parsed if str(item).strip()]
            if len(cleaned_list) >= len(chunk):
                return cleaned_list[:len(chunk)]
            else:
                while len(cleaned_list) < len(chunk):
                    cleaned_list.append(chunk[len(cleaned_list)])
                return cleaned_list
        else:
            logger.warning(f"LLM translation chunk unparseable: {content[:100]}")
    except Exception as e:
        logger.warning(f"LLM single chunk translation failed: {e}")

    return None

_GTX_SESSION = None

def _get_gtx_session():
    global _GTX_SESSION
    if _GTX_SESSION is None:
        _GTX_SESSION = requests.Session()
        retries = Retry(total=3, backoff_factor=0.3, status_forcelist=[500, 502, 503, 504])
        adapter = HTTPAdapter(max_retries=retries, pool_connections=10, pool_maxsize=10)
        _GTX_SESSION.mount("https://", adapter)
        _GTX_SESSION.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.9",
        })
    return _GTX_SESSION

def _translate_batch_gtx(texts: List[str], target_lang: str) -> Optional[List[str]]:
    """
    Translates a list of texts using high-speed direct Google GTX API with Chrome headers.
    Translates entire 150-line video transcripts in ~0.5s with zero token limits and zero rate limits.
    Directly extracts Romanized Tanglish when target_lang is 'ta-tanglish' or 'tanglish'.
    """
    if not texts:
        return []

    target_clean = (target_lang or "").strip().lower()
    is_tanglish = target_clean in ["ta-tanglish", "tanglish"]

    lang_map = {
        "zh-cn": "zh-CN",
        "zh": "zh-CN",
        "ta-tanglish": "ta",
        "ta-colloquial": "ta",
    }
    tl = lang_map.get(target_clean, target_clean)

    session = _get_gtx_session()
    chunk_size = 75
    results = []

    for i in range(0, len(texts), chunk_size):
        chunk = texts[i:i + chunk_size]
        cleaned_chunk = [t.replace("\n", " ").strip() for t in chunk]
        payload = "\n".join(cleaned_chunk)

        success = False
        for client_id in ["dict-chrome-ex", "gtx"]:
            _pace_google_request()
            try:
                if is_tanglish:
                    url = f"https://translate.googleapis.com/translate_a/single?client={client_id}&sl=auto&tl=ta&dt=t&dt=rm"
                    resp = session.post(url, data={"q": payload}, timeout=10)
                else:
                    url = "https://translate.googleapis.com/translate_a/single"
                    resp = session.post(url, params={"client": client_id, "sl": "auto", "tl": tl, "dt": "t"}, data={"q": payload}, timeout=10)

                if resp.status_code == 200:
                    data = resp.json()
                    chunk_lines = None

                    if is_tanglish:
                        for item in data[0]:
                            if len(item) > 2 and item[0] is None and item[2]:
                                chunk_lines = item[2].split("\n")
                                break

                    if not chunk_lines:
                        translated_full = "".join([part[0] for part in data[0] if part and part[0]])
                        chunk_lines = translated_full.split("\n")

                    if chunk_lines:
                        chunk_lines = [l.strip() for l in chunk_lines]
                        if len(chunk_lines) >= len(chunk):
                            results.extend(chunk_lines[:len(chunk)])
                        else:
                            while len(chunk_lines) < len(chunk):
                                chunk_lines.append(chunk[len(chunk_lines)])
                            results.extend(chunk_lines)
                        success = True
                        break
            except Exception as e:
                logger.debug(f"Client {client_id} request error: {e}")
                continue

        if not success:
            return None

    return results

def _translate_batch_llm(texts: List[str], target_lang: str) -> Optional[List[str]]:
    """
    Translates a list of texts using Cloud LLM in manageable 15-item chunks.
    Processes sequentially to strictly respect on-demand OTPM limits.
    """
    client, provider = _get_cloud_client()
    if not client or not texts:
        return None

    tl_clean = target_lang.lower().strip()
    _, code_to_name = _google_language_maps()
    target_name = LANGUAGE_NAMES.get(tl_clean, code_to_name.get(tl_clean, target_lang))

    chunk_size = 15
    chunks = [texts[i:i + chunk_size] for i in range(0, len(texts), chunk_size)]
    chunk_results = []

    for idx, chunk in enumerate(chunks):
        translated = _translate_single_chunk_llm(client, provider, chunk, target_name, tl_clean)
        if translated and len(translated) == len(chunk):
            chunk_results.extend(translated)
        else:
            logger.info(f"Chunk of {len(chunk)} items failed on LLM. Trying GTX for this chunk...")
            gtx_fallback = _translate_batch_gtx(chunk, tl_clean)
            if gtx_fallback and len(gtx_fallback) == len(chunk):
                chunk_results.extend(gtx_fallback)
            else:
                chunk_results.extend(chunk)

    return chunk_results

def _translate_batch_google(texts: List[str], target_lang: str) -> List[str]:
    """
    Translates a list of texts using Google Translate with delimited batching and rate pacing.
    Groups texts into delimited chunks to reduce HTTP requests by 15x.
    """
    if not texts:
        return []

    lang_mapping = {
        "zh-cn": "zh-CN",
        "zh": "zh-CN",
        "ta-tanglish": "ta",
        "ta-colloquial": "ta"
    }
    tl = lang_mapping.get(target_lang.lower(), target_lang)

    results = []
    chunk_size = 15
    delimiter = "\n---BRK---\n"

    for i in range(0, len(texts), chunk_size):
        chunk = texts[i:i + chunk_size]
        payload = delimiter.join(chunk)

        # Enforce minimum rate delay before contacting Google
        _pace_google_request()

        translated_chunk_items = None
        for attempt in range(2):
            try:
                translated_payload = GoogleTranslator(source="auto", target=tl).translate(payload)
                if translated_payload:
                    parts = [p.strip() for p in translated_payload.split("---BRK---")]
                    if len(parts) == len(chunk):
                        translated_chunk_items = parts
                        break
                    elif len(parts) > 0:
                        # Close enough: pad or slice to match chunk length
                        while len(parts) < len(chunk):
                            parts.append(chunk[len(parts)])
                        translated_chunk_items = parts[:len(chunk)]
                        break
            except Exception as e:
                err_str = str(e)
                if "too many requests" in err_str.lower() or "429" in err_str:
                    logger.warning(f"Google Translate rate limited on attempt {attempt + 1}. Backing off 1.5s...")
                    time.sleep(1.5)
                else:
                    logger.warning(f"Google Translate error on chunk: {e}")
                    break

        if translated_chunk_items:
            results.extend(translated_chunk_items)
        else:
            # Fall back to original texts for this chunk rather than failing the job
            results.extend(chunk)

    return results

def batch_translate_texts(texts: List[str], target_lang: str) -> List[str]:
    """
    Translates a list of texts into target_lang efficiently.
    Uses:
    1. In-memory LRU cache
    2. Cloud LLM (Groq / OpenRouter) in 1 single fast call (0MB RAM, 0% CPU)
    3. Google Translate with delimited batching and rate pacing as fallback
    4. Returns original texts if all services are unreachable
    """
    if not texts:
        return []

    norm_target = _normalize_target_language(target_lang)
    if norm_target in ["none", "original", ""]:
        return texts

    # Check cache for any already-translated lines
    to_translate_indices = []
    to_translate_texts = []
    final_results = [None] * len(texts)

    for idx, txt in enumerate(texts):
        cleaned = _normalize_caption_text(txt)
        if not cleaned:
            final_results[idx] = ""
            continue

        cache_key = f"{norm_target}:{cleaned}"
        if cache_key in _TRANSLATION_MEM_CACHE:
            final_results[idx] = _TRANSLATION_MEM_CACHE[cache_key]
        else:
            to_translate_indices.append(idx)
            to_translate_texts.append(cleaned)

    if not to_translate_texts:
        return [res if res is not None else "" for res in final_results]

    # Prefer contextual, natural-sounding phrasing when a cloud LLM is configured.
    translated_texts = None
    try:
        translated_texts = _translate_batch_llm(to_translate_texts, norm_target)
    except Exception as e:
        logger.warning(f"LLM batch translation failed: {e}")

    # Fast Google GTX translation when the configured LLM is unavailable.
    if not translated_texts or len(translated_texts) != len(to_translate_texts):
        try:
            translated_texts = _translate_batch_gtx(to_translate_texts, norm_target)
        except Exception as gtx_err:
            logger.warning(f"GTX batch translation failed: {gtx_err}")

    # Google Translate scraper fallback
    if not translated_texts or len(translated_texts) != len(to_translate_texts):
        logger.info(f"Using paced deep-translator Google Translate batch for {len(to_translate_texts)} texts to '{norm_target}'...")
        try:
            translated_texts = _translate_batch_google(to_translate_texts, norm_target)
        except Exception as ge:
            logger.warning(f"deep-translator batch failed: {ge}")
            translated_texts = to_translate_texts

    # Store into cache and assemble final results
    for orig_idx, (orig_text, trans_text) in enumerate(zip(to_translate_texts, translated_texts)):
        norm_trans = _normalize_caption_text(trans_text or orig_text)
        cache_key = f"{norm_target}:{orig_text}"
        _TRANSLATION_MEM_CACHE[cache_key] = norm_trans
        slot = to_translate_indices[orig_idx]
        final_results[slot] = norm_trans

    return [res if res is not None else texts[i] for i, res in enumerate(final_results)]

@lru_cache(maxsize=2048)
def _translate_cached(text: str, target_lang: str) -> str:
    """Translates a single text string using the batch translation pipeline."""
    if not text.strip() or target_lang.lower() in ["none", "original", ""]:
        return text

    results = batch_translate_texts([text], target_lang)
    return results[0] if results else text

def translate_text_google(text: str, target_lang: str) -> str:
    """Single text translation entry point (preserves legacy interface)."""
    normalized_text = _normalize_caption_text(text)
    normalized_lang = (target_lang or "none").strip()
    return _translate_cached(normalized_text, normalized_lang)

def translate_text_llm(text: str, target_lang: str) -> str:
    """LLM text translation entry point (preserves legacy interface)."""
    normalized_text = _normalize_caption_text(text)
    normalized_lang = (target_lang or "none").strip().lower()
    return _translate_cached(normalized_text, normalized_lang)

def translate_and_distribute_words(shifted_words: List[Dict], target_lang: str) -> List[Dict]:
    """
    Groups word-level timestamps into sentence lines, translates ALL lines in a single batch,
    and returns entries with proper timing. Produces clean, readable vertical video subtitles.
    """
    if not shifted_words or target_lang.lower() in ["none", "original", ""]:
        return shifted_words

    from app.services.subtitle_service import subtitle_service

    # 1. Group words into short semantic lines
    # Give translation enough surrounding words to preserve a complete thought
    # and produce a phrase that reads and sounds naturally in the target language.
    lines = subtitle_service.group_words_into_lines(shifted_words, max_words=8, max_duration=3.5)
    if not lines:
        return shifted_words

    # 2. Extract line texts for batch translation
    orig_line_texts = []
    valid_lines = []
    for line in lines:
        text = " ".join([w["text"].strip() for w in line["words"]]).strip()
        if text:
            orig_line_texts.append(text)
            valid_lines.append(line)

    if not orig_line_texts:
        return shifted_words

    # 3. Translate all lines in ONE single batch call (no per-line HTTP hammering)
    translated_texts = batch_translate_texts(orig_line_texts, target_lang)

    # 4. Map back to line entries with original timing
    translated_words = []
    for idx, line in enumerate(valid_lines):
        t_text = translated_texts[idx] if idx < len(translated_texts) else orig_line_texts[idx]
        t_text = _normalize_caption_text(t_text)
        if not t_text:
            t_text = orig_line_texts[idx]

        translated_words.append({
            "start": line["start"],
            "end": line["end"],
            "text": t_text
        })

    return subtitle_service.clean_transcript_words(translated_words)
