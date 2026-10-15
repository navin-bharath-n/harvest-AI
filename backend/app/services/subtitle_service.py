import os
import subprocess
import logging
import re
import math
import unicodedata
from typing import List, Dict

logger = logging.getLogger(__name__)

STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "but", "by",
    "for", "if", "in", "into", "is", "it",
    "no", "not", "of", "on", "or", "such",
    "that", "the", "their", "then", "there", "these",
    "they", "this", "to", "was", "will", "with",
    "i", "you", "he", "she", "we", "me", "my", "your", "so",
    "do", "can", "have", "has", "had", "what", "where", "when", "why", "how"
}


def _normalize_word_for_dedup(text: str) -> str:
    """
    Normalizes word tokens for duplicate detection across all languages.
    Keeps all Unicode letters (L*), marks (M* - vowel signs/virama in Tamil/Indic), and numbers (N*).
    Strips only punctuation, symbols, and formatting whitespace.
    Preserves distinctions like 'பாடி' vs 'படி' or 'கல்' vs 'கால்'.
    """
    if not text:
        return ""
    norm = unicodedata.normalize("NFC", str(text).casefold().strip())
    return "".join(c for c in norm if unicodedata.category(c)[0] in ("L", "M", "N"))


MULTILINGUAL_SENTENCE_ENDINGS = (
    # Western / Latin / Cyrillic
    ".", "!", "?", ";", "…",
    # Indic danda and double danda
    "।", "॥",
    # CJK (Chinese, Japanese)
    "。", "！", "？", "；",
    # Arabic / Urdu / Persian
    "؟", "۔", "؛",
    # Greek
    "·", ";"
)


