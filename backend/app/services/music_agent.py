import json
import logging
import os
import subprocess
import urllib.request
import urllib.parse
import hashlib
from typing import Dict, List, Optional
from app.services.llm_client import safe_chat_completion, parse_json_robust

logger = logging.getLogger(__name__)

# Base cache directory for dynamically fetched Music API tracks
_THIS_DIR = os.path.dirname(__file__)
_BACKEND_DIR = os.path.abspath(os.path.join(_THIS_DIR, "..", ".."))
_MUSIC_CACHE_DIR = os.path.join(_BACKEND_DIR, "assets", "music_cache")
os.makedirs(_MUSIC_CACHE_DIR, exist_ok=True)

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"


def _has_audio_stream(video_path: str) -> bool:
    """Check if the video container contains at least one audio stream."""
    try:
        cmd = [
            "ffprobe", "-v", "error",
            "-select_streams", "a:0",
            "-show_entries", "stream=codec_type",
            "-of", "default=noprint_wrappers=1:nokey=1",
            video_path
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        return "audio" in res.stdout.lower()
    except Exception as e:
        logger.warning(f"Failed to probe audio stream for {video_path}: {e}")
        return True


class MusicRecommendationAgent:
    """
    Music Recommendation Agent that dynamically queries online Music APIs (Audius & Jamendo)
    to discover, download, and mix content-based royalty-free songs and BGM soundtracks.
    """

    def __init__(self):
        from app.core.config import settings
        self.api_key = settings.QWEN_API_KEY
        self.client = None

        try:
            from openai import OpenAI
            if self.api_key and self.api_key != "your_openrouter_api_key_here":
                self.client = OpenAI(
                    base_url="https://openrouter.ai/api/v1",
                    api_key=self.api_key,
                )
                self.model = "qwen/qwen-2.5-72b-instruct"
                self.is_openrouter = True
            else:
                self.client = OpenAI(
                    base_url="http://localhost:11434/v1",
                    api_key="ollama",
                )
                self.model = "qwen2.5"
                self.is_openrouter = False
        except ImportError:
            self.model = "qwen2.5"
            self.is_openrouter = False

        self.valid_styles = ["upbeat", "lofi", "cinematic", "suspenseful", "standard", "electronic", "hiphop", "rock", "ambient"]

    def analyze_video(self, transcript: List[Dict], metadata: Dict, topic_hint: str = "") -> Dict:
        """
        Analyzes video transcript, topic, and metadata using AI to determine the ideal music style, mood, and search query.
        """
        formatted_transcript = " ".join([seg.get('text', '') for seg in (transcript or [])[:20]])

        # Fast heuristic mapping if transcript is empty
        if not formatted_transcript and topic_hint:
            t_lower = topic_hint.lower()
            if any(k in t_lower for k in ["game", "gaming", "action", "sport", "energy", "viral", "fun", "montage"]):
                return {"topic": topic_hint, "emotion": "energetic", "style": "upbeat", "search_query": "energetic electronic"}
            elif any(k in t_lower for k in ["cinematic", "epic", "nature", "movie", "drama", "story", "trailer"]):
                return {"topic": topic_hint, "emotion": "cinematic", "style": "cinematic", "search_query": "cinematic soundtrack"}
            elif any(k in t_lower for k in ["chill", "relax", "tech", "coding", "tutorial", "study", "code", "vlog"]):
                return {"topic": topic_hint, "emotion": "relaxed", "style": "lofi", "search_query": "lofi hip hop beat"}
            elif any(k in t_lower for k in ["suspense", "mystery", "dark", "thriller", "horror"]):
                return {"topic": topic_hint, "emotion": "tense", "style": "suspenseful", "search_query": "dark suspense ambient"}

        prompt = f"""You are an expert video music supervisor. Analyze the following video metadata and transcript to recommend background music / song.

Video Duration: {metadata.get('duration', 0)}s
Topic Hint: {topic_hint or 'General Content'}
Transcript Excerpt:
{formatted_transcript or 'No spoken dialogue (visual/action/gameplay video)'}

Output ONLY valid JSON:
{{
  "topic": "Brief 1-3 word description",
  "emotion": "primary emotion",
  "style": "Choose ONE from: [upbeat, lofi, cinematic, suspenseful, standard, electronic, hiphop, ambient]",
  "search_query": "2-3 search keywords for music API (e.g. 'upbeat electronic' or 'lofi chill beat')"
}}"""
        try:
            if self.client is None:
                raise RuntimeError("LLM client not initialized")
            response = safe_chat_completion(
                client=self.client,
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are an AI that outputs raw JSON only."},
                    {"role": "user", "content": prompt}
                ],
                is_openrouter=self.is_openrouter,
                response_format={"type": "json_object"}
            )
            result = parse_json_robust(response.choices[0].message.content)
            if result.get("style") not in self.valid_styles:
                result["style"] = "standard"
            if not result.get("search_query"):
                result["search_query"] = f"{result['style']} music"
            return result
        except Exception as e:
            logger.warning(f"Music analysis via LLM failed (using defaults): {e}")
            fallback_style = "upbeat" if not formatted_transcript else "standard"
            return {
                "topic": topic_hint or "general",
                "emotion": "neutral",
                "style": fallback_style,
                "search_query": f"{fallback_style} music"
            }

    def _fetch_from_audius_api(self, query: str) -> Optional[str]:
        """
        Query Audius Open Music API for royalty-free tracks matching the search query,
        download the audio stream, and cache locally (capped at 15MB).
        """
        from app.core.config import settings

        clean_query = urllib.parse.quote(query)
        cache_key = hashlib.md5(query.lower().encode()).hexdigest()[:12]
        cached_path = os.path.join(_MUSIC_CACHE_DIR, f"audius_{cache_key}.mp3")

        # Check if already cached and valid (> 100KB)
        if os.path.exists(cached_path) and os.path.getsize(cached_path) > 100 * 1024:
            logger.info(f"Using cached Music API track: {cached_path}")
            return cached_path

        app_name = getattr(settings, "AUDIUS_APP_NAME", "HARVEST_AI") or "HARVEST_AI"
        configured_base = getattr(settings, "AUDIUS_API_BASE", "https://api.audius.co") or "https://api.audius.co"

        api_endpoints = [
            configured_base,
            "https://api.audius.co",
            "https://discoveryprovider.audius.co"
        ]
        # Deduplicate while preserving order
        seen = set()
        endpoints = [x for x in api_endpoints if not (x in seen or seen.add(x))]

        for base_url in endpoints:
            try:
                search_url = f"{base_url}/v1/tracks/search?query={clean_query}&app_name={app_name}"
                req = urllib.request.Request(search_url, headers={"User-Agent": USER_AGENT})
                with urllib.request.urlopen(req, timeout=8) as resp:
                    if resp.status != 200:
                        continue
                    data = json.loads(resp.read().decode())
                    tracks = data.get("data", [])
                    if not tracks:
                        continue

                    # Try up to the top 5 tracks in case of dead nodes or 404s
                    for track in tracks[:5]:
                        track_id = track.get("id")
                        if not track_id:
                            continue
                        track_title = track.get("title", "Unknown")
                        logger.info(f"Discovered Music API track from Audius: '{track_title}' (ID: {track_id})")

                        stream_url = f"{base_url}/v1/tracks/{track_id}/stream?app_name=HARVEST_AI"
                        temp_cache = f"{cached_path}.tmp"
                        try:
                            stream_req = urllib.request.Request(stream_url, headers={"User-Agent": USER_AGENT})
                            max_bytes = 15 * 1024 * 1024
                            downloaded = 0
                            with urllib.request.urlopen(stream_req, timeout=12) as stream_resp, open(temp_cache, "wb") as out_f:
                                while downloaded < max_bytes:
                                    chunk = stream_resp.read(64 * 1024)
                                    if not chunk:
                                        break
                                    out_f.write(chunk)
                                    downloaded += len(chunk)

                            if os.path.exists(temp_cache) and os.path.getsize(temp_cache) > 50 * 1024:
                                if os.path.exists(cached_path):
                                    os.remove(cached_path)
                                os.rename(temp_cache, cached_path)
                                logger.info(f"Cached Music API track: {cached_path} ({os.path.getsize(cached_path)} bytes)")
                                return cached_path
                            else:
                                if os.path.exists(temp_cache):
                                    os.remove(temp_cache)
                        except Exception as se:
                            logger.warning(f"Audius stream error for track '{track_title}' (ID: {track_id}): {se}")
                            if os.path.exists(temp_cache):
                                try:
                                    os.remove(temp_cache)
                                except Exception:
                                    pass
                            continue
            except Exception as e:
                logger.warning(f"Audius query error ({base_url}): {e}")
                continue

        return None

    def recommend_music(self, analysis: Dict) -> Optional[str]:
        """
        Fetches a real song/BGM from Music APIs matching the style/topic/query.
        Falls back to style keywords and local cache if online stream fails.
        """
        style = (analysis.get("style") or "upbeat").lower()
        search_query = analysis.get("search_query") or f"{style} beat"

        style_keywords = {
            "upbeat": "upbeat energetic electronic dance",
            "cinematic": "cinematic orchestral epic soundtrack",
            "lofi": "lofi hip hop chill study beat",
            "gaming": "gaming electronic future bass synth",
            "hiphop": "hip hop groove beat instrumental",
            "suspenseful": "dark suspense dramatic ambient",
            "ambient": "ambient peaceful chill atmosphere",
            "rock": "rock high energy guitar groove",
            "electronic": "electronic dance future bass",
            "standard": "chill modern groove beat"
        }

        query_to_use = style_keywords.get(style, search_query)

        # 1. Query Music API with specific keywords
        track_path = self._fetch_from_audius_api(query_to_use)
        if track_path:
            return track_path

        # 2. Fallback with simple keyword
        track_path = self._fetch_from_audius_api(style)
        if track_path:
            return track_path

        # 3. Fallback to existing valid cached tracks
        try:
            if os.path.exists(_MUSIC_CACHE_DIR):
                cached_files = [
                    os.path.join(_MUSIC_CACHE_DIR, f)
                    for f in os.listdir(_MUSIC_CACHE_DIR)
                    if f.endswith(".mp3") and os.path.getsize(os.path.join(_MUSIC_CACHE_DIR, f)) > 50 * 1024
                ]
                if cached_files:
                    import random
                    fallback_track = random.choice(cached_files)
                    logger.info(f"Using cached music track as offline fallback: {fallback_track}")
                    return fallback_track
        except Exception as ce:
            logger.warning(f"Error checking local music cache fallback: {ce}")

        logger.warning(f"Could not retrieve music track from Music APIs for: {query_to_use}")
        return None

    def apply_music(self, video_path: str, music_path: str, output_path: str, options: Dict = None):
        """
        Applies API-fetched music or song soundtrack to the video.
        - If video has no audio or no speech detected: adds song at full volume (1.0) as the primary audio track.
        - If video has speech: mixes BGM ducked underneath (~0.16 volume).
        - If music is disabled or unavailable: copies cleanly.
        """
        if options is None:
            options = {}

        if options.get("disable_music", False) or not music_path or not os.path.exists(music_path):
            logger.info("No music track or music disabled. Copying video cleanly.")
            cmd = ["ffmpeg", "-y", "-i", video_path, "-c", "copy", "-movflags", "+faststart", output_path]
            result = subprocess.run(cmd, capture_output=True)
            if result.returncode != 0:
                raise RuntimeError(f"FFmpeg copy failed: {result.stderr.decode(errors='ignore')}")
            return

        final_music = options.get("replace_track", music_path)
        remove_original_audio = options.get("remove_original_audio", False)
        video_has_audio_stream = _has_audio_stream(video_path)
        has_voice = options.get("has_voice", True) if video_has_audio_stream and not remove_original_audio else False

        # If no voice or silent video: play full song at 1.0 volume
        # If voice is present: duck BGM to ~0.16 volume
        target_volume = options.get("volume", 1.0 if not has_voice else 0.16)

        logger.info(
            f"Applying API Music track: '{final_music}' (has_audio_stream={video_has_audio_stream}, "
            f"has_voice={has_voice}, volume={target_volume})"
        )

        if not video_has_audio_stream or remove_original_audio or not has_voice:
            # Full song soundtrack replacement / silent video audio addition
            cmd = [
                "ffmpeg", "-y", "-loglevel", "error",
                "-i", video_path,
                "-stream_loop", "-1", "-i", final_music,
                "-map", "0:v:0",
                "-map", "1:a:0",
                "-c:v", "copy",
                "-c:a", "aac",
                "-b:a", "192k",
                "-shortest",
                "-movflags", "+faststart",
                output_path
            ]
        else:
            # Smooth audio mix: ducked BGM underneath speech
            cmd = [
                "ffmpeg", "-y", "-loglevel", "error",
                "-i", video_path,
                "-stream_loop", "-1", "-i", final_music,
                "-filter_complex",
                f"[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume={target_volume}[music];[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[orig];[orig][music]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[outa]",
                "-map", "0:v:0",
                "-map", "[outa]",
                "-c:v", "copy",
                "-c:a", "aac",
                "-b:a", "192k",
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
            # Fallback: copy video cleanly without failing
            logger.warning("Falling back to copy without music.")
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", video_path, "-c", "copy", "-movflags", "+faststart", output_path], capture_output=True)


music_agent = MusicRecommendationAgent()
