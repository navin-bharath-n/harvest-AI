"""
Harvest AI - Multilingual Caption Reliability Test Suite (Section 14)
Comprehensive regression tests for ALL supported languages & scripts:
- English
- Tamil
- Hindi (Devanagari)
- Telugu
- Kannada
- Malayalam
- Bengali
- Arabic (RTL)
- Spanish
- French
- Japanese
- Chinese
- Cyrillic (Russian)
- Greek
- Mixed Tamil-English code-switching
"""

import os
import sys
import tempfile
import unicodedata
import pytest
from pathlib import Path

# Add backend directory to sys.path
_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from app.services.subtitle_service import (
    subtitle_service,
    escape_ass_text,
    _normalize_word_for_dedup,
    select_multilingual_font,
    MULTILINGUAL_SENTENCE_ENDINGS
)
from app.services.transcription_service import (
    transcription_service,
    normalize_whisper_language,
    normalize_google_language,
    is_hallucination_or_noise,
    compare_transcription_engines
)
from app.services.caption_diagnostic_tool import verify_caption_pipeline


# Multilingual reference fixtures for all 14 target languages
MULTILINGUAL_FIXTURES = {
    "ta": {
        "name": "Tamil",
        "sample": "இயற்கை வேளாண்மை மிக முக்கியமானது.",
        "font_win": "Nirmala UI",
        "font_linux": "Noto Sans Tamil",
        "google_locale": "ta-IN",
    },
    "hi": {
        "name": "Hindi",
        "sample": "प्राकृतिक खेती बहुत महत्वपूर्ण है।",
        "font_win": "Nirmala UI",
        "font_linux": "Noto Sans Devanagari",
        "google_locale": "hi-IN",
    },
    "te": {
        "name": "Telugu",
        "sample": "సేంద్రీయ వ్యవసాయం చాలా ముఖ్యమైనది.",
        "font_win": "Nirmala UI",
        "font_linux": "Noto Sans Telugu",
        "google_locale": "te-IN",
    },
    "kn": {
        "name": "Kannada",
        "sample": "ನೈಸರ್ಗಿಕ ಕೃಷಿ ಅತ್ಯಂತ ಮುಖ್ಯವಾಗಿದೆ.",
        "font_win": "Nirmala UI",
        "font_linux": "Noto Sans Kannada",
        "google_locale": "kn-IN",
    },
    "ml": {
        "name": "Malayalam",
        "sample": "പ്രകൃതിദത്ത കൃഷി വളരെ പ്രധാനപ്പെട്ടതാണ്.",
        "font_win": "Nirmala UI",
        "font_linux": "Noto Sans Malayalam",
        "google_locale": "ml-IN",
    },
    "bn": {
        "name": "Bengali",
        "sample": "প্রাকৃতিক কৃষি অত্যন্ত গুরুত্বপূর্ণ।",
        "font_win": "Nirmala UI",
        "font_linux": "Noto Sans Bengali",
        "google_locale": "bn-IN",
    },
    "ar": {
        "name": "Arabic",
        "sample": "الزراعة الطبيعية مهمة جدا للحفاظ على البيئة.",
        "font_win": "Segoe UI",
        "font_linux": "Noto Sans Arabic",
        "google_locale": "ar-SA",
    },
    "es": {
        "name": "Spanish",
        "sample": "La agricultura natural es muy importante para el suelo.",
        "font_win": "Arial Black",
        "font_linux": "DejaVu Sans",
        "google_locale": "es-ES",
    },
    "fr": {
        "name": "French",
        "sample": "L'agriculture naturelle est essentielle pour l'avenir.",
        "font_win": "Arial Black",
        "font_linux": "DejaVu Sans",
        "google_locale": "fr-FR",
    },
    "ja": {
        "name": "Japanese",
        "sample": "自然農業は非常に重要です。土壌を守りましょう。",
        "font_win": "Meiryo",
        "font_linux": "Noto Sans CJK JP",
        "google_locale": "ja-JP",
    },
    "zh": {
        "name": "Chinese",
        "sample": "自然农业非常重要，让我们保护土壤。",
        "font_win": "Microsoft YaHei",
        "font_linux": "Noto Sans CJK SC",
        "google_locale": "zh-CN",
    },
    "ru": {
        "name": "Russian",
        "sample": "Естественное земледелие очень важно для природы.",
        "font_win": "Arial Black",
        "font_linux": "DejaVu Sans",
        "google_locale": "ru-RU",
    },
    "el": {
        "name": "Greek",
        "sample": "Η φυσική καλλιέργεια είναι εξαιρετικά σημαντική.",
        "font_win": "Segoe UI",
        "font_linux": "Noto Sans",
        "google_locale": "el-GR",
    },
    "en": {
        "name": "English",
        "sample": "Natural farming is essential for soil health.",
        "font_win": "Arial Black",
        "font_linux": "DejaVu Sans",
        "google_locale": "en-US",
    },
}


