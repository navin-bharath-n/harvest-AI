import os
import subprocess
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)

# Basic English stop words for keyword highlighting
STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "but", "by",
    "for", "if", "in", "into", "is", "it",
    "no", "not", "of", "on", "or", "such",
    "that", "the", "their", "then", "there", "these",
    "they", "this", "to", "was", "will", "with",
    "i", "you", "he", "she", "we", "me", "my", "your", "so",
    "do", "can", "have", "has", "had", "what", "where", "when", "why", "how"
}

class SubtitleService:
    def __init__(self):
        pass

    def _is_important_word(self, word: str) -> bool:
        """Heuristic to determine if a word should be highlighted."""
        clean_word = "".join(c for c in word if c.isalpha()).lower()
        if not clean_word:
            return False
        if clean_word in STOP_WORDS:
            return False
        return True

    def group_words_into_lines(self, words: List[Dict], max_words: int = 5, max_duration: float = 2.5) -> List[Dict]:
        """
        Group word-level timestamps into short, punchy sentence chunks for mobile shorts.
        - Splits primarily at sentence-ending punctuation (. ! ?)
        - Splits at large silences (gaps of > 0.6s between words)
        - Keeps chunks small (3-5 words) for maximum visual impact and clean rendering
        """
        lines = []
        current_line_words = []
        current_start = 0.0

        for i, word_data in enumerate(words):
            word_text = word_data.get("text", "").strip()
            if not word_text:
                continue

            if not current_line_words:
                current_start = float(word_data.get("start", 0.0))

            # Check for a silence gap before adding this word
            large_gap = False
            if current_line_words:
                last_word = current_line_words[-1]
                if float(word_data.get("start", 0.0)) - float(last_word.get("end", 0.0)) > 0.6:
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

            # Break on punctuation or reaching safety limits
            has_sentence_end = any(word_text.endswith(p) or p in word_text for p in ['.', '!', '?'])
            reached_limits = len(current_line_words) >= max_words or duration >= max_duration

            if has_sentence_end or reached_limits or i == len(words) - 1:
                lines.append({
                    "start": current_start,
                    "end": float(word_data.get("end", current_start)),
                    "words": current_line_words
                })
                current_line_words = []

        return lines

    def _format_time_srt(self, seconds: float) -> str:
        """Format seconds into SRT timestamp (HH:MM:SS,mmm)"""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        millis = int(round((seconds - int(seconds)) * 1000))
        return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"

    def generate_srt(self, words: List[Dict], output_path: str):
        """Generate a basic SRT file."""
        lines = self.group_words_into_lines(words, max_words=6, max_duration=3.0)
        with open(output_path, "w", encoding="utf-8") as f:
            for i, line in enumerate(lines, 1):
                start_str = self._format_time_srt(line["start"])
                end_str = self._format_time_srt(line["end"])
                text = " ".join([w["text"].strip() for w in line["words"]])
                f.write(f"{i}\n")
                f.write(f"{start_str} --> {end_str}\n")
                f.write(f"{text}\n\n")
        logger.info(f"Generated SRT file at {output_path}")

    def _format_time_ass(self, seconds: float) -> str:
        """Format seconds into ASS timestamp (H:MM:SS.cs)"""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        centisecs = int(round((seconds - int(seconds)) * 100))
        centisecs = min(99, max(0, centisecs))
        return f"{hours}:{minutes:02d}:{secs:02d}.{centisecs:02d}"

    def _color_to_ass(self, hex_color: str) -> str:
        """Convert #RRGGBB to ASS color &H00BBGGRR&"""
        hex_color = hex_color.lstrip("#")
        if len(hex_color) == 6:
            r, g, b = hex_color[0:2], hex_color[2:4], hex_color[4:6]
            return f"&H00{b}{g}{r}&"
        return "&H00FFFFFF&"  # Default white

    def generate_ass(self, words: List[Dict], output_path: str, style_config: Dict = None):
        """
        Generate a modern ASS file with smooth animated captions.
        Supports 5 distinct smooth animation engines:
          - 'pop' / 'energetic': Word-by-word active bounce pop with vibrant highlight
          - 'karaoke': Smooth left-to-right color wipe synced with speech
          - 'minimalist': Sleek typography with smooth fade in/out and gentle rise
          - 'boxed': Modern pill tag box with entrance zoom
          - 'neon': Glowing border outline with active-word pulse animation
          - 'standard': Clean bold highlight with subtle pop
        """
        if style_config is None:
            style_config = {}

        if not words:
            # Create empty ASS file
            with open(output_path, "w", encoding="utf-8") as f:
                f.write("[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n\n[Events]\n")
            return

        # Detect non-Latin scripts (Tamil, Hindi, Telugu, CJK, etc.)
        is_non_latin = False
        target_lang = style_config.get("target_lang", "").lower()
        if target_lang in ["ta", "ta-colloquial", "hi", "te", "ml", "kn", "mr", "bn", "gu", "pa", "ja", "zh-cn", "ko", "ar"]:
            is_non_latin = True
        else:
            for w in words:
                text_val = w.get("text", "")
                if any(ord(c) > 0x024F and not c.isspace() and c not in ".,!?'-\"" for c in text_val):
                    is_non_latin = True
                    break

        default_font = "Nirmala UI" if is_non_latin else "Arial Black"
        caption_preset = style_config.get("caption_style", "pop").lower()

        # Map legacy style names
        if caption_preset == "energetic":
            caption_preset = "pop"

        # Configure style parameters based on preset
        font_name = style_config.get("font_name")
        font_size = style_config.get("font_size")
        primary_color_hex = style_config.get("primary_color", "#FFFFFF")
        highlight_color_hex = style_config.get("highlight_color")
        outline_size = style_config.get("outline_size")
        shadow_size = style_config.get("shadow_size", 1)
        alignment = style_config.get("alignment", 2)  # 2 is bottom-center
        margin_v = style_config.get("margin_v", 320)  # Safe bottom margin for mobile UI
        border_style = 1  # 1 = outline + shadow, 3 = opaque box

        if caption_preset == "pop":
            font_name = font_name or ("Nirmala UI" if is_non_latin else "Arial Black")
            font_size = font_size or 76
            highlight_color_hex = highlight_color_hex or "#FFD700"  # Bright Gold / Yellow
            outline_size = outline_size if outline_size is not None else 6
        elif caption_preset == "karaoke":
            font_name = font_name or ("Nirmala UI" if is_non_latin else "Impact")
            font_size = font_size or 80
            highlight_color_hex = highlight_color_hex or "#00FF66"  # Vibrant Neon Green
            outline_size = outline_size if outline_size is not None else 6
        elif caption_preset == "minimalist":
            font_name = font_name or ("Nirmala UI" if is_non_latin else "Arial")
            font_size = font_size or 52
            highlight_color_hex = highlight_color_hex or "#38BDF8"  # Sky Blue / Cyan
            outline_size = outline_size if outline_size is not None else 3
            shadow_size = 0
        elif caption_preset == "boxed":
            font_name = font_name or ("Nirmala UI" if is_non_latin else "Arial Black")
            font_size = font_size or 64
            highlight_color_hex = highlight_color_hex or "#F59E0B"  # Amber Orange
            outline_size = outline_size if outline_size is not None else 4
            border_style = 1
        elif caption_preset == "neon":
            font_name = font_name or ("Nirmala UI" if is_non_latin else "Impact")
            font_size = font_size or 76
            highlight_color_hex = highlight_color_hex or "#00FFFF"  # Electric Cyan
            outline_size = outline_size if outline_size is not None else 7
        else:  # standard
            font_name = font_name or default_font
            font_size = font_size or 70
            highlight_color_hex = highlight_color_hex or "#22C55E"  # Emerald Green
            outline_size = outline_size if outline_size is not None else 5

        # Non-Latin font fallback enforcement
        if is_non_latin and font_name in ["Arial Black", "Impact", "Arial", "Outfit", "Syne", "standard", None, ""]:
            font_name = "Nirmala UI"

        primary_color = self._color_to_ass(primary_color_hex)
        highlight_color = self._color_to_ass(highlight_color_hex)
        outline_color = self._color_to_ass(style_config.get("outline_color", "#000000"))
        back_color = self._color_to_ass(style_config.get("back_color", "#000000"))

        resolution_x = style_config.get("resolution_x", 1080)
        resolution_y = style_config.get("resolution_y", 1920)

        header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {resolution_x}
