"""
Template Service for Creator Outro & Video Templates.
Manages templates stored in Cloudflare R2 (r2://).
Syncs local Templates/ to Cloudflare R2, provides listing with presigned URLs,
and handles concatenating R2 templates to rendered clips.
"""

import os
import shutil
import logging
import subprocess
import tempfile
from pathlib import Path
from typing import List, Dict, Any, Optional

from app.core.config import settings
from app.services import object_storage

logger = logging.getLogger(__name__)

# Catalog of the 10 pre-made creator outro templates
TEMPLATE_CATALOG = [
    {
        "id": "bw_thanks_watching",
        "title": "Black & White — Thanks For Watching",
        "category": "Outro",
        "description": "Bold monochrome animated outro with punchy outro audio track.",
        "duration": 5.0,
        "source_file": "Black and White Simple Thanks For Watching Mobile Video.mp4",
        "audio_track": None,  # Has native audio in source
        "r2_key": "templates/bw_thanks_watching.mp4",
        "thumb_key": "templates/thumbs/bw_thanks_watching.jpg",
        "badge": "Audio Included",
        "accent": "#ffffff",
    },
    {
        "id": "grunge_yellow_subscribe",
        "title": "Dynamic Grunge Yellow & Black Subscribe",
        "category": "Subscribe",
        "description": "High-octane energetic grunge kinetic typography with dynamic electronic beat.",
        "duration": 8.9,
        "source_file": "Black, White and Yellow Dynamic Grunge Animated Subscribe Outro Mobile Video.mp4",
        "audio_track": "audius_b6f43e513b27.mp3",
        "r2_key": "templates/grunge_yellow_subscribe.mp4",
        "thumb_key": "templates/thumbs/grunge_yellow_subscribe.jpg",
        "badge": "Dynamic Beat",
        "accent": "#facc15",
    },
    {
        "id": "green_black_rough_subscribe",
        "title": "Rough Green & Black Subscribe Card",
        "category": "Subscribe",
        "description": "Urban rough aesthetic with high-visibility channel subscribe prompt & boom bap beat.",
        "duration": 6.0,
        "source_file": "Green and Black Rough Animated Subscribe Outro Mobile Video.mp4",
        "audio_track": "audius_cea9b758011b.mp3",
        "r2_key": "templates/green_black_rough_subscribe.mp4",
        "thumb_key": "templates/thumbs/green_black_rough_subscribe.jpg",
        "badge": "Hip Hop Style",
        "accent": "#22c55e",
    },
    {
        "id": "orange_black_minimalist_cta",
        "title": "Orange & Black Like, Comment & Subscribe",
        "category": "All-in-One",
        "description": "Complete creator engagement screen covering like, comment, share and subscribe with upbeat groove.",
        "duration": 7.5,
        "source_file": "Orange and Black Minimalist Like Comment Share Subscribe Outro Mobile Video.mp4",
        "audio_track": "audius_afe9d6715219.mp3",
        "r2_key": "templates/orange_black_minimalist_cta.mp4",
        "thumb_key": "templates/thumbs/orange_black_minimalist_cta.jpg",
        "badge": "All-in-One Audio",
        "accent": "#f97316",
    },
    {
        "id": "bold_orange_subscribe_now",
        "title": "Bold Orange Subscribe Alert",
        "category": "Subscribe",
        "description": "Punchy animated subscribe button and notification bell icon with energetic pop beat.",
        "duration": 5.0,
        "source_file": "Black, White and Orange Bold Simple Subscribe Now Mobile Video.gif",
        "audio_track": "audius_976a16228445.mp3",
        "r2_key": "templates/bold_orange_subscribe_now.mp4",
        "thumb_key": "templates/thumbs/bold_orange_subscribe_now.jpg",
        "badge": "Pop Beat CTA",
        "accent": "#ea580c",
    },
    {
        "id": "bw_simple_modern_profile",
        "title": "Modern Black & White Profile Outro",
        "category": "Profile Outro",
        "description": "Sleek minimal animation focusing on creator identity and profile follow with lo-fi groove.",
        "duration": 6.6,
        "source_file": "Black and White Simple Modern Animated Profile Outro Mobile Video.mp4",
        "audio_track": "audius_2a4ef1462e1a.mp3",
        "r2_key": "templates/bw_simple_modern_profile.mp4",
        "thumb_key": "templates/thumbs/bw_simple_modern_profile.jpg",
        "badge": "Lo-Fi Modern",
        "accent": "#e2e8f0",
    },
    {
        "id": "simple_animated_profile",
        "title": "Clean Animated Profile Outro",
        "category": "Profile Outro",
        "description": "Smooth vector animations directing viewers to follow and subscribe with acoustic chill.",
        "duration": 7.5,
        "source_file": "Simple Animated Profile Outro Mobile Video.mp4",
        "audio_track": "audius_7080bc07cf13.mp3",
        "r2_key": "templates/simple_animated_profile.mp4",
        "thumb_key": "templates/thumbs/simple_animated_profile.jpg",
        "badge": "Chill Acoustic",
        "accent": "#38bdf8",
    },
    {
        "id": "red_black_white_thanks",
        "title": "Red, Black & White Animated Outro",
        "category": "Outro",
        "description": "Dynamic 3-tone graphic outro screen with punchy rhythmic outro sound.",
        "duration": 5.0,
        "source_file": "Red Black and White Simple Thanks For Watching Mobile Video.mp4",
        "audio_track": "audius_28f3d817d62a.mp3",
        "r2_key": "templates/red_black_white_thanks.mp4",
        "thumb_key": "templates/thumbs/red_black_white_thanks.jpg",
        "badge": "Punchy Sound",
        "accent": "#ef4444",
    },
    {
        "id": "red_white_thank_you",
        "title": "Red & White Minimal Thank You",
        "category": "Outro",
        "description": "Crisp red and white farewell outro card with energetic outro beat.",
        "duration": 3.0,
        "source_file": "Red and White Simple Thank You for Watching Mobile Video.mp4",
        "audio_track": "audius_967ef2eb3463.mp3",
        "r2_key": "templates/red_white_thank_you.mp4",
        "thumb_key": "templates/thumbs/red_white_thank_you.jpg",
        "badge": "Fast Beat 3s",
        "accent": "#dc2626",
    },
    {
        "id": "beige_phone_mockup_story",
        "title": "Beige Minimalist Phone Mockup Story",
        "category": "Social Story",
        "description": "Clean Instagram-style phone mockup post with aesthetic chill soundtrack.",
        "duration": 5.0,
        "source_file": "Beige Minimalist Phone Mockup Like Post On Social Media Instagram Story.png",
        "audio_track": "audius_c00f0c4675b9.mp3",
        "r2_key": "templates/beige_phone_mockup_story.mp4",
        "thumb_key": "templates/thumbs/beige_phone_mockup_story.jpg",
        "badge": "Chill Sound",
        "accent": "#d97706",
    },
]