def select_multilingual_font(words: List[Dict], target_lang: str = "") -> tuple:
    """
    Detects the dominant script across transcript words or requested language,
    and returns (font_name, is_non_latin, detected_script) with multi-platform coverage:
      - Windows: Nirmala UI (Indic), Segoe UI (Arabic/Greek), Microsoft YaHei (Chinese),
                 Meiryo (Japanese), Malgun Gothic (Korean), Arial Black (Latin).
      - Linux / Docker: Noto Sans Tamil, Noto Sans Devanagari, Noto Sans Telugu,
                        Noto Sans Kannada, Noto Sans Malayalam, Noto Sans Bengali,
                        Noto Sans Gujarati, Noto Sans Gurmukhi, Noto Sans Arabic,
                        Noto Sans CJK SC, Noto Sans CJK JP, Noto Sans CJK KR,
                        DejaVu Sans (Latin/Cyrillic).
    """
    tl = (target_lang or "").strip().lower()

    # Gather sample text
    sample_text = " ".join([str(w.get("text", "") or w.get("word", "")) for w in (words[:60] if words else [])])

    # 1. Tamil (U+0B80 - U+0BFF)
    if any(0x0B80 <= ord(c) <= 0x0BFF for c in sample_text) or tl in ["ta", "tamil", "ta-in", "ta-colloquial", "ta-tanglish"]:
        return ("Nirmala UI" if os.name == "nt" else "Noto Sans Tamil"), True, "tamil"

    # 2. Devanagari (Hindi, Marathi, Nepali: U+0900 - U+097F)
    if any(0x0900 <= ord(c) <= 0x097F for c in sample_text) or tl in ["hi", "hindi", "hi-in", "mr", "marathi", "ne"]:
        return ("Nirmala UI" if os.name == "nt" else "Noto Sans Devanagari"), True, "devanagari"

    # 3. Telugu (U+0C00 - U+0C7F)
    if any(0x0C00 <= ord(c) <= 0x0C7F for c in sample_text) or tl in ["te", "telugu", "te-in"]:
        return ("Nirmala UI" if os.name == "nt" else "Noto Sans Telugu"), True, "telugu"

    # 4. Kannada (U+0C80 - U+0CFF)
    if any(0x0C80 <= ord(c) <= 0x0CFF for c in sample_text) or tl in ["kn", "kannada", "kn-in"]:
        return ("Nirmala UI" if os.name == "nt" else "Noto Sans Kannada"), True, "kannada"

    # 5. Malayalam (U+0D00 - U+0D7F)
    if any(0x0D00 <= ord(c) <= 0x0D7F for c in sample_text) or tl in ["ml", "malayalam", "ml-in"]:
        return ("Nirmala UI" if os.name == "nt" else "Noto Sans Malayalam"), True, "malayalam"

    # 6. Bengali / Assamese (U+0980 - U+09FF)
    if any(0x0980 <= ord(c) <= 0x09FF for c in sample_text) or tl in ["bn", "bengali", "bn-in", "as"]:
        return ("Nirmala UI" if os.name == "nt" else "Noto Sans Bengali"), True, "bengali"

    # 7. Gujarati (U+0A80 - U+0AFF)
    if any(0x0A80 <= ord(c) <= 0x0AFF for c in sample_text) or tl in ["gu", "gujarati", "gu-in"]:
        return ("Nirmala UI" if os.name == "nt" else "Noto Sans Gujarati"), True, "gujarati"

    # 8. Gurmukhi / Punjabi (U+0A00 - U+0A7F)
    if any(0x0A00 <= ord(c) <= 0x0A7F for c in sample_text) or tl in ["pa", "punjabi", "pa-in"]:
        return ("Nirmala UI" if os.name == "nt" else "Noto Sans Gurmukhi"), True, "gurmukhi"

    # 9. Arabic / Urdu / Persian (U+0600 - U+06FF, U+0750 - U+077F, U+08A0 - U+08FF)
    if any(0x0600 <= ord(c) <= 0x06FF or 0x0750 <= ord(c) <= 0x077F or 0x08A0 <= ord(c) <= 0x08FF for c in sample_text) or tl in ["ar", "arabic", "ur", "urdu", "fa", "persian"]:
        return ("Segoe UI" if os.name == "nt" else "Noto Sans Arabic"), True, "arabic"

    # 10. Japanese (Hiragana U+3040 - U+309F, Katakana U+30A0 - U+30FF)
    if any(0x3040 <= ord(c) <= 0x30FF for c in sample_text) or tl in ["ja", "japanese"]:
        return ("Meiryo" if os.name == "nt" else "Noto Sans CJK JP"), True, "japanese"

    # 11. Korean (Hangul U+AC00 - U+D7AF, U+1100 - U+11FF)
    if any(0xAC00 <= ord(c) <= 0xD7AF or 0x1100 <= ord(c) <= 0x11FF for c in sample_text) or tl in ["ko", "korean"]:
        return ("Malgun Gothic" if os.name == "nt" else "Noto Sans CJK KR"), True, "korean"

    # 12. Chinese (CJK Unified Ideographs U+4E00 - U+9FFF, U+3400 - U+4DBF)
    if any(0x4E00 <= ord(c) <= 0x9FFF or 0x3400 <= ord(c) <= 0x4DBF for c in sample_text) or tl in ["zh", "zh-cn", "chinese"]:
        return ("Microsoft YaHei" if os.name == "nt" else "Noto Sans CJK SC"), True, "chinese"

    # 13. Cyrillic (Russian, Ukrainian: U+0400 - U+04FF)
    if any(0x0400 <= ord(c) <= 0x04FF for c in sample_text) or tl in ["ru", "russian", "uk"]:
        return ("Arial Black" if os.name == "nt" else "DejaVu Sans"), False, "cyrillic"

    # 14. Greek (U+0370 - U+03FF)
    if any(0x0370 <= ord(c) <= 0x03FF for c in sample_text) or tl in ["el", "greek"]:
        return ("Segoe UI" if os.name == "nt" else "Noto Sans"), False, "greek"

    # 15. Other non-Latin fallback
    has_non_latin = any(ord(c) > 0x024F and not c.isspace() and c not in ".,!?-'\"-" for c in sample_text)
    if has_non_latin:
        return ("Segoe UI" if os.name == "nt" else "Noto Sans"), True, "other_non_latin"

    return "Arial Black", False, "latin"


