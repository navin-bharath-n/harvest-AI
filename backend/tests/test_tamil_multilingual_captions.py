"""
Harvest AI - Tamil and Multilingual Caption Accuracy & Regression Test Suite
Validates:
1. Tamil Unicode preservation (viramas, vowel signs, conjuncts).
2. Word deduplication preserving distinct consonant-identical Tamil words (பாடி vs படி, கல் vs கால்).
3. Groq/Whisper language code normalization (e.g. ta-IN -> ta, tamil -> ta).
4. Unicode-aware noise and hallucination detection.
5. ASS subtitle generation with proper font selection (Nirmala UI / Noto Sans Tamil) and escaping ({, }, \\).
6. SRT subtitle generation with Tamil UTF-8 encoding.
7. English transcripts and standard Latin processing remaining 100% unaffected.
8. Malformed and out-of-order timestamp handling.
9. Mixed Tanglish / code-switching text preservation.
10. Controlled engine comparison helper (compare_transcription_engines).
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

from app.services.subtitle_service import subtitle_service, escape_ass_text, _normalize_word_for_dedup
from app.services.transcription_service import (
    transcription_service,
    normalize_whisper_language,
    is_hallucination_or_noise,
    compare_transcription_engines
)


# =====================================================================
# Test 1: Language Normalization for Groq Whisper
# =====================================================================
def test_language_normalization_groq_whisper():
    """Verify that language codes are mapped strictly to ISO-639-1 codes expected by Groq."""
    assert normalize_whisper_language("ta-IN") == "ta"
    assert normalize_whisper_language("ta") == "ta"
    assert normalize_whisper_language("tamil") == "ta"
    assert normalize_whisper_language("ta-colloquial") == "ta"
    assert normalize_whisper_language("TAMIL") == "ta"

    assert normalize_whisper_language("en-US") == "en"
    assert normalize_whisper_language("en-GB") == "en"
    assert normalize_whisper_language("english") == "en"

    assert normalize_whisper_language("hi-IN") == "hi"
    assert normalize_whisper_language("hindi") == "hi"

    # Auto-detection triggers
    assert normalize_whisper_language(None) is None
    assert normalize_whisper_language("") is None
    assert normalize_whisper_language("auto") is None
    assert normalize_whisper_language("none") is None
    assert normalize_whisper_language("unknown") is None


# =====================================================================
# Test 2: Tamil Unicode Preservation & Character Integrity
# =====================================================================
def test_tamil_unicode_combining_characters():
    """Verify that Tamil vowel signs, viramas, and complex ligatures are preserved."""
    sample_words = [
        "தமிழ்",       # Tamil (contains virama ்)
        "வணக்கம்",     # Vanakkam (contains viramas ்)
        "விவசாயம்",   # Vivasayam (agriculture)
        "அறுவடை",      # Harvest
        "செயற்கை",    # Artificial
        "நுண்ணறிவு"    # Intelligence
    ]

    for word in sample_words:
        normalized = _normalize_word_for_dedup(word)
        assert len(normalized) > 0
        # Verify viramas specifically are preserved in normalized dedup token
        for c in word:
            if c == "\u0BCD":  # Tamil Virama
                assert "\u0BCD" in normalized, f"Virama lost in {word}"


# =====================================================================
# Test 3: Deduplication Does NOT Drop Distinct Tamil Words
# =====================================================================
def test_tamil_distinct_words_not_dropped():
    """
    Ensure pairs like பாடி (paadi) and படி (padi), or கல் (kal) and கால் (kaal)
    are treated as distinct and not collapsed into duplicates.
    """
    assert _normalize_word_for_dedup("பாடி") != _normalize_word_for_dedup("படி")
    assert _normalize_word_for_dedup("கல்") != _normalize_word_for_dedup("கால்")
    assert _normalize_word_for_dedup("பல்") != _normalize_word_for_dedup("பால்")

    tokens = [
        {"start": 0.0, "end": 0.5, "text": "பாடி"},
        {"start": 0.6, "end": 1.0, "text": "படி"},
        {"start": 1.1, "end": 1.5, "text": "கல்"},
        {"start": 1.6, "end": 2.0, "text": "கால்"}
    ]

    cleaned, stats = subtitle_service.validate_and_clean_transcript(tokens)
    assert len(cleaned) == 4
    assert stats["accepted_segments"] == 4
    assert stats["rejected_segments"] == 0
    texts = [w["text"] for w in cleaned]
    assert texts == ["பாடி", "படி", "கல்", "கால்"]


# =====================================================================
# Test 4: Deduplication Still Catches Actual Overlapping Glitch Tokens
# =====================================================================
def test_tamil_actual_repetitions_collapsed():
    """Verify that identical duplicate tokens with overlapping timestamps are collapsed."""
    tokens = [
        {"start": 0.0, "end": 0.45, "text": "வணக்கம்"},
        {"start": 0.02, "end": 0.46, "text": "வணக்கம்"},  # Whisper overlapping duplicate
        {"start": 0.5, "end": 0.9, "text": "நண்பர்களே"}
    ]
    cleaned, stats = subtitle_service.validate_and_clean_transcript(tokens)
    assert len(cleaned) == 2
    assert [w["text"] for w in cleaned] == ["வணக்கம்", "நண்பர்களே"]


# =====================================================================
# Test 5: Unicode-Aware Noise & Hallucination Filter
# =====================================================================
def test_unicode_noise_detection():
    """
    Verify that genuine Tamil words are not marked as noise,
    while repetitive ASCII punctuation or noise tokens are correctly flagged.
    """
    assert not is_hallucination_or_noise("தமிழ்")
    assert not is_hallucination_or_noise("வணக்கம் நண்பர்களே")
    assert not is_hallucination_or_noise("ஆம்")
    assert not is_hallucination_or_noise("வாழ்க")

    # Noise and junk should still be detected
    assert is_hallucination_or_noise("...")
    assert is_hallucination_or_noise("---")
    assert is_hallucination_or_noise("[Music]")
    assert is_hallucination_or_noise("Subtitles by Amara.org")
    assert is_hallucination_or_noise("Thank you for watching!")


# =====================================================================
# Test 6: ASS Subtitle Escaping & Injection Prevention
# =====================================================================
def test_ass_escaping():
    """Verify that curly braces and backslashes in transcript text do not corrupt ASS markup."""
    dangerous_text = "வணக்கம் {\\b1} bold {test} test \\N new"
    escaped = escape_ass_text(dangerous_text)
    assert "{" not in escaped
    assert "}" not in escaped
    assert "｛" in escaped
    assert "｝" in escaped

    # Single word escaping
    assert escape_ass_text("{test}") == "｛test｝"


# =====================================================================
# Test 7: ASS Generation with Tamil Font Fallback
# =====================================================================
def test_ass_generation_tamil_font():
    """Verify that ASS generated for Tamil words selects Nirmala UI or Noto Sans Tamil."""
    tamil_words = [
        {"start": 0.0, "end": 0.5, "text": "வணக்கம்"},
        {"start": 0.6, "end": 1.2, "text": "நண்பர்களே"},
        {"start": 1.3, "end": 2.0, "text": "இனிய"},
        {"start": 2.1, "end": 2.8, "text": "காலை"}
    ]

    with tempfile.NamedTemporaryFile(suffix=".ass", delete=False) as tf:
        ass_path = tf.name

    try:
        subtitle_service.generate_ass(tamil_words, ass_path, {"caption_style": "pop", "target_lang": "ta"})
        assert os.path.exists(ass_path)

        with open(ass_path, "r", encoding="utf-8") as f:
            content = f.read()

        if sys.platform == "win32":
            assert "Nirmala UI" in content
        else:
            assert "Noto Sans Tamil" in content

        assert "Dialogue:" in content
        assert "வணக்கம்" in content
        assert "நண்பர்களே" in content
    finally:
        if os.path.exists(ass_path):
            os.remove(ass_path)


# =====================================================================
# Test 8: SRT Generation with Tamil UTF-8 Integrity
# =====================================================================
def test_srt_generation_tamil_utf8():
    """Verify that SRT generated for Tamil transcript is valid UTF-8 without byte corruption."""
    tamil_segments = [
        {"start": 0.0, "end": 1.5, "text": "இயற்கை வேளாண்மை மிக முக்கியமானது."},
        {"start": 1.8, "end": 3.2, "text": "மண்ணின் வளம் காக்க மரங்களை நடுவோம்."}
    ]

    with tempfile.NamedTemporaryFile(suffix=".srt", delete=False) as tf:
        srt_path = tf.name

    try:
        stats = subtitle_service.generate_srt(tamil_segments, srt_path)
        assert stats["caption_count"] == 2
        assert stats["file_size"] > 0

        with open(srt_path, "r", encoding="utf-8") as f:
            content = f.read()

        assert "இயற்கை வேளாண்மை மிக முக்கியமானது." in content
        assert "மண்ணின் வளம் காக்க மரங்களை நடுவோம்." in content
        assert "00:00:00,000 -->" in content
    finally:
        if os.path.exists(srt_path):
            os.remove(srt_path)


# =====================================================================
# Test 9: English Pipeline Regression Protection
# =====================================================================
def test_english_pipeline_regression_protection():
    """Verify that pure English text processing is 100% unchanged."""
    english_words = [
        {"start": 0.0, "end": 0.5, "text": "Hello"},
        {"start": 0.6, "end": 1.0, "text": "world"},
        {"start": 1.1, "end": 1.8, "text": "Harvest"},
        {"start": 1.9, "end": 2.5, "text": "AI"}
    ]

    with tempfile.NamedTemporaryFile(suffix=".ass", delete=False) as tf:
        ass_path = tf.name

    try:
        subtitle_service.generate_ass(english_words, ass_path, {"caption_style": "pop", "target_lang": "en"})
        with open(ass_path, "r", encoding="utf-8") as f:
            content = f.read()

        assert "Arial Black" in content or "Montserrat" in content
        assert "Dialogue:" in content
        assert "Hello" in content
        assert "world" in content
    finally:
        if os.path.exists(ass_path):
            os.remove(ass_path)


# =====================================================================
# Test 10: Mixed Tanglish / Code-Switching Speech
# =====================================================================
def test_mixed_tamil_english_text():
    """Verify that mixed Tamil and English sentences preserve both scripts accurately."""
    mixed_segments = [
        {"start": 0.0, "end": 1.5, "text": "Harvest AI மூலமாக வீடியோ எடிட்டிங் செய்யலாம்."},
        {"start": 1.6, "end": 3.0, "text": "Super fast captions மற்றும் subtitles கிடைக்கும்."}
    ]

    cleaned, stats = subtitle_service.validate_and_clean_transcript(mixed_segments)
    all_text = " ".join([w["text"] for w in cleaned])
    assert "Harvest" in all_text
    assert "AI" in all_text
    assert "மூலமாக" in all_text
    assert "Super" in all_text
    assert "subtitles" in all_text


# =====================================================================
# Test 11: Malformed and Out-of-Order Timestamps
# =====================================================================
def test_malformed_timestamps_handling():
    """Verify that segments with inverted or negative intervals are rejected safely while valid Tamil segments pass."""
    segments = [
        {"start": 2.0, "end": 1.0, "text": "Inverted segment"},    # end < start -> rejected
        {"start": -5.0, "end": -1.0, "text": "Negative interval"},  # end <= 0 -> rejected
        {"start": 0.0, "end": 1.5, "text": "வணக்கம்"},               # Valid single Tamil word -> accepted
        {"start": float("nan"), "end": 3.0, "text": "NaN segment"}  # NaN -> rejected
    ]

    cleaned, stats = subtitle_service.validate_and_clean_transcript(segments)
    assert len(cleaned) == 1
    assert cleaned[0]["text"] == "வணக்கம்"
    assert stats["rejected_segments"] == 3


# =====================================================================
# Test 12: Engine Comparison Helper Availability
# =====================================================================
def test_compare_engines_helper_signature():
    """Verify that compare_transcription_engines helper is available and handles missing file gracefully."""
    result = compare_transcription_engines("non_existent_audio.wav", language="ta", prompt="விவசாயம்")
    assert "error" in result
    assert result["requested_language"] == "ta"
    assert result["prompt"] == "விவசாயம்"


# =====================================================================
# Test 13: Tamil Combining Vowel Healing & Dotted Circle Prevention
# =====================================================================
def test_tamil_combining_vowel_healing():
    """
    Verify that decomposed and corrupt Tamil sequences:
    1. 'கௗொஞ்சம்' (au mark + e-sign + aa-sign) is healed to canonical 'கொஞ்சம்' (\u0bca).
    2. 'மாேர்வய' (aa-sign + ee-sign) is healed to canonical 'மோர்வய' (\u0bcb).
    3. Stray Arabic letters like 'د' in 'دனில' are removed to yield 'னில'.
    """
    from app.services.transcription_service import sanitize_multilingual_text

    corrupt_konjam = "க\u0bd7\u0bc6\u0bbeஞ்சம்"  # கௗொஞ்சம்
    healed = sanitize_multilingual_text(corrupt_konjam)
    assert "\u0bca" in healed  # Must contain canonical precomposed ொ
    assert "\u0bd7" not in healed  # AU length mark removed
    assert "\u0bc6" not in healed  # Standalone e-sign removed
    assert "\u0bbe" not in healed  # Standalone aa-sign removed

    corrupt_mor = "மாேர்வய"  # decomposed \u0bbe\u0bc7
    healed_mor = sanitize_multilingual_text(corrupt_mor)
    assert "\u0bcb" in healed_mor  # Must contain canonical ோ
    assert "\u0bbe\u0bc7" not in healed_mor

    hallucinated_arabic = "دனில"  # Arabic DAL + Tamil
    healed_arabic = sanitize_multilingual_text(hallucinated_arabic)
    assert healed_arabic == "னில"
    assert "د" not in healed_arabic


# =====================================================================
# Test 14: Timestamp Hallucination (e.g. 019-006) Rejection
# =====================================================================
def test_timestamp_hallucination_filtered():
    """
    Verify that Whisper timestamp hallucinations like '019-006' and '00:00'
    are recognized as hallucinations and stripped by validate_and_clean_transcript.
    """
    from app.services.transcription_service import is_hallucination_or_noise

    assert is_hallucination_or_noise("019-006") is True
    assert is_hallucination_or_noise("00:00") is True
    assert is_hallucination_or_noise("12:34") is True
    assert is_hallucination_or_noise("#1") is True

    # Real words are NOT noise
    assert is_hallucination_or_noise("காலிஃபிளவர்") is False
    assert is_hallucination_or_noise("வணக்கம்") is False
    assert is_hallucination_or_noise("தேவையான") is False
    assert is_hallucination_or_noise("கொஞ்சம்") is False

    test_tokens = [
        {"start": 18.48, "end": 19.16, "text": "019-006"},
        {"start": 19.18, "end": 20.4, "text": "காலிஃபிளவர்"}
    ]
    cleaned, stats = subtitle_service.validate_and_clean_transcript(test_tokens)
    assert len(cleaned) == 1
    assert cleaned[0]["text"] == "காலிஃபிளவர்"
    assert stats["rejected_segments"] == 1


# =====================================================================
# Test 15: Video Context Language Auto-Detection
# =====================================================================
def test_video_context_language_detection():
    """Verify that video filename / context automatically resolves language for regional videos."""
    from app.services.transcription_service import detect_video_context_language

    # The exact filename from user's video:
    filename_user = "7-Minute Cauliflower Kuruma Coimbatore Style Quick Cooking.mp4"
    assert detect_video_context_language(filename_user) == "ta"

    filename_tamil_script = "சுவையான தக்காளி சாதம் செய்முறை.mp4"
    assert detect_video_context_language(filename_tamil_script) == "ta"

    filename_hindi = "Paneer Butter Masala Rasoi Special.mp4"
    assert detect_video_context_language(filename_hindi) == "hi"

    filename_english = "Machine Learning Tutorial for Beginners.mp4"
    assert detect_video_context_language(filename_english) is None


# =====================================================================
# Test 16: escape_ass_text Applies Tamil Healing & Prevents Dotted Circles
# =====================================================================
def test_escape_ass_text_tamil_sanitization():
    """Verify that escape_ass_text heals corrupt Tamil combining marks before rendering ASS dialogue."""
    raw = "க\u0bd7\u0bc6\u0bbeஞ்சம் {bold}"
    escaped = subtitle_service.escape_ass_text(raw)
    assert "｛bold｝" in escaped
    assert "\u0bca" in escaped
    assert "\u0bd7" not in escaped


# =====================================================================
# Test 17: Long Video Chunking & Frame-Accurate Timestamp Offset
# =====================================================================
def test_long_video_chunking_and_timestamp_anchoring(monkeypatch):
    """
    Verify that audio > 180s (e.g. 19-30 min videos) is chunked into <= 150s slices,
    each chunk timestamp is mathematically offset by start_t, and words at minute 0:00
    are captured without skipping the first 5 minutes.
    """
    from app.services.transcription_service import get_audio_duration

    # 1. Mock get_audio_duration to return 600.0s (10 minutes)
    monkeypatch.setattr(
        "app.services.transcription_service.get_audio_duration",
        lambda p: 600.0
    )

    # 2. Mock _transcribe_groq_single to return dummy words relative to each slice
    chunks_called = []

    def mock_single(audio_path, language=None, prompt=None):
        chunks_called.append(audio_path)
        # Return 2 words for each chunk starting at 0.5s and 10.0s relative to chunk
        return [
            {"start": 0.5, "end": 1.2, "text": "வணக்கம்"},
            {"start": 10.0, "end": 11.5, "text": "மசாலா"},
        ]

    monkeypatch.setattr(transcription_service, "_transcribe_groq_single", mock_single)

    # Mock subprocess.run for ffmpeg chunk extraction
    class MockCompletedProcess:
        returncode = 0
        stdout = b""
        stderr = b""

    monkeypatch.setattr("subprocess.run", lambda *args, **kwargs: MockCompletedProcess())

    # Create dummy file path
    dummy_audio = "dummy_long_audio.mp3"
    result = transcription_service._transcribe_groq(dummy_audio, language="ta")

    # 600s / 150s = 4 chunks
    assert len(chunks_called) == 4

    # Total words: 4 chunks * 2 words = 8 words
    assert len(result) == 8

    # Verify Chunk 0 timestamps (0.0s offset): should start at 0.5s and 10.0s (minute 0 is NEVER skipped!)
    assert result[0]["start"] == 0.5
    assert result[0]["end"] == 1.2
    assert result[1]["start"] == 10.0

    # Verify Chunk 1 timestamps (150.0s offset): 0.5 + 150 = 150.5s, 10.0 + 150 = 160.0s
    assert result[2]["start"] == 150.5
    assert result[2]["end"] == 151.2
    assert result[3]["start"] == 160.0

    # Verify Chunk 2 timestamps (300.0s offset): 0.5 + 300 = 300.5s
    assert result[4]["start"] == 300.5

    # Verify Chunk 3 timestamps (450.0s offset): 0.5 + 450 = 450.5s
    assert result[6]["start"] == 450.5
    assert result[7]["start"] == 460.0


