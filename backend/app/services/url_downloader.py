import os
import re
import uuid
import logging
from pathlib import Path
from typing import Dict, Any, Optional
from urllib.parse import urlparse

import yt_dlp
from yt_dlp.utils import DownloadError, ExtractorError

logger = logging.getLogger(__name__)

class UrlDownloadError(Exception):
    """Custom exception for URL download failures."""
    pass

def sanitize_title(title: Optional[str]) -> str:
    if not title:
        return "Imported Video"
    # Remove control characters and trim
    cleaned = re.sub(r'[\\/*?:"<>|]', "", title).strip()
    return cleaned[:120] if cleaned else "Imported Video"

def download_video_from_url(url: str, output_dir: str) -> Dict[str, Any]:
    """
    Downloads a video from a URL (YouTube, Instagram, Facebook, TikTok, Twitter/X, direct link, etc.)
    using yt-dlp, saves it to output_dir or object storage, and returns metadata.
    """
    parsed = urlparse(url.strip())
    if not parsed.scheme or not parsed.netloc:
        raise UrlDownloadError("Invalid URL format. Please provide a valid web address starting with http:// or https://")

    os.makedirs(output_dir, exist_ok=True)
    unique_id = str(uuid.uuid4())
    temp_template = os.path.join(output_dir, f"{unique_id}.%(ext)s")

    ydl_opts = {
        # Prefer 1080p or below MP4 with audio for fast processing & broad compatibility
        "format": "bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4][height<=1080]/best[height<=1080]/best",
        "outtmpl": temp_template,
        "merge_output_format": "mp4",
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 45,
        "retries": 10,
        "fragment_retries": 10,
        "http_chunk_size": 10485760,  # 10MB chunking prevents YouTube 403 throttling
        "max_filesize": 2 * 1024 * 1024 * 1024,  # 2 GB max
        # Do not allow arbitrary local file protocols for security
        "allowed_extractors": ["default"],
        # YouTube client fallback: use android and ios clients to bypass web client SABR/403 blocks
        "extractor_args": {
            "youtube": {
                "player_client": ["android", "ios"]
            }
        },
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            logger.info(f"Extracting video metadata for URL: {url}")
            try:
                info = ydl.extract_info(url, download=True)
            except DownloadError as de:
                logger.warning(f"yt-dlp DownloadError for {url}: {de}")
                msg = str(de)
                if "Private video" in msg or "Sign in" in msg or "login" in msg.lower():
                    raise UrlDownloadError("This video is private or requires a login. Please provide a public video link.")
                if "Video unavailable" in msg or "not found" in msg.lower():
                    raise UrlDownloadError("Video not found or unavailable at the provided link.")
                raise UrlDownloadError(f"Could not download video from link: {msg.split('ERROR:')[-1].strip()}")
            except ExtractorError as ee:
                logger.warning(f"yt-dlp ExtractorError for {url}: {ee}")
                raise UrlDownloadError(f"Unsupported or broken link: {str(ee).split('ERROR:')[-1].strip()}")

            if not info:
                raise UrlDownloadError("Could not retrieve video information from the provided link.")

            raw_title = info.get("title") or "Imported Video"
            title = sanitize_title(raw_title)
            duration = info.get("duration")
            fps = info.get("fps")
            width = info.get("width")
            height = info.get("height")
            resolution = f"{width}x{height}" if width and height else None

            # Determine the downloaded file path
            expected_filename = f"{unique_id}.mp4"
            local_path = os.path.join(output_dir, expected_filename)

            # In case yt-dlp saved as mkv or webm if mp4 merge wasn't possible
            if not os.path.exists(local_path):
                # Search for any file starting with unique_id in output_dir
                candidates = [f for f in os.listdir(output_dir) if f.startswith(unique_id)]
                if candidates:
                    local_path = os.path.join(output_dir, candidates[0])
                else:
                    raise UrlDownloadError("Downloaded file could not be found on the server.")

            # Probe with fast ffprobe if metadata is missing
            try:
                from app.services.video_processor import VideoProcessor
                vp = VideoProcessor()
                meta = vp._get_metadata(Path(local_path))
                if not duration:
                    duration = meta.get("duration")
                if not resolution:
                    resolution = meta.get("resolution")
                if not fps:
                    fps = meta.get("fps")
            except Exception as pe:
                logger.debug(f"ffprobe fallback probe: {pe}")

            # Remote Object Storage upload if enabled
            from app.services import object_storage
            if object_storage.enabled():
                unique_filename = f"{unique_id}.mp4"
                try:
                    with open(local_path, "rb") as f_obj:
                        storage_path = object_storage.upload_fileobj(
                            f_obj, f"originals/{unique_filename}", "video/mp4"
                        )
                    # Use cached / local path
                    final_file_path = object_storage.local_path(storage_path)
                    try:
                        if os.path.abspath(local_path) != os.path.abspath(final_file_path) and os.path.exists(local_path):
                            os.remove(local_path)
                    except Exception:
                        pass
                except Exception as sto_err:
                    logger.error(f"Failed to store imported video in object storage: {sto_err}")
                    raise UrlDownloadError("Failed to store downloaded video in remote storage.")
            else:
                final_file_path = local_path
                storage_path = f"uploads/{os.path.basename(local_path)}"

            return {
                "title": f"{title}.mp4" if not title.lower().endswith(".mp4") else title,
                "storage_path": storage_path,
                "file_path": final_file_path,
                "duration": float(duration) if duration else None,
                "resolution": resolution,
                "fps": float(fps) if fps else None,
            }

    except UrlDownloadError:
        raise
    except Exception as e:
        logger.exception(f"Unexpected error downloading video from {url}: {e}")
        raise UrlDownloadError(f"Unexpected error processing video link: {str(e)}")