# =====================================================================
# Test 1: Language Code Mappings (Groq Whisper & Google STT)
# =====================================================================
def test_multilingual_language_code_mappings():
    """Verify that every supported language maps to valid ISO-639-1 and Google BCP-47 codes."""
    for lang_code, data in MULTILINGUAL_FIXTURES.items():
        # Whisper ISO-639-1
        norm_whisper = normalize_whisper_language(lang_code)
        assert norm_whisper == lang_code, f"Failed for {lang_code}"

        # Google STT BCP-47
        norm_google = normalize_google_language(lang_code)
        assert norm_google == data["google_locale"], f"Failed Google locale for {lang_code}"

    # Verify auto-detection retention
    for nil_val in [None, "", "auto", "none", "original", "unknown"]:
        assert normalize_whisper_language(nil_val) is None


# =====================================================================
# Test 2: Unicode Text Preservation across All Scripts
# =====================================================================
def test_multilingual_unicode_preservation():
    """Verify that no script is corrupted, stripped, or converted to ASCII."""
    for lang_code, data in MULTILINGUAL_FIXTURES.items():
        text = data["sample"]
        tokens = [{"start": float(i), "end": float(i + 0.8), "text": word} for i, word in enumerate(text.split())]
        cleaned, stats = subtitle_service.validate_and_clean_transcript(tokens)

        assert stats["accepted_segments"] == len(tokens), f"Lost tokens in {lang_code}"
        cleaned_text = " ".join([w["text"] for w in cleaned])

        # Verify characters retained their original Unicode form
        for original_word in text.split():
            assert original_word in cleaned_text, f"Word '{original_word}' missing in {lang_code}"


# =====================================================================
# Test 3: Deduplication without False Positives Across All Languages
# =====================================================================
def test_multilingual_deduplication_preserves_distinct_words():
    """
    Verify that accented words in Latin (e.g. ano vs año),
    vowel-differentiated words in Indic (படி vs பாடி, कल vs काल),
    and RTL words are not collapsed.
    """
    test_pairs = [
        ("படி", "பாடி"),      # Tamil: padi vs paadi
        ("कल", "काल"),        # Hindi: kal vs kaal
        ("ano", "año"),       # Spanish: year vs anus
        ("cote", "côte"),     # French: rating vs coast
        ("para", "pará"),     # Portuguese
    ]

    for w1, w2 in test_pairs:
        n1 = _normalize_word_for_dedup(w1)
        n2 = _normalize_word_for_dedup(w2)
        assert n1 != n2, f"Erroneously collapsed {w1} and {w2}"


# =====================================================================
# Test 4: Script-Aware Font Selection Across All Platforms
# =====================================================================
def test_multilingual_font_selection():
    """Verify that appropriate fonts are chosen for each script on Windows and Linux."""
    is_windows = os.name == "nt"

    for lang_code, data in MULTILINGUAL_FIXTURES.items():
        sample_words = [{"text": w} for w in data["sample"].split()]
        font_name, is_non_latin, detected_script = select_multilingual_font(sample_words, lang_code)

        expected_font = data["font_win"] if is_windows else data["font_linux"]
        assert font_name == expected_font, (
            f"Font mismatch for {lang_code} ({data['name']}): expected {expected_font}, got {font_name}"
        )