class TemplateService:
    def __init__(self):
        self._synced = False

    def get_templates_dir(self) -> Optional[Path]:
        """Locates the local Templates directory in project root."""
        possible = [
            Path(__file__).resolve().parent.parent.parent.parent / "Templates",
            Path(os.getcwd()) / "Templates",
            Path(os.getcwd()).parent / "Templates",
        ]
        for p in possible:
            if p.is_dir():
                return p
        return None

    def _resolve_audio_track(self, audio_track_name: Optional[str]) -> Optional[str]:
        """Resolves an audio track from assets/music_cache for outro templates."""
        backend_dir = Path(__file__).resolve().parent.parent.parent
        cache_dir = backend_dir / "assets" / "music_cache"
        if audio_track_name:
            candidate = cache_dir / audio_track_name
            if candidate.is_file():
                return str(candidate)
        # Fallback to any valid mp3 in music_cache if specific file not found
        if cache_dir.is_dir():
            for f in cache_dir.glob("*.mp3"):
                if f.is_file() and f.stat().st_size > 20000:
                    return str(f)
        return None

    def _object_exists_in_r2(self, client, bucket: str, key: str) -> bool:
        """Checks if a key already exists in Cloudflare R2 bucket."""
        try:
            client.head_object(Bucket=bucket, Key=key)
            return True
        except Exception:
            return False

    def sync_templates_to_r2(self, force: bool = False) -> Dict[str, Any]:
        """
        Uploads and standardizes templates from local Templates/ to Cloudflare R2.
        Ensures each template is stored as an optimized 1080x1920 30fps MP4 with stereo audio.
        Attaches high-energy outro music tracks to silent templates so they are never blank.
        Also creates and uploads a thumbnail JPEG for fast frontend gallery rendering.
        """
        if not object_storage.enabled():
            logger.warning("Object storage (Cloudflare R2) is not enabled; cannot sync templates.")
            return {"status": "error", "message": "Object storage not enabled"}

        templates_dir = self.get_templates_dir()
        if not templates_dir or not templates_dir.exists():
            logger.warning("Local Templates/ directory not found.")
            return {"status": "error", "message": "Templates directory not found"}

        provider = object_storage._provider()
        if provider != "r2":
            logger.warning(f"Current storage provider is {provider}, expected r2.")

        endpoint, credentials = object_storage._r2_values()
        bucket = credentials[1]
        client = object_storage._client()

        results = []
        temp_dir = tempfile.mkdtemp(prefix="harvest_tmpl_sync_")

        try:
            for item in TEMPLATE_CATALOG:
                tmpl_id = item["id"]
                source_name = item["source_file"]
                r2_key = item["r2_key"]
                thumb_key = item["thumb_key"]
                source_path = templates_dir / source_name

                if not source_path.exists():
                    logger.warning(f"Source file {source_name} not found in {templates_dir}")
                    continue

                r2_video_path = f"{provider}://{bucket}/{r2_key}"
                r2_thumb_path = f"{provider}://{bucket}/{thumb_key}"

                video_exists = not force and self._object_exists_in_r2(client, bucket, r2_key)
                thumb_exists = not force and self._object_exists_in_r2(client, bucket, thumb_key)

                if video_exists and thumb_exists:
                    results.append({"id": tmpl_id, "status": "already_synced", "path": r2_video_path})
                    continue

                logger.info(f"Processing and syncing template '{tmpl_id}' to Cloudflare R2 ({r2_key})...")
                local_mp4 = os.path.join(temp_dir, f"{tmpl_id}.mp4")
                local_thumb = os.path.join(temp_dir, f"{tmpl_id}_thumb.jpg")

                # 1. Standardize / convert source to clean 1080x1920 30fps MP4 with stereo audio
                is_image = source_name.lower().endswith((".png", ".jpg", ".jpeg"))
                is_gif = source_name.lower().endswith(".gif")
                dur = float(item.get("duration", 5.0))
                fade_st = max(0.2, dur - 0.5)
                audio_track_file = self._resolve_audio_track(item.get("audio_track"))

                if is_image:
                    # Video from static image with synced outro audio
                    if audio_track_file:
                        cmd = [
                            "ffmpeg", "-y", "-loglevel", "error",
                            "-loop", "1", "-t", f"{dur:.2f}", "-i", str(source_path),
                            "-ss", "5.0", "-t", f"{dur:.2f}", "-i", str(audio_track_file),
                            "-filter_complex", (
                                f"[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v];"
                                f"[1:a]afade=t=in:ss=0:d=0.2,afade=t=out:st={fade_st:.2f}:d=0.5,volume=0.85[a]"
                            ),
                            "-map", "[v]", "-map", "[a]",
                            "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-r", "30",
                            "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
                            "-movflags", "+faststart",
                            "-shortest",
                            local_mp4
                        ]
                    else:
                        harmonic_filter = (
                            f"[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v];"
                            f"sine=frequency=523.25:duration={dur:.2f},volume=0.2[s1];"
                            f"sine=frequency=659.25:duration={dur:.2f},volume=0.2[s2];"
                            f"sine=frequency=783.99:duration={dur:.2f},volume=0.2[s3];"
                            f"[s1][s2][s3]amix=inputs=3,afade=t=out:st={fade_st:.2f}:d=0.5[a]"
                        )
                        cmd = [
                            "ffmpeg", "-y", "-loglevel", "error",
                            "-loop", "1", "-t", f"{dur:.2f}", "-i", str(source_path),
                            "-f", "lavfi", "-t", f"{dur:.2f}", "-i", "anullsrc=r=44100:cl=stereo",
                            "-filter_complex", harmonic_filter,
                            "-map", "[v]", "-map", "[a]",
                            "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-r", "30",
                            "-c:a", "aac", "-b:a", "128k",
                            "-movflags", "+faststart",
                            "-shortest",
                            local_mp4
                        ]
                elif is_gif:
                    # Video from animated GIF with synced outro audio
                    if audio_track_file:
                        cmd = [
                            "ffmpeg", "-y", "-loglevel", "error",
                            "-i", str(source_path),
                            "-ss", "5.0", "-t", f"{dur:.2f}", "-i", str(audio_track_file),
                            "-filter_complex", (
                                f"[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v];"
                                f"[1:a]afade=t=in:ss=0:d=0.2,afade=t=out:st={fade_st:.2f}:d=0.5,volume=0.85[a]"
                            ),
                            "-map", "[v]", "-map", "[a]",
                            "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-r", "30",
                            "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
                            "-movflags", "+faststart",
                            "-shortest",
                            local_mp4
                        ]
                    else:
                        harmonic_filter = (
                            f"[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v];"
                            f"sine=frequency=523.25:duration={dur:.2f},volume=0.2[s1];"
                            f"sine=frequency=659.25:duration={dur:.2f},volume=0.2[s2];"
                            f"sine=frequency=783.99:duration={dur:.2f},volume=0.2[s3];"
                            f"[s1][s2][s3]amix=inputs=3,afade=t=out:st={fade_st:.2f}:d=0.5[a]"
                        )
                        cmd = [
                            "ffmpeg", "-y", "-loglevel", "error",
                            "-i", str(source_path),
                            "-f", "lavfi", "-t", f"{dur:.2f}", "-i", "anullsrc=r=44100:cl=stereo",
                            "-filter_complex", harmonic_filter,
                            "-map", "[v]", "-map", "[a]",
                            "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-r", "30",
                            "-c:a", "aac", "-b:a", "128k",
                            "-movflags", "+faststart",
                            "-shortest",
                            local_mp4
                        ]
                else:
                    # MP4 video: check if it already has audio
                    has_audio = False
                    try:
                        probe_cmd = [
                            "ffprobe", "-v", "error", "-select_streams", "a:0",
                            "-show_entries", "stream=codec_type", "-of", "default=noprint_wrappers=1:nokey=1",
                            str(source_path)
                        ]
                        pr = subprocess.run(probe_cmd, capture_output=True, text=True)
                        has_audio = "audio" in pr.stdout.lower()
                    except Exception:
                        has_audio = False

                    if has_audio:
                        # Video already has audio stream (e.g. bw_thanks_watching)
                        cmd = [
                            "ffmpeg", "-y", "-loglevel", "error",
                            "-i", str(source_path),
                            "-filter_complex", (
                                "[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v];"
                                f"[0:a]afade=t=in:ss=0:d=0.2,afade=t=out:st={fade_st:.2f}:d=0.5,volume=0.9[a]"
                            ),
                            "-map", "[v]", "-map", "[a]",
                            "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-r", "30",
                            "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
                            "-movflags", "+faststart",
                            local_mp4
                        ]
                    else:
                        # Video lacks audio: attach designated outro audio track
                        if audio_track_file:
                            cmd = [
                                "ffmpeg", "-y", "-loglevel", "error",
                                "-i", str(source_path),
                                "-ss", "5.0", "-t", f"{dur:.2f}", "-i", str(audio_track_file),
                                "-filter_complex", (
                                    f"[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v];"
                                    f"[1:a]afade=t=in:ss=0:d=0.2,afade=t=out:st={fade_st:.2f}:d=0.5,volume=0.85[a]"
                                ),
                                "-map", "[v]", "-map", "[a]",
                                "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-r", "30",
                                "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
                                "-movflags", "+faststart",
                                "-shortest",
                                local_mp4
                            ]
                        else:
                            harmonic_filter = (
                                f"[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v];"
                                f"sine=frequency=523.25:duration={dur:.2f},volume=0.2[s1];"
                                f"sine=frequency=659.25:duration={dur:.2f},volume=0.2[s2];"
                                f"sine=frequency=783.99:duration={dur:.2f},volume=0.2[s3];"
                                f"[s1][s2][s3]amix=inputs=3,afade=t=out:st={fade_st:.2f}:d=0.5[a]"
                            )
                            cmd = [
                                "ffmpeg", "-y", "-loglevel", "error",
                                "-i", str(source_path),
                                "-f", "lavfi", "-t", f"{dur:.2f}", "-i", "anullsrc=r=44100:cl=stereo",
                                "-filter_complex", harmonic_filter,
                                "-map", "[v]", "-map", "[a]",
                                "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-r", "30",
                                "-c:a", "aac", "-b:a", "128k",
                                "-movflags", "+faststart",
                                "-shortest",
                                local_mp4
                            ]

                run_res = subprocess.run(cmd, capture_output=True, text=True)
                if run_res.returncode != 0 or not os.path.exists(local_mp4):
                    logger.error(f"FFmpeg failed to standardize {source_name}: {run_res.stderr}")
                    continue

                # 2. Generate Thumbnail JPEG (1 second in)
                thumb_cmd = [
                    "ffmpeg", "-y", "-loglevel", "error",
                    "-ss", "1.0", "-i", local_mp4,
                    "-vframes", "1",
                    "-q:v", "2",
                    local_thumb
                ]
                subprocess.run(thumb_cmd, capture_output=True, text=True)

                # Fallback thumbnail if frame 1 failed
                if not os.path.exists(local_thumb) or os.path.getsize(local_thumb) == 0:
                    thumb_fallback_cmd = [
                        "ffmpeg", "-y", "-loglevel", "error",
                        "-i", local_mp4,
                        "-vframes", "1",
                        "-q:v", "2",
                        local_thumb
                    ]
                    subprocess.run(thumb_fallback_cmd, capture_output=True, text=True)

                # 3. Upload standardized video to Cloudflare R2
                object_storage.upload_file(local_mp4, r2_key, content_type="video/mp4")

                # 4. Upload thumbnail to Cloudflare R2
                if os.path.exists(local_thumb) and os.path.getsize(local_thumb) > 0:
                    object_storage.upload_file(local_thumb, thumb_key, content_type="image/jpeg")

                results.append({"id": tmpl_id, "status": "uploaded", "path": r2_video_path})
                logger.info(f"Successfully uploaded template '{tmpl_id}' to Cloudflare R2: {r2_video_path}")

            self._synced = True
            return {"status": "success", "results": results}

        except Exception as e:
            logger.error(f"Error syncing templates to Cloudflare R2: {e}", exc_info=True)
            return {"status": "error", "error": str(e)}
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    def list_templates(self) -> List[Dict[str, Any]]:
        """
        Returns all templates with signed Cloudflare R2 URLs for streaming & previewing.
        Media is loaded directly from Cloudflare R2, NOT local disk.
        """
        provider = object_storage._provider() or "r2"
        endpoint, credentials = object_storage._r2_values()
        bucket = credentials[1]

        templates = []
        for item in TEMPLATE_CATALOG:
            r2_video_path = f"{provider}://{bucket}/{item['r2_key']}"
            r2_thumb_path = f"{provider}://{bucket}/{item['thumb_key']}"

            video_url = ""
            thumb_url = ""
            try:
                video_url = object_storage.url(r2_video_path)
            except Exception as e:
                logger.debug(f"Could not generate signed video URL for {item['id']}: {e}")

            try:
                thumb_url = object_storage.url(r2_thumb_path)
            except Exception as e:
                logger.debug(f"Could not generate signed thumb URL for {item['id']}: {e}")

            templates.append({
                "id": item["id"],
                "title": item["title"],
                "category": item["category"],
                "description": item["description"],
                "duration": item["duration"],
                "aspect_ratio": "9:16",
                "resolution": "1080x1920",
                "storage_path": r2_video_path,
                "video_url": video_url,
                "thumb_url": thumb_url,
                "badge": item.get("badge", "Outro"),
                "accent": item.get("accent", "#1f6f4a"),
            })
        return templates

    def get_template(self, template_id: str) -> Optional[Dict[str, Any]]:
        """Finds a single template by ID with signed R2 URLs."""
        for t in self.list_templates():
            if t["id"] == template_id:
                return t
        return None

    def append_template_to_video(self, video_path: str, template_id_or_path: str, with_audio: bool = True) -> bool:
        """
        Concatenates an R2-stored template outro to a rendered video.
        Downloads/caches remote R2 template using object_storage.local_path().
        Standardizes concatenation strictly in 1080x1920, 30fps, SAR 1:1, stereo AAC.
        If with_audio=False, appends video visuals only and pads audio with silence so that
        background music or uploaded audio can extend over the entire extended duration.
        """
        if not os.path.exists(video_path):
            logger.error(f"Input video not found: {video_path}")
            return False

        # Determine R2 storage path
        storage_path = template_id_or_path
        if not object_storage.is_remote(storage_path):
            tmpl = self.get_template(template_id_or_path)
            if not tmpl:
                logger.error(f"Template '{template_id_or_path}' not found in catalog")
                return False
            storage_path = tmpl["storage_path"]

        # Fetch local cached copy of R2 object
        try:
            logger.info(f"Resolving R2 template '{storage_path}' to local worker cache...")
            cached_template_file = object_storage.local_path(storage_path)
            if not os.path.exists(cached_template_file):
                logger.error(f"Cached template file does not exist: {cached_template_file}")
                return False
        except Exception as e:
            logger.error(f"Failed to fetch template from R2: {e}", exc_info=True)
            return False

        temp_dir = tempfile.mkdtemp(prefix="harvest_tmpl_concat_")
        merged_path = os.path.join(temp_dir, "merged_output.mp4")

        try:
            # Check audio of input video
            has_input_audio = False
            try:
                probe_cmd = [
                    "ffprobe", "-v", "error", "-select_streams", "a:0",
                    "-show_entries", "stream=codec_type", "-of", "default=noprint_wrappers=1:nokey=1",
                    video_path
                ]
                pr = subprocess.run(probe_cmd, capture_output=True, text=True)
                has_input_audio = "audio" in pr.stdout.lower()
            except Exception:
                has_input_audio = True

            # Check audio of template video
            has_tmpl_audio = False
            try:
                probe_cmd = [
                    "ffprobe", "-v", "error", "-select_streams", "a:0",
                    "-show_entries", "stream=codec_type", "-of", "default=noprint_wrappers=1:nokey=1",
                    cached_template_file
                ]
                pr = subprocess.run(probe_cmd, capture_output=True, text=True)
                has_tmpl_audio = "audio" in pr.stdout.lower()
            except Exception:
                has_tmpl_audio = False

            # Get template duration
            tmpl_dur = 5.0
            try:
                pr_dur = subprocess.run(
                    ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", cached_template_file],
                    capture_output=True, text=True
                )
                tmpl_dur = float(pr_dur.stdout.strip() or 5.0)
            except Exception:
                tmpl_dur = 5.0

            logger.info(f"Concatenating video (audio={has_input_audio}) + R2 template (audio={has_tmpl_audio}, with_audio={with_audio}, dur={tmpl_dur}s)")

            # IF with_audio is False: User is using BG music or uploaded audio.
            # We extend the video and append silence for the template portion so the bg music covers it.
            if not with_audio:
                if has_input_audio:
                    concat_filter = (
                        "[0:v]fps=30,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v0];"
                        "[1:v]fps=30,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v1];"
                        "[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a0];"
                        "[2:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a1];"
                        "[v0][v1]concat=n=2:v=1:a=0[outv];"
                        "[a0][a1]concat=n=2:v=0:a=1[outa]"
                    )
                    concat_cmd = [
                        "ffmpeg", "-y", "-loglevel", "error",
                        "-i", video_path,
                        "-i", cached_template_file,
                        "-f", "lavfi", "-t", f"{tmpl_dur:.2f}", "-i", "anullsrc=r=44100:cl=stereo",
                        "-filter_complex", concat_filter,
                        "-map", "[outv]",
                        "-map", "[outa]",
                        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                        "-c:a", "aac", "-b:a", "128k",
                        "-movflags", "+faststart",
                        merged_path
                    ]
                else:
                    concat_filter = (
                        "[0:v]fps=30,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v0];"
                        "[1:v]fps=30,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v1];"
                        "[v0][v1]concat=n=2:v=1:a=0[outv]"
                    )
                    concat_cmd = [
                        "ffmpeg", "-y", "-loglevel", "error",
                        "-i", video_path,
                        "-i", cached_template_file,
                        "-filter_complex", concat_filter,
                        "-map", "[outv]",
                        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                        "-movflags", "+faststart",
                        merged_path
                    ]
            # ELSE with_audio is True: User is using Original Audio.
            # We preserve and play the template's dedicated audio track during the outro!
            elif has_input_audio and has_tmpl_audio:
                concat_filter = (
                    "[0:v]fps=30,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v0];"
                    "[1:v]fps=30,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v1];"
                    "[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a0];"
                    "[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a1];"
                    "[v0][a0][v1][a1]concat=n=2:v=1:a=1[outv][outa]"
                )
                concat_cmd = [
                    "ffmpeg", "-y", "-loglevel", "error",
                    "-i", video_path,
                    "-i", cached_template_file,
                    "-filter_complex", concat_filter,
                    "-map", "[outv]",
                    "-map", "[outa]",
                    "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                    "-c:a", "aac", "-b:a", "128k",
                    "-movflags", "+faststart",
                    merged_path
                ]
            elif has_input_audio and not has_tmpl_audio:
                # In case template lacks audio, mix upbeat outro audio instead of silence
                fallback_audio = self._resolve_audio_track("audius_afe9d6715219.mp3")
                if fallback_audio and os.path.exists(fallback_audio):
                    concat_filter = (
                        "[0:v]fps=30,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v0];"
                        "[1:v]fps=30,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v1];"
                        "[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a0];"
                        "[2:a]afade=t=in:ss=0:d=0.2,afade=t=out:st=4.5:d=0.5,volume=0.85,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a1];"
                        "[v0][a0][v1][a1]concat=n=2:v=1:a=1[outv][outa]"
                    )
                    concat_cmd = [
                        "ffmpeg", "-y", "-loglevel", "error",
                        "-i", video_path,
                        "-i", cached_template_file,
                        "-ss", "5.0", "-i", fallback_audio,
                        "-filter_complex", concat_filter,
                        "-map", "[outv]",
                        "-map", "[outa]",
                        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                        "-c:a", "aac", "-b:a", "128k",
                        "-movflags", "+faststart",
                        merged_path
                    ]
                else:
                    concat_filter = (
                        "[0:v]fps=30,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v0];"
                        "[1:v]fps=30,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v1];"
                        "[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a0];"
                        "[2:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a1];"
                        "[v0][a0][v1][a1]concat=n=2:v=1:a=1[outv][outa]"
                    )
                    concat_cmd = [
                        "ffmpeg", "-y", "-loglevel", "error",
                        "-i", video_path,
                        "-i", cached_template_file,
                        "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
                        "-filter_complex", concat_filter,
                        "-map", "[outv]",
                        "-map", "[outa]",
                        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                        "-c:a", "aac", "-b:a", "128k",
                        "-movflags", "+faststart",
                        merged_path
                    ]
            else:
                concat_filter = (
                    "[0:v]fps=30,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v0];"
                    "[1:v]fps=30,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v1];"
                    "[v0][v1]concat=n=2:v=1:a=0[outv]"
                )
                concat_cmd = [
                    "ffmpeg", "-y", "-loglevel", "error",
                    "-i", video_path,
                    "-i", cached_template_file,
                    "-filter_complex", concat_filter,
                    "-map", "[outv]",
                    "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                    "-movflags", "+faststart",
                    merged_path
                ]

            res = subprocess.run(concat_cmd, capture_output=True, text=True)
            if res.returncode != 0:
                logger.error(f"FFmpeg template concat error: {res.stderr}")
                return False

            if os.path.exists(merged_path) and os.path.getsize(merged_path) > 1000:
                shutil.move(merged_path, video_path)
                logger.info(f"Successfully appended R2 template '{template_id_or_path}' to {video_path}")
                return True
            return False

        except Exception as e:
            logger.error(f"Error appending template to video: {e}", exc_info=True)
            return False
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)


template_service = TemplateService()
