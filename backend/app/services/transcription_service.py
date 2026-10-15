import os
# Disable Hugging Face symlinks warning/error on Windows by forcing copies
os.environ["HF_HUB_DISABLE_SYMLINKS"] = "1"

import logging
from faster_whisper import WhisperModel
import subprocess
import re
import time
import math
import uuid
import unicodedata
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)

# Supported ISO-639-1 language aliases for Groq Whisper and Faster-Whisper
LANGUAGE_TO_ISO639_1: Dict[str, str] = {
    "tamil": "ta",
    "ta-in": "ta",
    "ta_in": "ta",
    "ta-colloquial": "ta",
    "ta-tanglish": "ta",
    "tanglish": "ta",
    "english": "en",
    "en-us": "en",
    "en-in": "en",
    "en-gb": "en",
    "hindi": "hi",
    "hi-in": "hi",
    "telugu": "te",
    "te-in": "te",
    "malayalam": "ml",
    "ml-in": "ml",
    "kannada": "kn",
    "kn-in": "kn",
    "marathi": "mr",
    "mr-in": "mr",
    "bengali": "bn",
    "bn-in": "bn",
    "gujarati": "gu",
    "gu-in": "gu",
    "punjabi": "pa",
    "pa-in": "pa",
    "spanish": "es",
    "es-es": "es",
    "french": "fr",
    "fr-fr": "fr",
    "german": "de",
    "japanese": "ja",
    "korean": "ko",
    "chinese": "zh",
    "arabic": "ar",
    "russian": "ru",
    "portuguese": "pt",
    "italian": "it",
    "turkish": "tr",
}

ISO639_TO_GOOGLE_LOCALE = {
    "ta": "ta-IN",
    "hi": "hi-IN",
    "te": "te-IN",
    "kn": "kn-IN",
    "ml": "ml-IN",
    "bn": "bn-IN",
    "mr": "mr-IN",
    "gu": "gu-IN",
    "pa": "pa-Guru-IN",
    "ur": "ur-IN",
    "en": "en-US",
    "es": "es-ES",
    "fr": "fr-FR",
    "de": "de-DE",
    "it": "it-IT",
    "pt": "pt-PT",
    "ja": "ja-JP",
    "ko": "ko-KR",
    "zh": "zh-CN",
    "ar": "ar-SA",
    "ru": "ru-RU",
    "tr": "tr-TR",
    "nl": "nl-NL",
    "pl": "pl-PL",
    "sv": "sv-SE",
    "el": "el-GR",
    "he": "he-IL",
    "th": "th-TH",
    "vi": "vi-VN",
    "id": "id-ID",
}


def normalize_google_language(lang: Optional[str]) -> str:
    """
    Maps language code or ISO-639-1 to BCP-47 locale tag expected by Google Cloud Speech-to-Text.
    """
    if not lang:
        return "en-US"
    cleaned = str(lang).strip().lower()
    if cleaned in ISO639_TO_GOOGLE_LOCALE:
        return ISO639_TO_GOOGLE_LOCALE[cleaned]
    norm_iso = normalize_whisper_language(cleaned)
    if norm_iso and norm_iso in ISO639_TO_GOOGLE_LOCALE:
        return ISO639_TO_GOOGLE_LOCALE[norm_iso]
    if "-" in cleaned:
        parts = cleaned.split("-")
        return f"{parts[0].lower()}-{parts[1].upper()}"
    return "en-US"


def normalize_whisper_language(lang: Optional[str]) -> Optional[str]:
    """
    Normalizes language codes to ISO-639-1 format required by Groq Whisper and Faster-Whisper.
    Groq Whisper accepts ONLY ISO-639-1 two-letter codes (e.g. 'ta', 'en', 'hi').
    Passing 'ta-IN' or 'Tamil' causes an HTTP 400 error on Groq.
    Returns None for 'none', 'auto', 'original', or unknown values to preserve automatic detection.
    """
    if not lang:
        return None
    cleaned = str(lang).strip().lower()
    if cleaned in {"none", "auto", "original", "detect", "default", ""}:
        return None

    if cleaned in LANGUAGE_TO_ISO639_1:
        return LANGUAGE_TO_ISO639_1[cleaned]

    # Strip regional suffix: 'ta-IN' -> 'ta', 'en-US' -> 'en'
    if "-" in cleaned:
        prefix = cleaned.split("-")[0]
        if len(prefix) == 2:
            return prefix
    if "_" in cleaned:
        prefix = cleaned.split("_")[0]
        if len(prefix) == 2:
            return prefix

    if len(cleaned) == 2 and cleaned.isalpha():
        return cleaned

    return None


DEFAULT_LANGUAGE_PROMPTS: Dict[str, str] = {
    "ta": "வணக்கம். தமிழ் பேச்சு, சமையல், உணவு, தேவையான பொருட்கள், காலிஃபிளவர், மசாலா, வீட்டு சமையல், செய்முறை, கொஞ்சம், உப்பு, எண்ணெய்.",
    "hi": "नमस्ते. हिन्दी बातचीत, रेसिपी, सामग्री, भोजन, स्वादिष्ट खाना, विधि, थोड़ा, नमक, तेल.",
    "te": "నమస్కారం. తెలుగు సంభాషణ, వంటకాలు, పదార్థాలు, రుచికరమైన ఆహారం, ఉప్పు, నూనె.",
    "ml": "നമസ്കാരം. മലയാളം സംഭാഷണം, പാചകക്കുറിപ്പുകൾ, ചേരുവകൾ, രുചികരമായ ഭക്ഷണം, ഉപ്പ്, എണ്ണ.",
    "kn": "ನಮಸ್ಕಾರ. ಕನ್ನಡ ಸಂಭಾಷಣೆ, ಅಡುಗೆ ವಿಧಾನ, ಪದಾರ್ಥಗಳು, ಉಪ್ಪು, ಎಣ್ಣೆ.",
}


