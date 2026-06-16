import json
import logging
import os
import subprocess
from typing import Dict, List

logger = logging.getLogger(__name__)

# Absolute path to the music assets directory
_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
_MUSIC_DIR = os.path.join(_BACKEND_DIR, "assets", "music")

class MusicRecommendationAgent:
    def __init__(self):
        from app.core.config import settings
        self.api_key = settings.QWEN_API_KEY
        self.client = None

        try:
            from openai import OpenAI
            if self.api_key and self.api_key != "your_openrouter_api_key_here":
                logger.info("Initializing MusicRecommendationAgent with OpenRouter...")
                self.client = OpenAI(
                    base_url="https://openrouter.ai/api/v1",
                    api_key=self.api_key,
                )
                self.model = "qwen/qwen-2.5-72b-instruct"
                self.is_openrouter = True
            else:
                logger.info("Initializing MusicRecommendationAgent with local Ollama...")
                self.client = OpenAI(
                    base_url="http://localhost:11434/v1",
                    api_key="ollama",
                )
                self.model = "qwen2.5"
                self.is_openrouter = False
        except ImportError:
            logger.warning("openai package not installed. Music analysis via LLM disabled; apply_music still works via FFmpeg.")
            self.model = "qwen2.5"
            self.is_openrouter = False
        self.valid_styles = ["upbeat", "lofi", "cinematic", "suspenseful", "standard"]

    def analyze_video(self, transcript: List[Dict], metadata: Dict) -> Dict:
        """
        Analyzes transcript and metadata to determine the emotion and topic.
        Returns a fallback if Ollama is unavailable.
        """
        formatted_transcript = " ".join([seg['text'] for seg in transcript[:20]])

        prompt = f"""You are an expert video music supervisor. Analyze the following video metadata and transcript.

Video Duration: {metadata.get('duration')}s
Transcript Excerpt:
{formatted_transcript}

Output ONLY valid JSON:
{{
  "topic": "Brief 1-3 word description",
  "emotion": "primary emotion",
  "style": "Choose ONE from: [upbeat, lofi, cinematic, suspenseful, standard]"
}}"""
        try:
            if self.client is None:
                raise RuntimeError("LLM client not initialized (openai not installed)")
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are an AI that outputs raw JSON only."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"}
            )
            result = json.loads(response.choices[0].message.content)
            if result.get("style") not in self.valid_styles:
                result["style"] = "standard"
            return result
        except Exception as e:
            logger.warning(f"Music analysis via Ollama failed (using defaults): {e}")
            return {"topic": "general", "emotion": "neutral", "style": "standard"}

    def recommend_music(self, analysis: Dict) -> str:
        """
        Returns the path to the recommended music track from the local library.
        Returns None if no music files are found (graceful fallback).
        """
        style = analysis.get("style", "standard")
        os.makedirs(_MUSIC_DIR, exist_ok=True)

        # Try the requested style first, then fallback to standard
        for candidate in [f"{style}.mp3", "standard.mp3"]:
            track_path = os.path.join(_MUSIC_DIR, candidate)
            if os.path.exists(track_path):
                return track_path

        logger.warning(f"No music files found in {_MUSIC_DIR}. Music will be skipped.")
        return None  # Signal to skip music

    def apply_music(self, video_path: str, music_path: str, output_path: str, options: Dict = None):
        """
        Applies background music to the video.
        If music_path is None or missing, copies the video without modification.
        """
        if options is None:
            options = {}

        # No music requested or no music file available — just copy the video
        if options.get("disable_music", False) or not music_path or not os.path.exists(music_path):
            if not music_path or not os.path.exists(music_path):
                logger.info("No music track available. Copying video without music.")
            else:
                logger.info("Music disabled by user prompt. Copying video without music.")
            cmd = ["ffmpeg", "-y", "-i", video_path, "-c", "copy", "-movflags", "+faststart", output_path]
            result = subprocess.run(cmd, capture_output=True)
            if result.returncode != 0:
                raise RuntimeError(f"FFmpeg copy failed: {result.stderr.decode()}")
            return

        final_music = options.get("replace_track", music_path)
        has_voice = options.get("has_voice", True)
        target_volume = options.get("volume", 0.15 if has_voice else 1.0)

        logger.info(f"Applying music '{final_music}' at volume {target_volume}")

        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-stream_loop", "-1", "-i", final_music,
            "-filter_complex",
            f"[1:a]volume={target_volume}[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[outa]",
            "-map", "0:v",
            "-map", "[outa]",
            "-c:v", "copy",
            "-c:a", "aac",
            "-movflags", "+faststart",
            output_path
        ]

        try:
            result = subprocess.run(cmd, capture_output=True)
            if result.returncode != 0:
                raise subprocess.CalledProcessError(result.returncode, cmd, result.stderr)
            logger.info(f"Music applied successfully to {output_path}")
        except subprocess.CalledProcessError as e:
            stderr = e.stderr.decode("utf-8", errors="ignore") if e.stderr else ""
            logger.error(f"FFmpeg music mixing error: {stderr}")
            # Fallback: copy without music
            logger.warning("Falling back to copy without music.")
            subprocess.run(["ffmpeg", "-y", "-i", video_path, "-c", "copy", "-movflags", "+faststart", output_path], capture_output=True)

music_agent = MusicRecommendationAgent()
