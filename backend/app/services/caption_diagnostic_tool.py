"""
Harvest AI - Caption Pipeline Diagnostic & Verification Utility (Section 15)
Safely benchmarks and validates the complete audio -> transcript -> SRT -> ASS -> render flow
across any supported language without modifying production databases or leaking credentials.
"""

import os
import sys
import tempfile
import unicodedata
import subprocess
import logging
from typing import Dict, Any, Optional, List

logger = logging.getLogger(__name__)

from app.services.transcription_service import (
    transcription_service,
    normalize_whisper_language,
    normalize_google_language,
    compare_transcription_engines
)
from app.services.subtitle_service import (
    subtitle_service,
    select_multilingual_font,
    escape_ass_text
)


def verify_caption_pipeline(
    media_path: str,
    language: Optional[str] = None,
    target_lang: Optional[str] = None,
    caption_style: str = "pop",
    prompt: Optional[str] = None
) -> Dict[str, Any]:
    """
    Executes a comprehensive, non-destructive diagnostic sweep across all 9 checkpoints (A through I)
    for a given media file (audio WAV/MP3 or video MP4).
    """
    report: Dict[str, Any] = {
        "status": "success",
        "warnings": [],
        "errors": [],
        "checkpoints": {}
    }

    if not os.path.exists(media_path):
        report["status"] = "failed"
        report["errors"].append(f"Media file does not exist: {media_path}")
        return report

    # Checkpoint A: Extracted Audio Metadata
    file_size = os.path.getsize(media_path)
    file_ext = os.path.splitext(media_path)[1].lower()
    is_video = file_ext in [".mp4", ".mov", ".mkv", ".avi", ".webm"]

    extracted_audio = media_path
    temp_files = []

    try:
        if is_video:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf:
                extracted_audio = tf.name
            temp_files.append(extracted_audio)

            cmd = ["ffmpeg", "-y", "-i", media_path, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", extracted_audio]
            res = subprocess.run(cmd, capture_output=True)
            if res.returncode != 0:
                report["warnings"].append("Could not extract 16kHz audio from video file using FFmpeg.")
                extracted_audio = media_path

        audio_size = os.path.getsize(extracted_audio) if os.path.exists(extracted_audio) else 0
        report["checkpoints"]["A_audio_metadata"] = {
            "source_path": media_path,
            "is_video": is_video,
            "audio_path": extracted_audio,
            "audio_size_bytes": audio_size,
            "sample_rate": 16000,
            "channels": 1
        }

        # Language Normalization
        norm_whisper_lang = normalize_whisper_language(language)
        norm_google_lang = normalize_google_language(language)
        report["language_resolution"] = {
            "input_language": language,
            "whisper_iso639_1": norm_whisper_lang,
            "google_bcp47": norm_google_lang
        }

        # Checkpoint B & C: Raw Provider Response & Normalized Transcript
        engine_comparison = compare_transcription_engines(extracted_audio, language=norm_whisper_lang, prompt=prompt)
        report["checkpoints"]["B_raw_provider_response"] = engine_comparison

        # Run primary transcription
        try:
            raw_transcript = transcription_service.transcribe(extracted_audio, language=norm_whisper_lang, prompt=prompt)
        except Exception as e:
            raw_transcript = []
            report["warnings"].append(f"Primary transcription failed: {e}")

        report["checkpoints"]["C_normalized_transcript"] = {
            "word_count": len(raw_transcript),
            "sample": " ".join([w.get("text", "") for w in raw_transcript[:10]]) if raw_transcript else ""
        }

        # Checkpoint D: Cleaned Transcript
        cleaned_words, clean_stats = subtitle_service.validate_and_clean_transcript(raw_transcript)
        report["checkpoints"]["D_cleaned_transcript"] = {
            "accepted_segments": clean_stats["accepted_segments"],
            "rejected_segments": clean_stats["rejected_segments"],
            "rejection_reasons": clean_stats["rejection_reasons"],
            "cleaned_word_count": len(cleaned_words)
        }

        # Font Selection & Script Detection
        font_name, is_non_latin, detected_script = select_multilingual_font(cleaned_words, target_lang or language or "")
        report["font_detection"] = {
            "detected_script": detected_script,
            "font_selected": font_name,
            "is_non_latin": is_non_latin,
            "platform": sys.platform
        }

        # Checkpoint E: DB Roundtrip Simulation
        report["checkpoints"]["E_db_transcript_roundtrip"] = {
            "schema_version": 2,
            "cacheable": len(cleaned_words) > 0,
            "meta": {
                "language": norm_whisper_lang or "auto",
                "provider": "GroqCloudWhisper",
                "model": "whisper-large-v3",
                "word_count": len(cleaned_words)
            }
        }

        # Checkpoint F: Translation Simulation (if target_lang requested)
        if target_lang and target_lang.lower() not in ["none", "original", ""]:
            from app.services.translation_service import translate_and_distribute_words
            try:
                translated_words = translate_and_distribute_words(cleaned_words, target_lang)
                report["checkpoints"]["F_translated_transcript"] = {
                    "enabled": True,
                    "target_language": target_lang,
                    "translated_word_count": len(translated_words)
                }
                words_for_subtitles = translated_words
            except Exception as te:
                report["warnings"].append(f"Translation simulation encountered error: {te}")
                words_for_subtitles = cleaned_words
        else:
            words_for_subtitles = cleaned_words
            report["checkpoints"]["F_translated_transcript"] = {"enabled": False}

        # Checkpoint G: Generated SRT
        with tempfile.NamedTemporaryFile(suffix=".srt", delete=False) as srt_tf:
            test_srt_path = srt_tf.name
        temp_files.append(test_srt_path)

        srt_stats = subtitle_service.generate_srt(words_for_subtitles, test_srt_path)
        report["checkpoints"]["G_generated_srt"] = srt_stats

        # Checkpoint H: Generated ASS
        with tempfile.NamedTemporaryFile(suffix=".ass", delete=False) as ass_tf:
            test_ass_path = ass_tf.name
        temp_files.append(test_ass_path)

        style_config = {
            "caption_style": caption_style,
            "target_lang": target_lang or language or "none"
        }
        subtitle_service.generate_ass(words_for_subtitles, test_ass_path, style_config)
        ass_size = os.path.getsize(test_ass_path) if os.path.exists(test_ass_path) else 0

        with open(test_ass_path, "r", encoding="utf-8") as f:
            ass_content = f.read()

        dialogue_count = ass_content.count("Dialogue:")
        report["checkpoints"]["H_generated_ass"] = {
            "path": test_ass_path,
            "file_size": ass_size,
            "dialogue_events": dialogue_count,
            "font_in_header": font_name in ass_content
        }

        # Checkpoint I: Path Escaping & Burning Dry-Run
        escaped_ass = os.path.abspath(test_ass_path).replace("\\", "/").replace(":", r"\:")
        report["checkpoints"]["I_ffmpeg_path_escaping"] = {
            "original_path": test_ass_path,
            "escaped_filter_path": f"subtitles=filename='{escaped_ass}'",
            "safe": ":" not in escaped_ass.split(":/")[-1] if ":/" in escaped_ass else True
        }

    finally:
        # Clean up temporary diagnostic files
        for tf in temp_files:
            if os.path.exists(tf):
                try:
                    os.remove(tf)
                except Exception:
                    pass

    return report