def detect_video_context_language(context_str: str) -> Optional[str]:
    """
    Infers spoken language code from context text (original filename, video title, prompt, description).
    Allows automatic language specification (e.g. 'ta') for cooking/regional videos when user leaves 'auto' selected.
    """
    if not context_str:
        return None
    s = str(context_str).lower()

    # 1. Tamil script detection (U+0B80 - U+0BFF) or keywords
    if any(0x0B80 <= ord(c) <= 0x0BFF for c in context_str):
        return "ta"
    tamil_keywords = [
        "tamil", "coimbatore", "chennai", "madurai", "kuruma", "samayal",
        "poriyal", "kuzhambu", "dosa", "idli", "kolambu", "rasam", "vadai",
        "biryani", "chutney", "thakkali", "vengayam", "kaliflower", "cauliflower"
    ]
    if any(re.search(rf"\b{kw}\b", s) for kw in tamil_keywords):
        return "ta"

    # 2. Devanagari script detection (U+0900 - U+097F) or Hindi keywords
    if any(0x0900 <= ord(c) <= 0x097F for c in context_str):
        return "hi"
    hindi_keywords = ["hindi", "rasoi", "khana", "sabzi", "roti", "paratha", "paneer", "tadka"]
    if any(re.search(rf"\b{kw}\b", s) for kw in hindi_keywords):
        return "hi"

    # 3. Telugu script detection (U+0C00 - U+0C7F)
    if any(0x0C00 <= ord(c) <= 0x0C7F for c in context_str) or "telugu" in s:
        return "te"

    # 4. Malayalam script detection (U+0D00 - U+0D7F)
    if any(0x0D00 <= ord(c) <= 0x0D7F for c in context_str) or "malayalam" in s:
        return "ml"

    # 5. Kannada script detection (U+0C80 - U+0CFF)
    if any(0x0C80 <= ord(c) <= 0x0CFF for c in context_str) or "kannada" in s:
        return "kn"

    return None


def sanitize_multilingual_text(text: str) -> str:
    """
    Canonically normalizes Unicode and heals malformed or decomposed Indic sequences.
    1. Canonical NFC normalization.
    2. Heals decomposed/corrupt Tamil two-part vowel signs:
       - Fixes corrupt sequences like '\u0bd7\u0bc6\u0bbe' (au mark + e + aa) -> '\u0bca' (ொ)
         (e.g. cleans 'கௗொஞ்சம்' -> 'கொஞ்சம்').
       - '\u0bc6\u0bbe' / '\u0bbe\u0bc6' -> '\u0bca' (ொ)
       - '\u0bc7\u0bbe' / '\u0bbe\u0bc7' -> '\u0bcb' (ோ)
       - '\u0bc6\u0bd7' / '\u0bd7\u0bc6' -> '\u0bcc' (ௌ)
    3. Strips orphaned Indic combining marks (vowel signs, viramas) at word start or after whitespace
       so that OpenType / DirectWrite / libass never renders a dotted circle ◌ (U+25CC).
    4. Strips foreign script characters hallucinated into Indic text (e.g. Arabic 'د' U+0600-U+06FF).
    """
    if not text:
        return ""
    t = unicodedata.normalize("NFC", str(text))

    # Tamil specific healing
    def _heal_tamil_vowels(m):
        g = m.group(0)
        # If o-vowel or e+aa was in cluster:
        if "\u0bca" in g or ("\u0bc6" in g and "\u0bbe" in g):
            return "\u0bca"
        # If oo-vowel or ee+aa:
        if "\u0bcb" in g or ("\u0bc7" in g and "\u0bbe" in g):
            return "\u0bcb"
        # If au-vowel or e+au_mark:
        if "\u0bcc" in g or ("\u0bc6" in g and "\u0bd7" in g):
            return "\u0bcc"
        # If au length mark is orphaned next to a vowel sign, strip it
        if "\u0bd7" in g and any(c in g for c in "\u0bbe\u0bbf\u0bc0\u0bc1\u0bc2\u0bc6\u0bc7\u0bc8\u0bca\u0bcb\u0bcc"):
            return "".join(c for c in g if c != "\u0bd7")
        return g

    t = re.sub(r"[\u0bd7\u0bc6\u0bc7\u0bbe\u0bca\u0bcb\u0bcc]+", _heal_tamil_vowels, t)
    t = t.replace("\u0bc6\u0bbe", "\u0bca").replace("\u0bbe\u0bc6", "\u0bca")
    t = t.replace("\u0bc7\u0bbe", "\u0bcb").replace("\u0bbe\u0bc7", "\u0bcb")
    t = t.replace("\u0bc6\u0bd7", "\u0bcc").replace("\u0bd7\u0bc6", "\u0bcc")

    # Strip any orphaned au length mark: \u0bd7 without preceding \u0bc6
    t = re.sub(r"(?<!\u0bc6)\u0bd7", "", t)

    # Strip orphaned combining marks at word boundary or after spaces that cause dotted circle ◌
    t = re.sub(r"(^|\s+)[\u0b82\u0bbe-\u0bcd\u0bd7]+", r"\1", t)

    # If word contains Tamil characters (U+0B80 - U+0BFF), strip stray hallucinated Arabic or Cyrillic characters
    if any(0x0B80 <= ord(c) <= 0x0BFF for c in t):
        t = re.sub(r"[\u0600-\u06FF\u0400-\u04FF]", "", t)

    return unicodedata.normalize("NFC", t).strip()