PlayResY: {resolution_y}
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font_name},{font_size},{primary_color},{highlight_color},{outline_color},{back_color},-1,0,0,0,100,100,0,0,{border_style},{outline_size},{shadow_size},{alignment},20,20,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
        max_words = 4 if caption_preset in ["pop", "neon", "boxed"] else 5
        lines = self.group_words_into_lines(words, max_words=max_words, max_duration=2.4)

        with open(output_path, "w", encoding="utf-8") as f:
            f.write(header)

            for line in lines:
                line_words = line["words"]
                if not line_words:
                    continue

                line_start = float(line["start"])
                line_end = float(line["end"])

                # --- 1. KARAOKE STYLE (Smooth Left-to-Right Color Sweep) ---
                if caption_preset == "karaoke":
                    start_str = self._format_time_ass(line_start)
                    end_str = self._format_time_ass(line_end)
                    karaoke_parts = []
                    for w in line_words:
                        w_dur_cs = max(1, int(round((float(w.get("end", 0)) - float(w.get("start", 0))) * 100)))
                        clean_w = w.get("text", "").strip()
                        if clean_w:
                            karaoke_parts.append(f"{{\\kf{w_dur_cs}}}{clean_w}")
                    text_line = " ".join(karaoke_parts)
                    event_line = f"Dialogue: 0,{start_str},{end_str},Default,,0,0,0,,{{\\fad(60,60)}}{text_line}\n"
                    f.write(event_line)

                # --- 2. POP / BOUNCE STYLE (Active Word Pop-up Bounce Animation) ---
                elif caption_preset in ["pop", "standard"]:
                    for i, active_word in enumerate(line_words):
                        w_start = float(active_word.get("start", line_start))
                        w_end = float(active_word.get("end", line_end))
                        w_start = max(line_start, w_start)
                        w_end = min(line_end, max(w_start + 0.1, w_end))

                        if i < len(line_words) - 1:
                            next_start = float(line_words[i + 1].get("start", w_end))
                            if next_start > w_start:
                                w_end = next_start

                        start_str = self._format_time_ass(w_start)
                        end_str = self._format_time_ass(w_end)

                        rendered_words = []
                        for j, w in enumerate(line_words):
                            clean_text = w.get("text", "").strip()
                            if not clean_text:
                                continue
                            if j == i:
                                if caption_preset == "pop":
                                    rendered_words.append(f"{{\\c{highlight_color}\\fscx120\\fscy120\\t(0,75,\\fscx100\\fscy100)\\bord{outline_size + 1}}}{clean_text}{{\\rDefault}}")
                                else:
                                    rendered_words.append(f"{{\\c{highlight_color}\\fscx110\\fscy110\\t(0,60,\\fscx100\\fscy100)}}{clean_text}{{\\rDefault}}")
                            else:
                                rendered_words.append(clean_text)

                        line_str = " ".join(rendered_words)
                        f.write(f"Dialogue: 0,{start_str},{end_str},Default,,0,0,0,,{{\\fad(50,50)}}{line_str}\n")

                # --- 3. CINEMATIC MINIMALIST (Smooth Fade In/Out + Gentle Rise) ---
                elif caption_preset == "minimalist":
                    for i, active_word in enumerate(line_words):
                        w_start = float(active_word.get("start", line_start))
                        w_end = float(active_word.get("end", line_end))
                        w_start = max(line_start, w_start)
                        w_end = min(line_end, max(w_start + 0.1, w_end))
                        if i < len(line_words) - 1:
                            next_start = float(line_words[i + 1].get("start", w_end))
                            if next_start > w_start:
                                w_end = next_start

                        start_str = self._format_time_ass(w_start)
                        end_str = self._format_time_ass(w_end)

                        rendered_words = []
                        for j, w in enumerate(line_words):
                            clean_text = w.get("text", "").strip()
                            if not clean_text:
                                continue
                            if j == i:
                                rendered_words.append(f"{{\\c{highlight_color}\\b1}}{clean_text}{{\\b0\\c{primary_color}}}")
                            else:
                                rendered_words.append(clean_text)

                        line_str = " ".join(rendered_words)
                        f.write(f"Dialogue: 0,{start_str},{end_str},Default,,0,0,0,,{{\\fad(120,120)}}{line_str}\n")

                # --- 4. BOXED PILL STYLE (Pill Tag Highlight with Smooth Entrance Zoom) ---
                elif caption_preset == "boxed":
                    for i, active_word in enumerate(line_words):
                        w_start = float(active_word.get("start", line_start))
                        w_end = float(active_word.get("end", line_end))
                        w_start = max(line_start, w_start)
                        w_end = min(line_end, max(w_start + 0.1, w_end))
                        if i < len(line_words) - 1:
                            next_start = float(line_words[i + 1].get("start", w_end))
                            if next_start > w_start:
                                w_end = next_start

                        start_str = self._format_time_ass(w_start)
                        end_str = self._format_time_ass(w_end)

                        rendered_words = []
                        for j, w in enumerate(line_words):
                            clean_text = w.get("text", "").strip()
                            if not clean_text:
                                continue
                            if j == i:
                                rendered_words.append(f"{{\\c{highlight_color}\\3c&H00333333&\\bord6\\fscx95\\fscy95\\t(0,70,\\fscx100\\fscy100)}}{clean_text}{{\\rDefault}}")
                            else:
                                rendered_words.append(clean_text)

                        line_str = " ".join(rendered_words)
                        f.write(f"Dialogue: 0,{start_str},{end_str},Default,,0,0,0,,{{\\fad(60,60)}}{line_str}\n")

                # --- 5. NEON PULSE STYLE (Neon Glow with Active-Word Scale Pulse) ---
                elif caption_preset == "neon":
                    for i, active_word in enumerate(line_words):
                        w_start = float(active_word.get("start", line_start))
                        w_end = float(active_word.get("end", line_end))
                        w_start = max(line_start, w_start)
                        w_end = min(line_end, max(w_start + 0.1, w_end))
                        if i < len(line_words) - 1:
                            next_start = float(line_words[i + 1].get("start", w_end))
                            if next_start > w_start:
                                w_end = next_start

                        start_str = self._format_time_ass(w_start)
                        end_str = self._format_time_ass(w_end)

                        rendered_words = []
                        for j, w in enumerate(line_words):
                            clean_text = w.get("text", "").strip()
                            if not clean_text:
                                continue
                            if j == i:
                                rendered_words.append(
                                    f"{{\\c{highlight_color}\\3c{highlight_color}\\blur5\\t(0,90,\\fscx115\\fscy115)\\t(90,180,\\fscx100\\fscy100)}}{clean_text}{{\\rDefault}}"
                                )
                            else:
                                rendered_words.append(f"{{\\blur2}}{clean_text}{{\\blur0}}")

                        line_str = " ".join(rendered_words)
                        f.write(f"Dialogue: 0,{start_str},{end_str},Default,,0,0,0,,{{\\fad(60,60)}}{line_str}\n")

        logger.info(f"Successfully generated animated ASS subtitle ({caption_preset}) at {output_path}")

    def burn_subtitles(self, video_path: str, subtitle_path: str, output_path: str):
        """
        Burn ASS or SRT subtitles into video using FFmpeg.
        Uses escaped path for cross-platform and Windows compatibility.
        """
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file not found: {video_path}")
        if not os.path.exists(subtitle_path):
            raise FileNotFoundError(f"Subtitle file not found: {subtitle_path}")

        escaped_sub_path = os.path.abspath(subtitle_path).replace('\\', '/').replace(':', r'\:')

        cmd = [
            "ffmpeg",
            "-y",
            "-i", video_path,
            "-vf", f"subtitles=filename='{escaped_sub_path}'",
            "-c:a", "copy",
            "-movflags", "+faststart",
            output_path
        ]

        logger.info(f"Burning subtitles from path: {subtitle_path}")
        try:
            result = subprocess.run(cmd, capture_output=True)
            if result.returncode != 0:
                raise subprocess.CalledProcessError(result.returncode, cmd, result.stderr)
            logger.info(f"Successfully burned subtitles to {output_path}")
        except subprocess.CalledProcessError as e:
            stderr = e.stderr.decode("utf-8", errors="ignore") if e.stderr else ""
            logger.error(f"FFmpeg subtitle burning error: {stderr}")
            raise RuntimeError(f"Failed to burn subtitles: {stderr}")

subtitle_service = SubtitleService()
