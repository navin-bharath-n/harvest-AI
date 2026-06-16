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
        # If it's longer than 4 characters, it's a good candidate for highlighting,
        # or if it's not a stop word.
        return True

    def group_words_into_lines(self, words: List[Dict], max_words: int = 4, max_duration: float = 2.0) -> List[Dict]:
        """
        Group word-level timestamps into short phrases for captions (e.g., for Shorts).
        """
        lines = []
        current_line_words = []
        current_start = 0.0

        for i, word_data in enumerate(words):
            word_text = word_data["text"].strip()
            if not word_text:
                continue

            if not current_line_words:
                current_start = word_data["start"]

            current_line_words.append(word_data)
            duration = word_data["end"] - current_start

            # Check if we should break the line
            # Break if max words reached, max duration reached, or end of sentence punctuation
            has_punctuation = any(p in word_text for p in ['.', '!', '?'])
            
            if len(current_line_words) >= max_words or duration >= max_duration or has_punctuation or i == len(words) - 1:
                # Add line
                lines.append({
                    "start": current_start,
                    "end": word_data["end"],
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
        """
        Generate a basic SRT file. 
        """
        lines = self.group_words_into_lines(words)
        
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
        # Ensure centiseconds is bounded
        centisecs = min(99, max(0, centisecs))
        return f"{hours}:{minutes:02d}:{secs:02d}.{centisecs:02d}"

    def _color_to_ass(self, hex_color: str) -> str:
        """Convert #RRGGBB to ASS color &HBBGGRR&"""
        hex_color = hex_color.lstrip("#")
        if len(hex_color) == 6:
            r, g, b = hex_color[0:2], hex_color[2:4], hex_color[4:6]
            return f"&H00{b}{g}{r}&"
        return "&H00FFFFFF&" # Default white

    def generate_ass(self, words: List[Dict], output_path: str, style_config: Dict = None):
        """
        Generate an ASS file with karaoke (word-by-word) highlighting and specific keyword colors.
        """
        if style_config is None:
            style_config = {}

        # Resolve predefined caption styles from prompt_editing_agent
        caption_style_preset = style_config.get("caption_style", "standard")
        
        if caption_style_preset == "energetic":
            style_config["font_name"] = style_config.get("font_name", "Impact")
            style_config["font_size"] = style_config.get("font_size", 84)
            style_config["outline_size"] = style_config.get("outline_size", 6)
            style_config["highlight_color"] = style_config.get("highlight_color", "#FFD700") # Gold
        elif caption_style_preset == "minimalist":
            style_config["font_name"] = style_config.get("font_name", "Arial")
            style_config["font_size"] = style_config.get("font_size", 48)
            style_config["outline_size"] = style_config.get("outline_size", 2)
            style_config["highlight_color"] = style_config.get("highlight_color", "#FFFFFF")
        else: # standard
            style_config["font_name"] = style_config.get("font_name", "Arial Black")
            style_config["font_size"] = style_config.get("font_size", 72)
            style_config["outline_size"] = style_config.get("outline_size", 5)
            style_config["highlight_color"] = style_config.get("highlight_color", "#00FF00") # Green

        # Defaults for styling

        font_name = style_config.get("font_name", "Arial Black")
        font_size = style_config.get("font_size", 72)
        primary_color = self._color_to_ass(style_config.get("primary_color", "#FFFFFF"))
        highlight_color = self._color_to_ass(style_config.get("highlight_color", "#00FF00")) # Green for highlight
        outline_color = self._color_to_ass(style_config.get("outline_color", "#000000"))
        back_color = self._color_to_ass(style_config.get("back_color", "#000000"))
        bold = "-1" if style_config.get("bold", True) else "0"
        italic = "-1" if style_config.get("italic", False) else "0"
        alignment = style_config.get("alignment", 2) # 2 is bottom-center
        margin_v = style_config.get("margin_v", 280) # Margin from bottom to avoid UI elements
        outline_size = style_config.get("outline_size", 5)
        shadow_size = style_config.get("shadow_size", 1)

        resolution_x = style_config.get("resolution_x", 1080)
        resolution_y = style_config.get("resolution_y", 1920)

        header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {resolution_x}
PlayResY: {resolution_y}
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font_name},{font_size},{primary_color},&H000000FF&,{outline_color},{back_color},{bold},{italic},0,0,100,100,0,0,1,{outline_size},{shadow_size},{alignment},10,10,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
        lines = self.group_words_into_lines(words)

        with open(output_path, "w", encoding="utf-8") as f:
            f.write(header)
            
            for line in lines:
                start_str = self._format_time_ass(line["start"])
                end_str = self._format_time_ass(line["end"])
                
                ass_text = ""
                # Calculate karaoke tags
                for i, word in enumerate(line["words"]):
                    word_duration = word["end"] - word["start"]
                    # ASS duration is in centiseconds (1/100th of a second)
                    duration_cs = int(round(word_duration * 100))
                    
                    # Highlight important words
                    text_content = word["text"].strip()
                    is_important = self._is_important_word(text_content)
                    
                    if is_important:
                        # Color tag {\c&H...&} text {\c} to reset
                        colored_text = f"{{\\c{highlight_color}}}{text_content}{{\\c}}"
                    else:
                        colored_text = text_content
                        
                    # Prepend space if not the first word
                    prefix_space = " " if i > 0 else ""
                        
                    # Karaoke effect: {\k<duration>}
                    # Using \kf for fill effect or \k for simple highlight
                    ass_text += f"{prefix_space}{{\\k{duration_cs}}}{colored_text}"

                # Event line
                event_line = f"Dialogue: 0,{start_str},{end_str},Default,,0,0,0,,{ass_text}\n"
                f.write(event_line)

        logger.info(f"Generated ASS file at {output_path}")

    def burn_subtitles(self, video_path: str, subtitle_path: str, output_path: str):
        """
        Burn ASS or SRT subtitles into video using FFmpeg.
        Uses a temp copy in the current directory to avoid Windows path escaping issues.
        """
        import shutil
        import uuid

        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file not found: {video_path}")
        if not os.path.exists(subtitle_path):
            raise FileNotFoundError(f"Subtitle file not found: {subtitle_path}")

        # Copy subtitle to a flat temp filename in the same dir as the output
        # This sidesteps all Windows drive-letter path escaping issues in FFmpeg filters
        ext = os.path.splitext(subtitle_path)[1]
        temp_sub_name = f"_tmp_sub_{uuid.uuid4().hex[:8]}{ext}"
        temp_sub_path = os.path.join(os.path.dirname(os.path.abspath(output_path)), temp_sub_name)
        shutil.copy2(subtitle_path, temp_sub_path)

        # Use relative path if possible to avoid Windows drive-letter colon issues in FFmpeg filters
        try:
            safe_sub_path = os.path.relpath(temp_sub_path).replace("\\", "/")
        except ValueError:
            # Fallback to absolute path with colon escaped (e.g. E\:/path)
            safe_sub_path = temp_sub_path.replace("\\", "/")
            if ":" in safe_sub_path:
                drive, rest = safe_sub_path.split(":", 1)
                safe_sub_path = f"{drive}\\:{rest}"

        cmd = [
            "ffmpeg",
            "-y",
            "-i", video_path,
            "-vf", f"subtitles='{safe_sub_path}'",
            "-c:a", "copy",
            output_path
        ]

        logger.info(f"Burning subtitles from path: {safe_sub_path}")
        try:
            result = subprocess.run(cmd, capture_output=True)
            if result.returncode != 0:
                raise subprocess.CalledProcessError(result.returncode, cmd, result.stderr)
            logger.info(f"Successfully burned subtitles to {output_path}")
        except subprocess.CalledProcessError as e:
            stderr = e.stderr.decode("utf-8", errors="ignore") if e.stderr else ""
            logger.error(f"FFmpeg subtitle burning error: {stderr}")
            raise RuntimeError(f"Failed to burn subtitles: {stderr}")
        finally:
            # Always clean up temp subtitle copy
            if os.path.exists(temp_sub_path):
                os.remove(temp_sub_path)

subtitle_service = SubtitleService()