# =====================================================================
# Test 5: ASS Special Characters Escaping Across All Languages
# =====================================================================
def test_multilingual_ass_escaping():
    """Verify that curly braces and override tags in foreign text are safely escaped."""
    for lang_code, data in MULTILINGUAL_FIXTURES.items():
        injected = f"{data['sample']} {{test}} {{\\b1}} \\N"
        escaped = escape_ass_text(injected)

        assert "{" not in escaped
        assert "}" not in escaped
        assert "｛" in escaped
        assert "｝" in escaped


# =====================================================================
# Test 6: SRT UTF-8 Sequential Generation for All Scripts
# =====================================================================
def test_multilingual_srt_generation():
    """Verify that SRT files generate valid sequential numbered cues with UTF-8 encoding."""
    for lang_code, data in MULTILINGUAL_FIXTURES.items():
        segments = [
            {"start": 0.0, "end": 1.5, "text": data["sample"]},
            {"start": 1.8, "end": 3.0, "text": f"{data['sample']} (Part 2)"}
        ]

        with tempfile.NamedTemporaryFile(suffix=".srt", delete=False) as tf:
            srt_path = tf.name

        try:
            stats = subtitle_service.generate_srt(segments, srt_path)
            assert stats["caption_count"] >= 2
            assert stats["file_size"] > 0

            with open(srt_path, "r", encoding="utf-8") as f:
                content = f.read()

            assert "1\n00:00:00,000 -->" in content
            assert "(Part 2)" in content
        finally:
            if os.path.exists(srt_path):
                os.remove(srt_path)


# =====================================================================
# Test 7: Multilingual Sentence Endings Splitting
# =====================================================================
def test_multilingual_sentence_endings_splitting():
    """Verify sentence boundaries across CJK (。), Indic (।), Arabic (؟), and Western (.)."""
    endings = [
        ("Hindi sentence with danda। Next sentence", "।"),
        ("Chinese sentence with full stop。 Next sentence", "。"),
        ("Arabic question؟ Next sentence", "؟"),
        ("English sentence. Next sentence", ".")
    ]

    for text, ending in endings:
        words = [{"start": float(i * 0.5), "end": float(i * 0.5 + 0.4), "text": w} for i, w in enumerate(text.split())]
        lines = subtitle_service.group_words_into_lines(words, max_words=10, max_duration=5.0)

        # Ensure sentence boundary was honored (at least 2 lines)
        assert len(lines) >= 2, f"Failed sentence splitting on ending {ending}"


# =====================================================================
# Test 8: Empty, Malformed, Inverted, and Negative Timestamp Handling
# =====================================================================
def test_multilingual_malformed_records_rejected_safely():
    """Verify that invalid segments are safely filtered without dropping valid multilingual text."""
    bad_segments = [
        "not a dict",
        {"start": None, "end": 1.0, "text": "missing start"},
        {"start": 2.0, "end": 1.0, "text": "inverted timestamps"},
        {"start": -5.0, "end": -1.0, "text": "negative interval"},
        {"start": float("nan"), "end": 2.0, "text": "NaN timestamp"},
        {"start": 0.0, "end": 1.0, "text": "   "},  # empty
        {"start": 1.0, "end": 2.0, "text": "[Music]"},  # noise
        {"start": 0.0, "end": 1.5, "text": "VALID MULTILINGUAL: 자연 농업"},  # Korean valid
    ]

    cleaned, stats = subtitle_service.validate_and_clean_transcript(bad_segments)
    assert stats["rejected_segments"] == 7
    assert stats["accepted_segments"] > 0
    assert any("자연" in w["text"] for w in cleaned)