NOISE_OR_HALLUCINATION_PATTERNS = [
    re.compile(r"^\[.*\]$"),
    re.compile(r"^\(.*\)$"),
    re.compile(r"^[♪♫♬\s\.\,\!\?\-\_]+$"),
    re.compile(r"^\d{1,4}[-:\.]\d{1,4}(?:[-:\.]\d{1,4})?$"),  # Timestamp/code hallucinations e.g. 019-006, 00:00, 12:34
    re.compile(r"^#\d+$"),  # Chapter/hashtag hallucination e.g. #1, #2
    re.compile(r"(?i)\b(subtitles\s+by|thank\s+you\s+for\s+watching|thanks\s+for\s+watching|please\s+subscribe|subscribe\s+to\s+my\s+channel|amara\.org|sous-titres\s+réalisés|transcribed\s+by)\b"),
]


def is_hallucination_or_noise(text: str) -> bool:
    """
    Unicode-aware noise check.
    Ensures Tamil and multilingual text (including combining vowel signs and viramas,
    categories 'L*', 'M*', 'N*') are NEVER rejected as noise, while filtering
    hallucinated timestamp codes (019-006), hashtags, bracketed sound effects, and subtitle credits.
    """
    if not text:
        return True
    s = text.strip()
    has_valid_char = any(
        unicodedata.category(c)[0] in ("L", "M", "N") for c in s
    )
    if not has_valid_char:
        return True
    for pat in NOISE_OR_HALLUCINATION_PATTERNS:
        if pat.search(s):
            return True
    return False