class SubtitleService:
    def __init__(self):
        pass

    @staticmethod
    def escape_ass_text(text: str) -> str:
        """
        Safely escapes text for ASS dialogue lines.
        Replaces ASS override tag delimiters { and } with fullwidth safe braces,
        normalizes newlines to ASS \\N, and ensures NFC Unicode canonical form and Tamil combining mark healing.
        """
        if not text:
            return ""
        from app.services.transcription_service import sanitize_multilingual_text
        t = sanitize_multilingual_text(str(text))
        t = t.replace("\r\n", "\\N").replace("\r", "\\N").replace("\n", "\\N")
        t = t.replace("{", "｛").replace("}", "｝")
        return t.strip()

    def _is_important_word(self, word: str) -> bool:
        clean_word = "".join(
            c for c in str(word)
            if c.isalpha() or unicodedata.category(c) in ("Mn", "Mc")
        ).lower()
        if not clean_word:
            return False
        return clean_word not in STOP_WORDS

    def validate_and_clean_transcript(self, words: List[Dict]) -> tuple:
        """
        Validates, filters invalid segments, and cleans transcript words.
        Explicitly tracks and records counts of accepted and rejected segments.
        Rejects:
          - Non-dict items
          - Empty text or whitespace-only text
          - Missing start or end timestamps
          - Inverted timestamps (end < start)
          - Entirely negative timestamps (end <= 0)
          - Non-finite numbers (NaN, Inf)
          - Hallucinated timestamp/chapter patterns (e.g. 019-006, 00:00)
        Clamps partial negative start (start < 0, end > 0) to 0.0.
        Unicode-aware: Never rejects valid Tamil or multilingual text with combining marks.
        Returns:
          (cleaned_words, stats_dict)
        """
        stats = {
            "total_segments": len(words or []),
            "accepted_segments": 0,
            "rejected_segments": 0,
            "rejection_reasons": {
                "non_dict": 0,
                "empty_text": 0,
                "missing_timestamps": 0,
                "inverted_timestamps": 0,
                "negative_interval": 0,
                "non_finite": 0,
                "noise_filtered": 0,
            }
        }

        from app.services.transcription_service import sanitize_multilingual_text

        parsed = []
        for item in words or []:
            if not isinstance(item, dict):
                stats["rejected_segments"] += 1
                stats["rejection_reasons"]["non_dict"] += 1
                continue

            raw_text = str(item.get("text", "")).strip()
            text = re.sub(r"\s+", " ", raw_text).strip()
            text = sanitize_multilingual_text(text)
            if not text:
                stats["rejected_segments"] += 1
                stats["rejection_reasons"]["empty_text"] += 1
                continue

            raw_start = item.get("start")
            raw_end = item.get("end")
            if raw_start is None or raw_end is None:
                stats["rejected_segments"] += 1
                stats["rejection_reasons"]["missing_timestamps"] += 1
                continue

            try:
                start = float(raw_start)
                end = float(raw_end)
            except (TypeError, ValueError):
                stats["rejected_segments"] += 1
                stats["rejection_reasons"]["missing_timestamps"] += 1
                continue

            if not math.isfinite(start) or not math.isfinite(end):
                stats["rejected_segments"] += 1
                stats["rejection_reasons"]["non_finite"] += 1
                continue

            # Inverted timestamps: end earlier than start is invalid
            if end < start:
                stats["rejected_segments"] += 1
                stats["rejection_reasons"]["inverted_timestamps"] += 1
                continue

            # Entirely negative interval (before video start)
            if end <= 0:
                stats["rejected_segments"] += 1
                stats["rejection_reasons"]["negative_interval"] += 1
                continue

            # Clamp partial negative start to 0.0
            start = max(0.0, start)
            end = max(start + 0.05, end)

            # Check if text contains valid human language characters (letters, marks, or numbers)
            norm_check = _normalize_word_for_dedup(text)
            if not norm_check:
                stats["rejected_segments"] += 1
                stats["rejection_reasons"]["empty_text"] += 1
                continue

            # Filter out non-speech sound brackets, music notes, timestamp hallucinations, chapter codes
            if (
                re.match(r"^\[.*\]$|^\(.*\)$|^[♪♫♬]+$", text)
                or re.match(r"^\d{1,4}[-:\.]\d{1,4}(?:[-:\.]\d{1,4})?$", text)
                or re.match(r"^#\d+$", text)
            ):
                stats["rejected_segments"] += 1
                stats["rejection_reasons"]["noise_filtered"] += 1
                continue

            sub_words = [w for w in text.split(" ") if w.strip()]
            if len(sub_words) > 1:
                weights = [max(1, len(sw)) for sw in sub_words]
                total_w = sum(weights) or 1
                total_dur = max(0.1, end - start)
                curr_t = start
                for sw, w in zip(sub_words, weights):
                    sw_dur = (w / total_w) * total_dur
                    sw_start = round(curr_t, 2)
                    sw_end = round(curr_t + sw_dur, 2)
                    curr_t += sw_dur
                    clean_sw = sw.strip()
                    if clean_sw:
                        parsed.append({**item, "start": sw_start, "end": max(sw_start + 0.05, sw_end), "text": clean_sw})
            else:
                clean_text = text.strip()
                actual_end = max(start + 0.05, end)
                parsed.append({**item, "start": start, "end": actual_end, "text": clean_text})

        cleaned = []
        for entry in sorted(parsed, key=lambda x: (x["start"], x["end"])):
            normalized = _normalize_word_for_dedup(entry["text"])
            if cleaned:
                prev = cleaned[-1]
                prev_norm = _normalize_word_for_dedup(prev["text"])
                is_dup = (
                    normalized == prev_norm
                    and entry["start"] <= prev["end"] + 0.03
                    and entry["end"] <= prev["end"] + 0.08
                    and abs(entry["start"] - prev["start"]) <= 0.12
                )
                if is_dup:
                    continue
            cleaned.append(entry)

        stats["accepted_segments"] = len(cleaned)
        sample_accepted = " ".join([w["text"] for w in cleaned[:8]]) if cleaned else ""
        logger.info(
            f"[Checkpoint D - Cleaned Transcript] (Checkpoint B Validation) Total={stats['total_segments']} "
            f"Accepted={stats['accepted_segments']} Rejected={stats['rejected_segments']} "
            f"Sample='{sample_accepted}'"
        )
        return cleaned, stats

    def clean_transcript_words(self, words: List[Dict]) -> List[Dict]:
        """
        Normalize timestamps and remove duplicates.
        CRITICAL: We do NOT cap word durations - that destroys timing for grouping
        and causes captions to flash and vanish mid-sentence.
        We only fix broken entries (zero/negative duration).
        """
        cleaned, _ = self.validate_and_clean_transcript(words)
        return cleaned

    def group_words_into_lines(self, words: List[Dict], max_words: int = 5, max_duration: float = 3.5) -> List[Dict]:
        """
        Group word-level timestamps into caption lines.
        Splits at sentence-ending punctuation, large silences (>0.8s), or word/time limits.
        Post-processes lines to fill small gaps so captions never flash off.
        """
        words = self.clean_transcript_words(words)
        lines = []
        current_line_words = []
        current_start = 0.0

        for i, word_data in enumerate(words):
            word_text = word_data.get("text", "").strip()
            if not word_text:
                continue

            if not current_line_words:
                current_start = float(word_data.get("start", 0.0))

            large_gap = False
            if current_line_words:
                last_word = current_line_words[-1]
                gap = float(word_data.get("start", 0.0)) - float(last_word.get("end", 0.0))
                if gap > 0.8:
                    large_gap = True

            if large_gap and current_line_words:
                lines.append({
                    "start": current_start,
                    "end": float(current_line_words[-1].get("end", current_start)),
                    "words": current_line_words
                })
                current_line_words = []
                current_start = float(word_data.get("start", 0.0))

            current_line_words.append(word_data)
            duration = float(word_data.get("end", 0.0)) - current_start

            has_sentence_end = any(word_text.endswith(p) or p in word_text for p in MULTILINGUAL_SENTENCE_ENDINGS)
            reached_limits = len(current_line_words) >= max_words or duration >= max_duration

            if has_sentence_end or reached_limits or i == len(words) - 1:
                lines.append({
                    "start": current_start,
                    "end": float(word_data.get("end", current_start)),
                    "words": current_line_words
                })
                current_line_words = []

        # Extend each line end to fill small gaps to the next line
        # This guarantees continuous on-screen coverage with no blank frames
        for i, line in enumerate(lines):
            if i < len(lines) - 1:
                next_start = lines[i + 1]["start"]
                gap = next_start - line["end"]
                if 0 < gap < 0.8:
                    line["end"] = next_start

        return lines

    def _format_time_srt(self, seconds: float) -> str:
        total_millis = max(0, int(round(seconds * 1000)))
        hours = total_millis // 3600000
        minutes = (total_millis % 3600000) // 60000
        secs = (total_millis % 60000) // 1000
        millis = total_millis % 1000
        return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"

    def generate_srt(self, words: List[Dict], output_path: str) -> Dict:
        """
        Generate a complete, sequential, valid SRT subtitle file from transcript words.
        Ensures UTF-8 encoding and validates that output file exists.
        Returns a dictionary of generated subtitle statistics.
        """
        lines = self.group_words_into_lines(words, max_words=6, max_duration=4.0)
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            for i, line in enumerate(lines, 1):
                start_str = self._format_time_srt(line["start"])
                end_str = self._format_time_srt(line["end"])
                text = " ".join([
                    unicodedata.normalize("NFC", w["text"].strip())
                    for w in line["words"] if w.get("text")
                ])
                f.write(f"{i}\n{start_str} --> {end_str}\n{text}\n\n")

        file_size = os.path.getsize(output_path) if os.path.exists(output_path) else 0
        stats = {
            "caption_count": len(lines),
            "file_size": file_size,
            "first_timestamp": lines[0]["start"] if lines else 0.0,
            "last_timestamp": lines[-1]["end"] if lines else 0.0,
            "output_path": output_path,
        }
        logger.info(
            f"[Checkpoint G - Generated SRT] (Checkpoint E) Path={output_path} Captions={len(lines)} "
            f"FileSize={file_size}B FirstTS={stats['first_timestamp']}s LastTS={stats['last_timestamp']}s"
        )
        return stats

    def _format_time_ass(self, seconds: float) -> str:
        total_cs = max(0, int(round(seconds * 100)))
        hours = total_cs // 360000
        minutes = (total_cs % 360000) // 6000
        secs = (total_cs % 6000) // 100
        cs = total_cs % 100
        return f"{hours}:{minutes:02d}:{secs:02d}.{cs:02d}"

    def _color_to_ass(self, hex_color: str) -> str:
        hex_color = hex_color.lstrip("#")
        if len(hex_color) == 6:
            r, g, b = hex_color[0:2], hex_color[2:4], hex_color[4:6]
            return f"&H00{b}{g}{r}&"
        return "&H00FFFFFF&"

    def _build_word_timing_map(self, line_words: List[Dict], line_start: float, line_end: float) -> List[Dict]:
        """
        Compute each word's active display window:
          word[i] active from word[i].start until word[i+1].start
          last word active from its start until line_end
        This ensures ZERO gaps between consecutive caption frames.
        """
        timing = []
        for i, w in enumerate(line_words):
            w_start = max(line_start, float(w.get("start", line_start)))
            if i < len(line_words) - 1:
                next_w_start = float(line_words[i + 1].get("start", line_end))
                w_end = max(w_start + 0.05, next_w_start)
            else:
                w_end = max(w_start + 0.05, line_end)
            timing.append({"start": w_start, "end": w_end, "word": w})
        return timing

    def generate_ass(self, words: List[Dict], output_path: str, style_config: Dict = None):
        """
        Generate a modern ASS file with smooth animated captions.
        KEY FIX: Every caption line stays on screen for its FULL duration.
        Each dialogue event spans from word_start to next_word_start (ZERO gaps).
        Only the highlighted word changes per frame - the rest of the line is always visible.
        This completely eliminates flashing/disappearing caption issues.
        Styles: pop/energetic, karaoke, minimalist, boxed, neon, standard
        """
        if style_config is None:
            style_config = {}

        if not words:
            with open(output_path, "w", encoding="utf-8") as f:
                f.write("[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n\n[Events]\n")
            return

        target_lang = style_config.get("target_lang", "").lower()
        default_font, is_non_latin, detected_script = select_multilingual_font(words, target_lang)

        caption_preset = style_config.get("caption_style", "pop").lower()
        if caption_preset == "energetic":
            caption_preset = "pop"

        font_name = style_config.get("font_name")
        font_size = style_config.get("font_size")
        primary_color_hex = style_config.get("primary_color") or "#FFFFFF"
        highlight_color_hex = style_config.get("highlight_color")
        outline_size = style_config.get("outline_size")
        shadow_size = style_config.get("shadow_size", 1)
        alignment = style_config.get("alignment", 2)
        margin_v = style_config.get("margin_v", 320)
        border_style = 1

        if caption_preset == "pop":
            font_name = font_name or (default_font if is_non_latin else "Arial Black")
            font_size = font_size or 76
            highlight_color_hex = highlight_color_hex or "#FFD700"
            outline_size = outline_size if outline_size is not None else 6
        elif caption_preset == "karaoke":
            font_name = font_name or (default_font if is_non_latin else "Impact")
            font_size = font_size or 80
            highlight_color_hex = highlight_color_hex or "#00FF66"
            outline_size = outline_size if outline_size is not None else 6
        elif caption_preset == "minimalist":
            font_name = font_name or (default_font if is_non_latin else "Arial")
            font_size = font_size or 52
            highlight_color_hex = highlight_color_hex or "#38BDF8"
            outline_size = outline_size if outline_size is not None else 3
            shadow_size = 0
        elif caption_preset == "boxed":
            font_name = font_name or (default_font if is_non_latin else "Arial Black")
            font_size = font_size or 64
            highlight_color_hex = highlight_color_hex or "#F59E0B"
            outline_size = outline_size if outline_size is not None else 4
        elif caption_preset == "neon":
            font_name = font_name or (default_font if is_non_latin else "Impact")
            font_size = font_size or 76
            highlight_color_hex = highlight_color_hex or "#00FFFF"
            outline_size = outline_size if outline_size is not None else 7
        else:
            font_name = font_name or default_font
            font_size = font_size or 70
            highlight_color_hex = highlight_color_hex or "#22C55E"
            outline_size = outline_size if outline_size is not None else 5

        if is_non_latin and font_name in ["Arial Black", "Impact", "Arial", "Outfit", "Syne", "standard", None, ""]:
            font_name = default_font

        is_tamil = detected_script == "tamil"
        # Thick outlines and the 120% pop scale crowd Tamil combining marks.
        # Keep explicit user outline settings, but use a lighter Tamil default.
        if is_tamil and style_config.get("outline_size") is None:
            outline_size = min(float(outline_size), 3.0)
        font_bold = 0 if is_tamil else -1
        highlight_scale = 108 if is_tamil else 120
        highlight_outline = outline_size if is_tamil else outline_size + 1
        boxed_highlight_outline = min(6.0, float(outline_size)) if is_tamil else 6

        primary_color = self._color_to_ass(primary_color_hex)
        highlight_color = self._color_to_ass(highlight_color_hex)
        outline_color = self._color_to_ass(style_config.get("outline_color") or "#000000")
        back_color = self._color_to_ass(style_config.get("back_color") or "#000000")
        resolution_x = style_config.get("resolution_x", 1080)
        resolution_y = style_config.get("resolution_y", 1920)

        header = (
            "[Script Info]\n"
            "ScriptType: v4.00+\n"
            f"PlayResX: {resolution_x}\n"
            f"PlayResY: {resolution_y}\n"
            "WrapStyle: 1\n\n"
            "[V4+ Styles]\n"
            "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
            "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, "
            "Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
            f"Style: Default,{font_name},{font_size},{primary_color},{highlight_color},{outline_color},"
            f"{back_color},{font_bold},0,0,0,100,100,0,0,{border_style},{outline_size},{shadow_size},"
            f"{alignment},20,20,{margin_v},1\n\n"
            "[Events]\n"
            "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
        )

        max_words = style_config.get("max_words", 4 if caption_preset in ["pop", "neon", "boxed"] else 5)
        lines = self.group_words_into_lines(words, max_words=max_words, max_duration=3.5)

        with open(output_path, "w", encoding="utf-8") as f:
            f.write(header)

            for line in lines:
                line_words = line["words"]
                if not line_words:
                    continue
                line_start = float(line["start"])
                line_end = float(line["end"])
                word_timing = self._build_word_timing_map(line_words, line_start, line_end)

                if caption_preset == "karaoke":
                    start_str = self._format_time_ass(line_start)
                    end_str = self._format_time_ass(line_end)
                    karaoke_parts = []
                    for wt in word_timing:
                        w = wt["word"]
                        w_dur_cs = max(1, int(round((wt["end"] - wt["start"]) * 100)))
                        clean_w = self.escape_ass_text(w.get("text", ""))
                        if clean_w:
                            karaoke_parts.append(f"{{\\kf{w_dur_cs}}}{clean_w}")
                    text_line = " ".join(karaoke_parts)
                    f.write(f"Dialogue: 0,{start_str},{end_str},Default,,0,0,0,,{{\\fad(60,60)}}{text_line}\n")

                elif caption_preset in ["pop", "standard"]:
                    for idx, wt in enumerate(word_timing):
                        start_str = self._format_time_ass(wt["start"])
                        end_str = self._format_time_ass(wt["end"])
                        rendered_words = []
                        for j, lw in enumerate(line_words):
                            ct = self.escape_ass_text(lw.get("text", ""))
                            if not ct:
                                continue
                            if j == idx:
                                if caption_preset == "pop":
                                    rendered_words.append(
                                        f"{{\\c{highlight_color}\\fscx{highlight_scale}\\fscy{highlight_scale}\\t(0,75,\\fscx100\\fscy100)\\bord{highlight_outline}}}{ct}{{\\rDefault}}"
                                    )
                                else:
                                    rendered_words.append(
                                        f"{{\\c{highlight_color}\\fscx110\\fscy110\\t(0,60,\\fscx100\\fscy100)}}{ct}{{\\rDefault}}"
                                    )
                            else:
                                rendered_words.append(ct)
                        f.write(f"Dialogue: 0,{start_str},{end_str},Default,,0,0,0,,{{\\fad(30,30)}}{' '.join(rendered_words)}\n")

                elif caption_preset == "minimalist":
                    for idx, wt in enumerate(word_timing):
                        start_str = self._format_time_ass(wt["start"])
                        end_str = self._format_time_ass(wt["end"])
                        rendered_words = []
                        for j, lw in enumerate(line_words):
                            ct = self.escape_ass_text(lw.get("text", ""))
                            if not ct:
                                continue
                            if j == idx:
                                rendered_words.append(f"{{\\c{highlight_color}\\b1}}{ct}{{\\b0\\c{primary_color}}}")
                            else:
                                rendered_words.append(ct)
                        f.write(f"Dialogue: 0,{start_str},{end_str},Default,,0,0,0,,{{\\fad(80,80)}}{' '.join(rendered_words)}\n")

                elif caption_preset == "boxed":
                    for idx, wt in enumerate(word_timing):
                        start_str = self._format_time_ass(wt["start"])
                        end_str = self._format_time_ass(wt["end"])
                        rendered_words = []
                        for j, lw in enumerate(line_words):
                            ct = self.escape_ass_text(lw.get("text", ""))
                            if not ct:
                                continue
                            if j == idx:
                                rendered_words.append(
                                    f"{{\\c{highlight_color}\\3c&H00333333&\\bord{boxed_highlight_outline}\\fscx95\\fscy95\\t(0,70,\\fscx100\\fscy100)}}{ct}{{\\rDefault}}"
                                )
                            else:
                                rendered_words.append(ct)
                        f.write(f"Dialogue: 0,{start_str},{end_str},Default,,0,0,0,,{{\\fad(60,60)}}{' '.join(rendered_words)}\n")

                elif caption_preset == "neon":
                    for idx, wt in enumerate(word_timing):
                        start_str = self._format_time_ass(wt["start"])
                        end_str = self._format_time_ass(wt["end"])
                        rendered_words = []
                        for j, lw in enumerate(line_words):
                            ct = self.escape_ass_text(lw.get("text", ""))
                            if not ct:
                                continue
                            if j == idx:
                                rendered_words.append(
                                    f"{{\\c{highlight_color}\\3c{highlight_color}\\blur5\\t(0,90,\\fscx115\\fscy115)\\t(90,180,\\fscx100\\fscy100)}}{ct}{{\\rDefault}}"
                                )
                            else:
                                rendered_words.append(f"{{\\blur2}}{ct}{{\\blur0}}")
                        f.write(f"Dialogue: 0,{start_str},{end_str},Default,,0,0,0,,{{\\fad(60,60)}}{' '.join(rendered_words)}\n")

                else:
                    for idx, wt in enumerate(word_timing):
                        start_str = self._format_time_ass(wt["start"])
                        end_str = self._format_time_ass(wt["end"])
                        rendered_words = []
                        for j, lw in enumerate(line_words):
                            ct = self.escape_ass_text(lw.get("text", ""))
                            if not ct:
                                continue
                            if j == idx:
                                rendered_words.append(
                                    f"{{\\c{highlight_color}\\fscx110\\fscy110\\t(0,60,\\fscx100\\fscy100)}}{ct}{{\\rDefault}}"
                                )
                            else:
                                rendered_words.append(ct)
                        f.write(f"Dialogue: 0,{start_str},{end_str},Default,,0,0,0,,{{\\fad(30,30)}}{' '.join(rendered_words)}\n")

        logger.info(
            f"[Checkpoint H - Generated ASS] (Checkpoint F) Path={output_path} StylePreset={caption_preset} "
            f"FontName='{font_name}' FontSize={font_size} Lines={len(lines)} "
            f"Script={detected_script} IsNonLatin={is_non_latin}"
        )

    def burn_subtitles(self, video_path: str, subtitle_path: str, output_path: str, scale_filter: str = ""):
        """
        Hardcodes ASS subtitles into the video file using GPU hardware acceleration (NVENC)
        when available, or ultra-fast multi-threaded CPU libx264 encoding with 30fps capping.
        """
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file not found: {video_path}")
        if not os.path.exists(subtitle_path):
            raise FileNotFoundError(f"Subtitle file not found: {subtitle_path}")

        escaped_sub_path = os.path.abspath(subtitle_path).replace("\\", "/").replace(":", r"\:")
        video_args = self._get_fast_video_encoding_args()

        vf_parts = []
        if scale_filter:
            vf_parts.append(scale_filter)
        vf_parts.append(f"subtitles=filename='{escaped_sub_path}'")
        vf_str = ",".join(vf_parts)

        cmd = ["ffmpeg", "-y", "-i", video_path, "-vf", vf_str, "-fpsmax", "30",
               *video_args, "-c:a", "copy", "-movflags", "+faststart", output_path]

        logger.info(
            f"[Checkpoint I - Final FFmpeg Output Validation] (Checkpoint G Burn) Video={video_path} "
            f"Subtitle={subtitle_path} Output={output_path} Filter={vf_str}"
        )
        try:
            result = subprocess.run(cmd, capture_output=True)
            if result.returncode != 0:
                if "-c:v" in cmd and "h264_nvenc" in cmd:
                    logger.warning("NVENC encoding encountered issue, retrying with CPU ultrafast...")
                    cpu_cmd = [
                        "ffmpeg", "-y", "-i", video_path, "-vf", vf_str, "-fpsmax", "30",
                        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "22",
                        "-tune", "fastdecode", "-threads", "0", "-pix_fmt", "yuv420p",
                        "-c:a", "copy", "-movflags", "+faststart", output_path
                    ]
                    result = subprocess.run(cpu_cmd, capture_output=True)
                if result.returncode != 0:
                    raise subprocess.CalledProcessError(result.returncode, cmd, result.stderr)
            out_sz = os.path.getsize(output_path) if os.path.exists(output_path) else 0
            logger.info(f"Successfully burned subtitles to {output_path} ({out_sz} bytes)")
        except subprocess.CalledProcessError as e:
            stderr = e.stderr.decode("utf-8", errors="ignore") if e.stderr else ""
            logger.error(f"FFmpeg subtitle burning error: {stderr}")
            raise RuntimeError(f"Failed to burn subtitles: {stderr}")

    @classmethod
    def _get_fast_video_encoding_args(cls):
        """
        Detects if NVIDIA NVENC GPU acceleration is available,
        otherwise falls back to CPU libx264 ultrafast.
        """
        if getattr(cls, "_has_nvenc", None) is None:
            try:
                # NVENC requires minimum 144x144 frame dimension (test with 256x256)
                test_res = subprocess.run(
                    ["ffmpeg", "-f", "lavfi", "-i", "color=c=black:s=256x256:d=0.1", "-c:v", "h264_nvenc", "-f", "null", "-"],
                    capture_output=True, timeout=3
                )
                cls._has_nvenc = (test_res.returncode == 0)
                if cls._has_nvenc:
                    logger.info("NVIDIA GPU NVENC acceleration active for video encoding.")
            except Exception:
                cls._has_nvenc = False
        if cls._has_nvenc:
            return ["-c:v", "h264_nvenc", "-preset", "p4", "-cq", "21", "-pix_fmt", "yuv420p"]
        return ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "22", "-tune", "fastdecode", "-threads", "0", "-pix_fmt", "yuv420p"]


subtitle_service = SubtitleService()
escape_ass_text = SubtitleService.escape_ass_text