# =====================================================================
# Test 9: Noise Check Does Not Reject Foreign Human Speech
# =====================================================================
def test_multilingual_noise_filter_safety():
    """Verify that short words in Arabic, Chinese, Russian, Greek, etc. are NOT marked as noise."""
    foreign_valid_words = [
        "نعم",       # Arabic "Yes"
        "لا",        # Arabic "No"
        "好",        # Chinese "Good"
        "はい",      # Japanese "Yes"
        "Да",        # Russian "Yes"
        "Ναι",       # Greek "Yes"
        "ஆம்",       # Tamil "Yes"
        "हाँ",       # Hindi "Yes"
    ]

    for word in foreign_valid_words:
        assert not is_hallucination_or_noise(word), f"Erroneously flagged {word} as noise"

    # Confirmed noise must still be caught
    assert is_hallucination_or_noise("...")
    assert is_hallucination_or_noise("[Applause]")
    assert is_hallucination_or_noise("Thank you for watching!")


# =====================================================================
# Test 10: Mixed Language Code-Switching Speech Preservation
# =====================================================================
def test_mixed_language_code_switching_preservation():
    """Verify that sentences with mixed scripts (e.g., Tanglish, Hinglish) survive cleanly."""
    mixed_sentences = [
        "Harvest AI மூலமாக video editing செய்யலாம்.",
        "Aaj ka video bahut interesting aur engaging hoga.",
        "El nuevo modelo de AI es increíblemente fast.",
    ]

    for s in mixed_sentences:
        tokens = [{"start": float(i * 0.5), "end": float(i * 0.5 + 0.4), "text": w} for i, w in enumerate(s.split())]
        cleaned, stats = subtitle_service.validate_and_clean_transcript(tokens)

        assert stats["accepted_segments"] == len(tokens)
        cleaned_str = " ".join([w["text"] for w in cleaned])
        assert cleaned_str == s


# =====================================================================
# Test 11: End-to-End Diagnostic Tool Execution
# =====================================================================
def test_diagnostic_tool_execution():
    """Verify that verify_caption_pipeline produces a complete 9-checkpoint diagnostic report."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf:
        dummy_audio = tf.name

    try:
        # Create small dummy file
        with open(dummy_audio, "wb") as f:
            f.write(b"RIFFdummydataWAVEfmt ")

        report = verify_caption_pipeline(dummy_audio, language="ta", target_lang="en", caption_style="pop")
        assert "checkpoints" in report
        assert "A_audio_metadata" in report["checkpoints"]
        assert "language_resolution" in report
        assert report["language_resolution"]["whisper_iso639_1"] == "ta"
        assert report["language_resolution"]["google_bcp47"] == "ta-IN"
        assert "font_detection" in report
    finally:
        if os.path.exists(dummy_audio):
            os.remove(dummy_audio)


# =====================================================================
# Test 12: Clip-Relative Timestamp Shifting Integrity
# =====================================================================
def test_clip_relative_timestamp_shifting():
    """Verify that trimming a video shifts timestamps accurately without corrupting text."""
    full_transcript = [
        {"start": 10.0, "end": 10.5, "text": "First"},
        {"start": 10.6, "end": 11.2, "text": "clip"},
        {"start": 11.3, "end": 12.0, "text": "words"},
        {"start": 25.0, "end": 26.0, "text": "Later"},
    ]

    clip_start = 10.0
    clip_end = 12.0

    part_words = [
        w for w in full_transcript
        if float(w.get("start", 0)) >= clip_start and float(w.get("end", 0)) <= clip_end
    ]
    assert len(part_words) == 3

    shifted = [
        {
            **w,
            "start": round(max(0.0, float(w.get("start", 0)) - clip_start), 2),
            "end": round(max(0.05, float(w.get("end", 0)) - clip_start), 2),
        }
        for w in part_words
    ]

    assert shifted[0]["start"] == 0.0
    assert shifted[0]["end"] == 0.5
    assert shifted[1]["start"] == 0.6
    assert shifted[2]["end"] == 2.0