def get_audio_duration(audio_path: str) -> float:
    """
    Returns audio duration in seconds using ffprobe.
    Returns 0.0 if probe fails or file is empty.
    """
    if not audio_path or not os.path.exists(audio_path):
        return 0.0
    try:
        cmd = [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            audio_path
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        dur = float(res.stdout.strip())
        if math.isfinite(dur) and dur > 0:
            return dur
    except Exception as e:
        logger.debug(f"ffprobe duration probe failed for {audio_path}: {e}")
    return 0.0


class TranscriptionService:
    def __init__(self, model_size="small"):
        self.model_size = model_size
        self.whisper_model = None
        self.use_google = False
        self.use_gemini = False
        self._google_quota_exhausted = False
        self._gemini_unavailable = False
        self.last_provider = None
        self.last_model = None
        
        self.device_name = "auto"
        self.comp_type = "default"
        try:
            import torch
            self.device_name = "cuda" if torch.cuda.is_available() else "cpu"
            self.comp_type = "float16" if self.device_name == "cuda" else "int8"
            if self.device_name == "cuda":
                logger.info(f"GPU acceleration enabled for Whisper ({torch.cuda.get_device_name(0)}).")
        except ImportError:
            pass
            
        # Heavy models (like large-v3) are too slow and cause bottlenecks on CPU.
        # Downgrade to 'small' automatically if CPU is used.
        if self.device_name == "cpu" and self.model_size in ["large", "large-v1", "large-v2", "large-v3", "medium"]:
            logger.info(f"CPU detected. Automatically downgrading Whisper model from {self.model_size} to small for performance.")
            self.model_size = "small"

        # Check if Google Application Credentials file path is set in the environment or settings
        gcp_creds = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
        if not gcp_creds:
            try:
                # Try to load from .env file directly if present
                backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
                env_path = os.path.join(backend_dir, ".env")
                if os.path.exists(env_path):
                    with open(env_path, "r", encoding="utf-8") as f:
                        for line in f:
                            if line.strip().startswith("GOOGLE_APPLICATION_CREDENTIALS"):
                                _, val = line.strip().split("=", 1)
                                gcp_creds = val.strip().strip('"').strip("'").strip()
                                if gcp_creds:
                                    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = gcp_creds
                                break
            except Exception as e:
                logger.debug(f"Failed to parse .env for credentials: {e}")

        if gcp_creds:
            if not os.path.exists(gcp_creds):
                # Try to locate the file in the backend root directory
                backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
                candidate = os.path.abspath(os.path.join(backend_dir, os.path.basename(gcp_creds)))
                if os.path.exists(candidate):
                    gcp_creds = candidate
                    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = gcp_creds
                else:
                    gcp_creds = None

        groq_key = (os.environ.get("GROQ_API_KEY", "")).strip()
        gemini_key = (os.environ.get("GEMINI_API_KEY", "")).strip()
        try:
            from app.core.config import settings
            groq_key = groq_key or (settings.GROQ_API_KEY or "").strip()
            gemini_key = gemini_key or (settings.GEMINI_API_KEY or "").strip()
        except Exception:
            pass

        if gemini_key:
            try:
                from google import genai  # noqa: F401
                self.use_gemini = True
                logger.info("Gemini transcription credentials and SDK are available for Tamil routing.")
            except ImportError:
                logger.warning("GEMINI_API_KEY is set, but google-genai is not installed.")

        if gcp_creds and os.path.exists(gcp_creds):
            try:
                from google.cloud import speech
                self.use_google = True
                logger.info("Google Cloud Speech-to-Text is configured and available for language-specific routing.")
            except ImportError:
                logger.debug("google-cloud-speech library not found. Falling back to local Whisper.")
            except Exception as e:
                logger.debug(f"Failed to initialize Google Speech-to-Text: {e}")
        if groq_key:
            logger.info("Groq Cloud Whisper is configured as the default transcription provider outside language-specific routing.")
        elif not self.use_google:
            logger.info(f"Using local Faster-Whisper on {self.device_name} for audio transcription.")

    def _is_quota_error(self, error):
        """Check if the error is a Google Cloud quota/resource exhausted error."""
        error_str = str(error).lower()
        quota_keywords = ["resource exhausted", "quota", "429", "rate limit", "billing", "unauthorized", "invalid_grant", "credentials"]
        return any(kw in error_str for kw in quota_keywords)

    def _ensure_whisper_loaded(self):
        """Lazily load the local Whisper model on demand to save resources and boot faster."""
        if not self.whisper_model:
            try:
                logger.info(f"Lazily loading WhisperModel ({self.model_size}) on device '{self.device_name}' with compute_type '{self.comp_type}'...")
                self.whisper_model = WhisperModel(self.model_size, device=self.device_name, compute_type=self.comp_type)
                logger.info(f"Loaded WhisperModel ({self.model_size}) on {self.device_name} successfully.")
            except Exception as e:
                if self.device_name == "cuda":
                    logger.warning(f"Failed to load WhisperModel on CUDA ({e}). Gracefully falling back to CPU...")
                    self.device_name = "cpu"
                    self.comp_type = "int8"
                    self.model_size = "small"
                    self.whisper_model = WhisperModel(self.model_size, device=self.device_name, compute_type=self.comp_type)
                    logger.info("Loaded WhisperModel on CPU fallback successfully.")
                else:
                    logger.error(f"Failed to load WhisperModel: {e}")
                    raise

    def _transcribe_groq_single(
        self,
        audio_path: str,
        language: Optional[str] = None,
        prompt: Optional[str] = None,
    ) -> List[Dict]:
        """
        Transcribes a single audio slice (<= 180s) using Groq Cloud Whisper API (whisper-large-v3).
        Takes ~1-2 seconds with 0% local CPU usage on 1-vCPU servers.
        Correctly passes ISO-639-1 language code (e.g. 'ta') when explicitly specified.
        Includes automatic retry for transient 429/503 rate limits.
        """
        from openai import OpenAI
        from app.core.config import settings

        groq_key = (settings.GROQ_API_KEY or os.environ.get("GROQ_API_KEY", "")).strip()
        if not groq_key:
            raise ValueError("GROQ_API_KEY is not configured")

        norm_lang = normalize_whisper_language(language)
        start_time = time.time()
        logger.info(
            f"Transcribing audio with Groq Cloud Whisper ({audio_path}) [RequestedLang={language}, NormalizedLang={norm_lang}]..."
        )

        # Ensure file size is below Groq's 25MB limit (compress if needed)
        target_path = audio_path
        cleanup_temp = False
        try:
            if os.path.getsize(audio_path) > 23 * 1024 * 1024:
                compressed_path = audio_path.replace(".wav", "_compressed.mp3")
                comp_cmd = ["ffmpeg", "-y", "-i", audio_path, "-af", "highpass=f=80,lowpass=f=7500,volume=1.2", "-ac", "1", "-ar", "16000", "-b:a", "64k", compressed_path]
                subprocess.run(comp_cmd, capture_output=True, check=True)
                target_path = compressed_path
                cleanup_temp = True

            client = OpenAI(
                base_url="https://api.groq.com/openai/v1",
                api_key=groq_key
            )

            effective_prompt = (prompt or "").strip()
            if norm_lang and not effective_prompt:
                effective_prompt = DEFAULT_LANGUAGE_PROMPTS.get(norm_lang, "")

            kwargs: Dict[str, Any] = {
                "model": "whisper-large-v3",
                "response_format": "verbose_json",
                "timestamp_granularities": ["word"],
                "temperature": 0.0,
            }
            if norm_lang:
                kwargs["language"] = norm_lang
            if effective_prompt:
                kwargs["prompt"] = effective_prompt[:1000]

            retries = 2
            resp = None
            for attempt in range(retries + 1):
                try:
                    with open(target_path, "rb") as audio_file:
                        kwargs["file"] = audio_file
                        resp = client.audio.transcriptions.create(**kwargs)
                    break
                except Exception as api_err:
                    err_str = str(api_err).lower()
                    if attempt < retries and ("429" in err_str or "rate limit" in err_str or "503" in err_str):
                        logger.warning(f"Groq API rate limit or transient error ({api_err}). Backing off 3s before retry {attempt + 1}/{retries}...")
                        time.sleep(3.0)
                    else:
                        raise

            transcript = []
            words = getattr(resp, "words", None)
            if words:
                for w in words:
                    if isinstance(w, dict):
                        text = w.get("word", "")
                        st = float(w.get("start", 0.0))
                        en = float(w.get("end", 0.0))
                    else:
                        text = getattr(w, "word", "") or ""
                        st = float(getattr(w, "start", 0.0))
                        en = float(getattr(w, "end", 0.0))
                    clean_text = sanitize_multilingual_text(text)
                    if clean_text and not is_hallucination_or_noise(clean_text):
                        if en <= st:
                            en = st + 0.1
                        transcript.append({"start": round(st, 2), "end": round(en, 2), "text": clean_text})
            else:
                segments = getattr(resp, "segments", None) or []
                for seg in segments:
                    seg_words = seg.get("words", []) if isinstance(seg, dict) else getattr(seg, "words", [])
                    if seg_words:
                        for w in seg_words:
                            text = w.get("word", "") if isinstance(w, dict) else getattr(w, "word", "")
                            st = float(w.get("start", 0.0) if isinstance(w, dict) else getattr(w, "start", 0.0))
                            en = float(w.get("end", 0.0) if isinstance(w, dict) else getattr(w, "end", 0.0))
                            clean_text = sanitize_multilingual_text(text)
                            if clean_text and not is_hallucination_or_noise(clean_text):
                                if en <= st:
                                    en = st + 0.1
                                transcript.append({"start": round(st, 2), "end": round(en, 2), "text": clean_text})
                    else:
                        text = seg.get("text", "") if isinstance(seg, dict) else getattr(seg, "text", "")
                        st = float(seg.get("start", 0.0) if isinstance(seg, dict) else getattr(seg, "start", 0.0))
                        en = float(seg.get("end", 0.0) if isinstance(seg, dict) else getattr(seg, "end", 0.0))
                        clean_text = sanitize_multilingual_text(text)
                        if clean_text and not is_hallucination_or_noise(clean_text):
                            if en <= st:
                                en = st + 0.1
                            transcript.append({"start": round(st, 2), "end": round(en, 2), "text": clean_text})

            dur = round(time.time() - start_time, 2)
            first_tok = transcript[0]["text"] if transcript else ""
            last_tok = transcript[-1]["text"] if transcript else ""
            logger.info(
                f"[Checkpoint B - Raw Provider Response] (Checkpoint A) Provider=Groq Model=whisper-large-v3 "
                f"RequestedLang={language} NormLang={norm_lang} Words={len(transcript)} "
                f"Duration={dur}s FirstToken='{first_tok[:20]}' LastToken='{last_tok[:20]}'"
            )
            return transcript
        finally:
            if cleanup_temp and os.path.exists(target_path):
                try:
                    os.remove(target_path)
                except Exception:
                    pass

    def _transcribe_groq(
        self,
        audio_path: str,
        language: Optional[str] = None,
        prompt: Optional[str] = None,
    ) -> List[Dict]:
        """
        Transcribes audio using Groq Cloud Whisper API (whisper-large-v3).
        For long audio (> 180s / 3 min, e.g. 19-30 min videos), automatically slices the audio
        into 150s frame-accurate chunks to prevent Whisper attention drift, repetition loops,
        and missing initial minutes. Each chunk timestamp is offset by start_t, guaranteeing
        frame-accurate synchronization with zero drift across the entire video.
        """
        total_duration = get_audio_duration(audio_path)
        CHUNK_SEC = 150.0

        if total_duration <= 180.0:
            return self._transcribe_groq_single(audio_path, language=language, prompt=prompt)

        num_chunks = math.ceil(total_duration / CHUNK_SEC)
        norm_lang = normalize_whisper_language(language)
        logger.info(
            f"Long audio detected ({total_duration:.1f}s / {total_duration/60:.1f}m). "
            f"Executing frame-accurate chunked Groq transcription across {num_chunks} chunks ({CHUNK_SEC}s each) [Lang={norm_lang}]..."
        )

        all_words: List[Dict] = []
        t0 = time.time()

        for i in range(num_chunks):
            start_t = i * CHUNK_SEC
            dur_t = min(CHUNK_SEC, total_duration - start_t)
            chunk_file = f"{os.path.splitext(audio_path)[0]}_chunk_{i}_{int(time.time())}.mp3"

            try:
                cmd = [
                    "ffmpeg", "-y", "-nostdin",
                    "-ss", str(start_t), "-t", str(dur_t),
                    "-i", audio_path,
                    "-ac", "1", "-ar", "16000", "-b:a", "64k",
                    chunk_file
                ]
                subprocess.run(cmd, capture_output=True, check=True)

                chunk_words = self._transcribe_groq_single(chunk_file, language=language, prompt=prompt)
                for w in chunk_words:
                    all_words.append({
                        "start": round(float(w["start"]) + start_t, 2),
                        "end": round(float(w["end"]) + start_t, 2),
                        "text": w["text"]
                    })
                logger.info(
                    f"Chunk {i + 1}/{num_chunks} ({start_t:.1f}s -> {start_t + dur_t:.1f}s) finished: "
                    f"{len(chunk_words)} words (Total so far: {len(all_words)})"
                )
            except Exception as chunk_err:
                logger.error(f"Failed to transcribe chunk {i + 1}/{num_chunks} at {start_t}s: {chunk_err}")
            finally:
                if os.path.exists(chunk_file):
                    try:
                        os.remove(chunk_file)
                    except Exception:
                        pass

        # Deduplicate and validate across chunk boundaries
        from app.services.subtitle_service import subtitle_service
        cleaned_words, stats = subtitle_service.validate_and_clean_transcript(all_words)

        dur = round(time.time() - t0, 2)
        logger.info(
            f"[Checkpoint B - Chunked Groq Complete] TotalDuration={total_duration:.1f}s Chunks={num_chunks} "
            f"WordsRaw={len(all_words)} WordsCleaned={len(cleaned_words)} TimeTaken={dur}s"
        )
        return cleaned_words

    def transcribe(
        self,
        audio_path: str,
        language: Optional[str] = None,
        prompt: Optional[str] = None,
        context: Optional[str] = None,
    ) -> List[Dict]:
        """
        Transcribe an audio file and return word-level timestamps.
        Priority:
          1. Local GPU Whisper if WHISPER_FORCE_LOCAL=1
          2. Gemini Transcribe for explicitly selected Tamil when configured
          3. Groq Cloud Whisper as the default provider and Tamil fallback
          4. Google Cloud STT as a non-Tamil fallback
          5. Local Faster-Whisper GPU/CPU as the final fallback
        Output format: list of dictionaries {"start": float, "end": float, "text": str}
        """
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file not found at {audio_path}")

        norm_lang = normalize_whisper_language(language)
        if not norm_lang:
            # Auto-detect language from video context or audio filename if user left 'auto'
            detected = detect_video_context_language(f"{context or ''} {os.path.basename(audio_path)}")
            if detected:
                norm_lang = detected
                language = detected
                logger.info(f"Auto-detected language '{norm_lang}' from audio context / filename.")

        # Check if user explicitly configured local-only transcription
        force_local = os.environ.get("WHISPER_FORCE_LOCAL", "").lower() in ["1", "true", "yes"]
        raw = None
        provider_used = None

        prefer_gemini = norm_lang == "ta" and self.use_gemini and not self._gemini_unavailable

        if force_local and self.device_name == "cuda":
            logger.info(f"WHISPER_FORCE_LOCAL enabled: Using local CUDA GPU WhisperModel ({self.model_size}).")
            self._ensure_whisper_loaded()
            raw = self._transcribe_whisper(audio_path, language=language, prompt=prompt)
            provider_used = "Faster-Whisper-CUDA"
        elif prefer_gemini:
            try:
                logger.info("Tamil selected: using Gemini Transcribe before other transcription providers.")
                raw = self._transcribe_gemini(audio_path, language="ta")
                provider_used = "GeminiTranscribe"
                if not raw:
                    raw = None
            except Exception as gemini_err:
                logger.warning(f"Gemini Tamil transcription failed ({gemini_err}); falling back to Groq/local Whisper.")
                if self._is_quota_error(gemini_err):
                    self._gemini_unavailable = True

        if raw is None:
            # Groq is the default provider and the first fallback for Tamil.
            from app.core.config import settings
            groq_key = (settings.GROQ_API_KEY or os.environ.get("GROQ_API_KEY", "")).strip()
            if groq_key:
                try:
                    raw = self._transcribe_groq(audio_path, language=language, prompt=prompt)
                    provider_used = "GroqCloudWhisper"
                except Exception as ge:
                    logger.warning(f"Groq Cloud transcription failed ({ge}). Falling back to secondary provider...")

            # For non-Tamil, try Google Cloud STT only after Groq. Tamil uses
            # Gemini first and proceeds directly to local if Groq also fails.
            if raw is None and norm_lang != "ta" and self.use_google and not self._google_quota_exhausted:
                try:
                    raw = self._transcribe_google(audio_path, language=language)
                    provider_used = "GoogleCloudSTT"
                    if not raw:
                        raw = None
                except Exception as google_err:
                    logger.warning(f"Google Cloud transcription failed ({google_err}); falling back to local Whisper.")
                    if self._is_quota_error(google_err):
                        self._google_quota_exhausted = True

            # Fall back to local Faster-Whisper.
            if raw is None:
                if self._google_quota_exhausted:
                    logger.info("Using local Whisper (Google STT quota/credentials issue).")
                self._ensure_whisper_loaded()
                raw = self._transcribe_whisper(audio_path, language=language, prompt=prompt)
                provider_used = f"Faster-Whisper-{self.device_name}"

        self.last_provider = provider_used
        model_names = {
            "GeminiTranscribe": "gemini-3.5-transcribe",
            "GoogleCloudSTT": "Google Cloud Speech-to-Text",
            "GroqCloudWhisper": "whisper-large-v3",
        }
        self.last_model = model_names.get(provider_used, self.model_size)

        transcript = raw or []
        logger.info(
            f"[Checkpoint C - Normalized Transcript] Provider={provider_used} "
            f"Words={len(transcript)} RequestedLang={language or 'auto'}"
        )
        return transcript

    def _transcribe_whisper(
        self,
        audio_path: str,
        language: Optional[str] = None,
        prompt: Optional[str] = None,
    ) -> List[Dict]:
        norm_lang = normalize_whisper_language(language)
        start_time = time.time()
        logger.info(f"Starting Whisper transcription for {audio_path} on {self.device_name} [Lang={norm_lang}]")

        effective_prompt = (prompt or "").strip()
        if norm_lang and not effective_prompt:
            effective_prompt = DEFAULT_LANGUAGE_PROMPTS.get(norm_lang, "")

        vad_params = dict(
            min_silence_duration_ms=500,
            speech_pad_ms=400,
        )

        kwargs: Dict[str, Any] = {
            "beam_size": 5,
            "vad_filter": True,
            "vad_parameters": vad_params,
            "word_timestamps": True,
            "condition_on_previous_text": False,
            "no_speech_threshold": 0.6,
            "log_prob_threshold": -1.0,
            "compression_ratio_threshold": 2.4,
        }
        if norm_lang:
            kwargs["language"] = norm_lang
        if effective_prompt:
            kwargs["initial_prompt"] = effective_prompt[:1000]

        segments, info = self.whisper_model.transcribe(audio_path, **kwargs)

        logger.info(
            f"Detected language: {info.language} "
            f"(probability={info.language_probability:.2f})"
        )

        transcript = []

        for segment in segments:
            seg_text = sanitize_multilingual_text(segment.text.strip())
            if is_hallucination_or_noise(seg_text):
                continue

            logger.debug(
                f"[{segment.start:.2f}s -> {segment.end:.2f}s] "
                f"{segment.text}"
            )

            if segment.words:
                for word in segment.words:
                    w_text = sanitize_multilingual_text(word.word.strip())
                    if w_text and not is_hallucination_or_noise(w_text):
                        st = float(word.start)
                        en = float(word.end)
                        if en <= st:
                            en = st + 0.1
                        transcript.append({
                            "start": round(st, 2),
                            "end": round(en, 2),
                            "text": w_text
                        })
            else:
                if seg_text:
                    st = float(segment.start)
                    en = float(segment.end)
                    if en <= st:
                        en = st + 0.1
                    transcript.append({
                        "start": round(st, 2),
                        "end": round(en, 2),
                        "text": seg_text
                    })

        dur = round(time.time() - start_time, 2)
        logger.info(
            f"[Checkpoint B - Raw Provider Response] (Checkpoint A) Provider=Faster-Whisper Model={self.model_size} "
            f"Device={self.device_name} RequestedLang={language} NormLang={norm_lang} "
            f"DetectedLang={info.language} Words={len(transcript)} Duration={dur}s"
        )
        return transcript

    def _transcribe_gemini(self, audio_path: str, language: Optional[str] = "ta") -> List[Dict]:
        """Transcribe Tamil audio with Gemini's dedicated transcription model."""
        from google import genai

        from app.core.config import settings

        api_key = (settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY", "")).strip()
        if not api_key:
            raise ValueError("GEMINI_API_KEY is not configured")

        start_time = time.time()
        client = genai.Client(api_key=api_key)
        duration = get_audio_duration(audio_path)
        chunk_seconds = 600.0
        num_chunks = max(1, math.ceil(duration / chunk_seconds))
        transcript: List[Dict] = []

        def offset_seconds(value: Any) -> float:
            if hasattr(value, "total_seconds"):
                return float(value.total_seconds())
            match = re.search(r"[-+]?\d+(?:\.\d+)?", str(value or ""))
            if not match:
                raise ValueError(f"Gemini returned an invalid word timestamp: {value!r}")
            return float(match.group(0))

        for chunk_index in range(num_chunks):
            chunk_offset = chunk_index * chunk_seconds
            chunk_path = f"{os.path.splitext(audio_path)[0]}_gemini_{uuid.uuid4().hex[:8]}.mp3"
            uploaded_file = None
            try:
                subprocess.run([
                    "ffmpeg", "-y", "-nostdin", "-loglevel", "error",
                    "-ss", str(chunk_offset), "-t", str(chunk_seconds), "-i", audio_path,
                    "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", chunk_path,
                ], capture_output=True, check=True)
                uploaded_file = client.files.upload(file=chunk_path)
                interaction = client.interactions.create(
                    model="gemini-3.5-transcribe",
                    input=[{
                        "type": "audio",
                        "uri": uploaded_file.uri,
                        "mime_type": uploaded_file.mime_type or "audio/mp3",
                    }],
                    generation_config={
                        "transcription_config": {
                            "language_codes": ["ta-IN"],
                            "mode": {
                                "type": "verbatim",
                                "timestamp_granularities": ["word"],
                            },
                        }
                    },
                )

                word_annotations = []
                for step in getattr(interaction, "steps", []) or []:
                    for content in getattr(step, "content", []) or []:
                        for annotation in getattr(content, "annotations", []) or []:
                            annotation_type = str(getattr(annotation, "type", "")).lower()
                            if annotation_type.endswith("word_info"):
                                word_annotations.append(annotation)

                for annotation in word_annotations:
                    word = sanitize_multilingual_text(getattr(annotation, "text", ""))
                    if not word or is_hallucination_or_noise(word):
                        continue
                    word_start = offset_seconds(getattr(annotation, "start_offset", None)) + chunk_offset
                    word_end = offset_seconds(getattr(annotation, "end_offset", None)) + chunk_offset
                    if word_end <= word_start:
                        word_end = word_start + 0.1
                    transcript.append({
                        "start": round(word_start, 2),
                        "end": round(word_end, 2),
                        "text": word,
                    })

                if not word_annotations:
                    raise RuntimeError("Gemini returned no word timestamps for Tamil audio")
            finally:
                if uploaded_file is not None:
                    try:
                        client.files.delete(name=uploaded_file.name)
                    except Exception as cleanup_err:
                        logger.warning(f"Could not delete temporary Gemini audio upload: {cleanup_err}")
                if os.path.exists(chunk_path):
                    os.remove(chunk_path)

        logger.info(
            f"[Checkpoint B - Raw Provider Response] Provider=Gemini Model=gemini-3.5-transcribe "
            f"Language=ta-IN Chunks={num_chunks} Words={len(transcript)} "
            f"Duration={round(time.time() - start_time, 2)}s"
        )
        return transcript

    def _transcribe_google(self, audio_path: str, language: Optional[str] = None) -> List[Dict]:
        norm_lang = normalize_whisper_language(language)
        start_time = time.time()
        logger.info(f"Starting Google Cloud Speech-to-Text transcription for {audio_path} [Lang={norm_lang}]")
        from google.cloud import speech
        import io
        
        # Synchronous Google recognize is limited to 60 seconds and 10 MB.
        # Convert to mono LINEAR16 and submit <=55 second chunks with absolute offsets.
        chunk_seconds = 55.0
        temp_wav = f"{os.path.splitext(audio_path)[0]}_gcp_{int(time.time() * 1000)}.wav"
        cmd = [
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", audio_path,
            "-acodec", "pcm_s16le",
            "-ar", "22050",
            "-ac", "1",
            temp_wav
        ]
        subprocess.run(cmd, capture_output=True, check=True)
        
        transcript = []
        try:
            client = speech.SpeechClient()
            primary_lang = normalize_google_language(norm_lang or language)
            config = speech.RecognitionConfig(
                encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
                sample_rate_hertz=22050,
                language_code=primary_lang,
                enable_word_time_offsets=True,
            )

            duration = get_audio_duration(temp_wav)
            num_chunks = max(1, math.ceil(duration / chunk_seconds))
            for chunk_index in range(num_chunks):
                offset = chunk_index * chunk_seconds
                chunk_path = f"{os.path.splitext(temp_wav)[0]}_{chunk_index}.wav"
                try:
                    subprocess.run([
                        "ffmpeg", "-y", "-nostdin", "-loglevel", "error", "-ss", str(offset),
                        "-t", str(chunk_seconds), "-i", temp_wav, "-c:a", "copy", chunk_path
                    ], capture_output=True, check=True)
                    with io.open(chunk_path, "rb") as audio_file:
                        content = audio_file.read()
                    response = client.recognize(
                        config=config,
                        audio=speech.RecognitionAudio(content=content),
                        timeout=120,
                    )
                    for result in response.results:
                        if not result.alternatives:
                            continue
                        for word_info in result.alternatives[0].words:
                            start_sec = word_info.start_time.total_seconds() + offset
                            end_sec = word_info.end_time.total_seconds() + offset
                            word = word_info.word.strip()
                            if word and not is_hallucination_or_noise(word):
                                if end_sec <= start_sec:
                                    end_sec = start_sec + 0.1
                                transcript.append({
                                    "start": round(start_sec, 2),
                                    "end": round(end_sec, 2),
                                    "text": word
                                })
                finally:
                    if os.path.exists(chunk_path):
                        os.remove(chunk_path)
            
            dur = round(time.time() - start_time, 2)
            logger.info(
                f"[Checkpoint B - Raw Provider Response] (Checkpoint A) Provider=GoogleSTT PrimaryLang={primary_lang} "
                f"RequestedLang={language} Words={len(transcript)} Duration={dur}s"
            )
            return transcript
        finally:
            if os.path.exists(temp_wav):
                try:
                    os.remove(temp_wav)
                except Exception:
                    pass

    def compare_transcription_engines(
        self,
        audio_path: str,
        language: Optional[str] = "ta",
        prompt: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Controlled engine comparison helper (Requirement 7).
        Transcribes the same audio file with available engines without exposing secrets.
        Returns safe structured comparison metrics: provider, word count, duration, sample text, and error if any.
        """
        if not os.path.exists(audio_path):
            return {
                "error": f"Audio file not found: {audio_path}",
                "requested_language": language,
                "prompt": prompt,
            }

        results: Dict[str, Any] = {}
        norm_lang = normalize_whisper_language(language)

        # 1. Test Groq Whisper
        from app.core.config import settings
        groq_key = (settings.GROQ_API_KEY or os.environ.get("GROQ_API_KEY", "")).strip()
        if groq_key:
            try:
                t0 = time.time()
                words = self._transcribe_groq(audio_path, language=norm_lang, prompt=prompt)
                dur = round(time.time() - t0, 2)
                sample = " ".join([w["text"] for w in words[:10]]) if words else ""
                results["groq_whisper"] = {
                    "available": True,
                    "model": "whisper-large-v3",
                    "word_count": len(words),
                    "duration_sec": dur,
                    "sample": sample,
                    "error": None,
                }
            except Exception as ge:
                results["groq_whisper"] = {
                    "available": True,
                    "model": "whisper-large-v3",
                    "error": str(ge),
                }
        else:
            results["groq_whisper"] = {"available": False, "reason": "GROQ_API_KEY not configured"}

        # Gemini is the Tamil-first provider.
        if norm_lang == "ta" and self.use_gemini and not self._gemini_unavailable:
            try:
                t0 = time.time()
                words = self._transcribe_gemini(audio_path, language="ta")
                dur = round(time.time() - t0, 2)
                sample = " ".join([w["text"] for w in words[:10]]) if words else ""
                results["gemini_transcribe"] = {
                    "available": True,
                    "model": "gemini-3.5-transcribe",
                    "word_count": len(words),
                    "duration_sec": dur,
                    "sample": sample,
                    "error": None,
                }
            except Exception as ge:
                results["gemini_transcribe"] = {
                    "available": True,
                    "model": "gemini-3.5-transcribe",
                    "error": str(ge),
                }
        else:
            reason = "Gemini Transcribe is reserved for Tamil" if norm_lang != "ta" else "GEMINI_API_KEY missing, SDK unavailable, or quota exhausted"
            results["gemini_transcribe"] = {"available": False, "reason": reason}

        # Google Cloud STT remains available after Groq for non-Tamil languages.
        if self.use_google and not self._google_quota_exhausted:
            try:
                t0 = time.time()
                words = self._transcribe_google(audio_path, language=norm_lang)
                dur = round(time.time() - t0, 2)
                sample = " ".join([w["text"] for w in words[:10]]) if words else ""
                results["google_stt"] = {
                    "available": True,
                    "word_count": len(words),
                    "duration_sec": dur,
                    "sample": sample,
                    "error": None,
                }
            except Exception as gce:
                results["google_stt"] = {
                    "available": True,
                    "error": str(gce),
                }
        else:
            results["google_stt"] = {"available": False, "reason": "Google Cloud STT credentials not set or quota exhausted"}

        # 3. Test Local Faster-Whisper
        try:
            self._ensure_whisper_loaded()
            t0 = time.time()
            words = self._transcribe_whisper(audio_path, language=norm_lang, prompt=prompt)
            dur = round(time.time() - t0, 2)
            sample = " ".join([w["text"] for w in words[:10]]) if words else ""
            results["faster_whisper"] = {
                "available": True,
                "model": self.model_size,
                "device": self.device_name,
                "word_count": len(words),
                "duration_sec": dur,
                "sample": sample,
                "error": None,
            }
        except Exception as we:
            results["faster_whisper"] = {
                "available": True,
                "model": self.model_size,
                "error": str(we),
            }

        return results


transcription_service = TranscriptionService(model_size="large-v3")
compare_transcription_engines = transcription_service.compare_transcription_engines
