import os
import re
import uuid
import logging
import shutil
import tempfile
from pathlib import Path
from typing import Dict, Any, Optional, List
from urllib.parse import urlparse, parse_qs

import yt_dlp
from yt_dlp.utils import DownloadError, ExtractorError
from app.core.config import settings

logger = logging.getLogger(__name__)


class UrlDownloadError(Exception):
    """Custom exception for URL download failures."""
    pass


def canonicalize_url(url: str) -> str:
    """
    Cleans and canonicalizes video URLs.
    Strips tracking query parameters (si=, feature=, app=, etc.) and
    converts short links (youtu.be/ID or youtube.com/shorts/ID) to canonical watch URLs.
    """
    raw = url.strip()
    try:
        # YouTube Shortlink: youtu.be/<id>?si=...
        if "youtu.be/" in raw:
            match = re.search(r"youtu\.be/([a-zA-Z0-9_-]{11})", raw)
            if match:
                return f"https://www.youtube.com/watch?v={match.group(1)}"

        # YouTube Shorts: youtube.com/shorts/<id>
        if "youtube.com/shorts/" in raw:
            match = re.search(r"youtube\.com/shorts/([a-zA-Z0-9_-]{11})", raw)
            if match:
                return f"https://www.youtube.com/watch?v={match.group(1)}"

        # Standard YouTube Watch URL: strip tracking parameters
        if "youtube.com/watch" in raw:
            parsed = urlparse(raw)
            qs = parse_qs(parsed.query)
            v = qs.get("v")
            if v and v[0]:
                return f"https://www.youtube.com/watch?v={v[0]}"
    except Exception as e:
        logger.debug(f"URL canonicalization error: {e}")

    return raw


def sanitize_title(title: Optional[str]) -> str:
    if not title:
        return "Imported Video"
    cleaned = re.sub(r'[\\/*?:"<>|]', "", title).strip()
    return cleaned[:120] if cleaned else "Imported Video"


def _resolve_cookiefile() -> Optional[str]:
    """
    Finds or creates a cookie file from settings, environment variables, or local files.
    Supports Netscape cookies format text directly via YOUTUBE_COOKIES_CONTENT.
    """
    # 1. Direct path setting / env var
    for candidate in [
        getattr(settings, "YOUTUBE_COOKIES_PATH", None),
        os.getenv("YOUTUBE_COOKIES_PATH"),
        os.getenv("YOUTUBE_COOKIE_PATH"),
        os.getenv("YOUTUBE_COOKIE_FILE"),
    ]:
        if candidate and os.path.isfile(candidate):
            logger.info(f"Using YouTube cookie file from: {candidate}")
            return candidate

    # 2. Raw cookie content passed via env var (ideal for cloud/Docker deployments)
    content = getattr(settings, "YOUTUBE_COOKIES_CONTENT", None) or os.getenv("YOUTUBE_COOKIES_CONTENT") or os.getenv("YOUTUBE_COOKIE_DATA")
    if content and content.strip():
        try:
            raw_text = content.strip()
            # Handle base64 encoded format
            if raw_text.startswith("base64:"):
                import base64
                raw_text = base64.b64decode(raw_text[7:]).decode("utf-8", errors="ignore")
            # Handle escaped newlines from single-line environment variable inputs
            elif "\\n" in raw_text and "\n" not in raw_text:
                raw_text = raw_text.replace("\\n", "\n").replace("\\r", "\r")

            temp_cookie = tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, encoding="utf-8")
            temp_cookie.write(raw_text)
            temp_cookie.flush()
            temp_cookie.close()
            logger.info("Successfully loaded YouTube cookies from YOUTUBE_COOKIES_CONTENT environment variable")
            return temp_cookie.name
        except Exception as e:
            logger.warning(f"Could not write temporary cookie file from YOUTUBE_COOKIES_CONTENT: {e}")

    # 3. Local cookies.txt in workspace or backend
    for local_path in [
        os.path.join(os.getcwd(), "cookies.txt"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "cookies.txt"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "cookies.txt"),
        "/app/cookies.txt",
    ]:
        if os.path.isfile(local_path):
            logger.info(f"Using local cookies.txt found at: {local_path}")
            return local_path

    return None


def _resolve_proxy() -> Optional[str]:
    return (
        getattr(settings, "YOUTUBE_PROXY", None)
        or os.getenv("YOUTUBE_PROXY")
        or os.getenv("HTTP_PROXY")
        or os.getenv("HTTPS_PROXY")
    )


def _get_js_runtimes() -> Dict[str, Any]:
    js_runtimes = {}
    for rt in ["node", "deno", "bun"]:
        if shutil.which(rt):
            js_runtimes[rt] = {}
            break
    return js_runtimes


def _build_ydl_opts(
    temp_template: str,
    extractor_args: Optional[Dict[str, Any]] = None,
    cookie_file: Optional[str] = None,
    proxy: Optional[str] = None,
) -> Dict[str, Any]:
    opts: Dict[str, Any] = {
        # Prefer 1080p or below MP4 with audio; fallback to best mp4 or best available
        "format": "bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4][height<=1080]/bestvideo+bestaudio/best[ext=mp4]/best",
        "outtmpl": temp_template,
        "merge_output_format": "mp4",
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "cachedir": False,
        "geo_bypass": True,
        "nocheckcertificate": True,
        "check_formats": False,
        "socket_timeout": 45,
        "retries": 10,
        "fragment_retries": 10,
        "http_chunk_size": 10485760,  # 10MB chunking prevents YouTube 403 throttling
        "max_filesize": 2 * 1024 * 1024 * 1024,  # 2 GB max
        "allowed_extractors": ["default"],
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
        },
    }

    # Enable JS runtime if available to solve YouTube challenges
    js_runtimes = _get_js_runtimes()
    if js_runtimes:
        opts["js_runtimes"] = js_runtimes

    # Pass cookie file if available
    if cookie_file and os.path.isfile(cookie_file):
        opts["cookiefile"] = cookie_file

    # Pass proxy if configured
    if proxy and proxy.strip():
        opts["proxy"] = proxy.strip()

    # Pass extractor args (e.g. for client fallback)
    if extractor_args:
        opts["extractor_args"] = extractor_args

    return opts


def download_video_from_url(url: str, output_dir: str) -> Dict[str, Any]:
    """
    Downloads a video from a URL (YouTube, Instagram, Facebook, TikTok, Twitter/X, direct link, etc.)
    using yt-dlp, saves it to output_dir or object storage, and returns metadata.
    Includes multi-strategy fallbacks for YouTube and cloud/datacenter IP support.
    """
    raw_url = url.strip()
    parsed = urlparse(raw_url)
    if not parsed.scheme or not parsed.netloc:
        raise UrlDownloadError("Invalid URL format. Please provide a valid web address starting with http:// or https://")

    cleaned_url = canonicalize_url(raw_url)
    is_youtube = ("youtube.com" in cleaned_url) or ("youtu.be" in cleaned_url)

    os.makedirs(output_dir, exist_ok=True)
    unique_id = str(uuid.uuid4())
    temp_template = os.path.join(output_dir, f"{unique_id}.%(ext)s")

    cookie_file = _resolve_cookiefile()
    proxy = _resolve_proxy()

    # Define extraction strategies (prioritizing clients that bypass datacenter IP blocks)
    if is_youtube:
        strategies: List[Dict[str, Any]] = [
            # Strategy 1: Android + Web + TV multi-client negotiation (highest success rate on cloud/datacenter IPs)
            {
                "name": "android_web_tv",
                "extractor_args": {"youtube": {"player_client": ["android", "web", "tv"]}},
            },
            # Strategy 2: TV & Embedded TV (bypasses bot challenges and web player response)
            {
                "name": "tv_embedded",
                "extractor_args": {"youtube": {"player_client": ["tv", "tv_embedded", "web_creator"]}},
            },
            # Strategy 3: Mobile Web & Android Creator
            {
                "name": "mweb_android",
                "extractor_args": {"youtube": {"player_client": ["mweb", "android_creator", "ios"]}},
            },
            # Strategy 4: Standard default extraction (relies on cookies/proxy if supplied)
            {"name": "default", "extractor_args": None},
        ]
    else:
        strategies = [{"name": "standard", "extractor_args": None}]

    last_error: Optional[Exception] = None
    info: Optional[Dict[str, Any]] = None

    for i, strat in enumerate(strategies):
        strat_name = strat["name"]
        logger.info(f"Attempting video download for {cleaned_url} using strategy '{strat_name}' (attempt {i+1}/{len(strategies)})")
        ydl_opts = _build_ydl_opts(
            temp_template=temp_template,
            extractor_args=strat["extractor_args"],
            cookie_file=cookie_file,
            proxy=proxy,
        )

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(cleaned_url, download=True)
                if info:
                    logger.info(f"Successfully downloaded video with strategy '{strat_name}'")
                    break
        except DownloadError as de:
            last_error = de
            err_msg = str(de)
            logger.warning(f"yt-dlp DownloadError on strategy '{strat_name}' for {cleaned_url}: {err_msg}")
            # If it's a private video or not found, no other strategy will help
            if any(term in err_msg.lower() for term in ["private video", "sign in to view", "video unavailable", "not found"]):
                break
            continue
        except ExtractorError as ee:
            last_error = ee
            logger.warning(f"yt-dlp ExtractorError on strategy '{strat_name}' for {cleaned_url}: {ee}")
            continue
        except Exception as exc:
            last_error = exc
            logger.warning(f"Unexpected error on strategy '{strat_name}': {exc}")
            continue

    if not info:
        msg = str(last_error or "Unknown error")
        logger.error(f"All download strategies failed for {cleaned_url}: {msg}")

        if "private video" in msg.lower() or "requires a login" in msg.lower():
            raise UrlDownloadError("This video is private or requires a login. Please provide a public video link.")
        if "video unavailable" in msg.lower() or "not found" in msg.lower():
            raise UrlDownloadError("Video not found or unavailable at the provided link.")

        # Specific diagnosis for datacenter IP blocking
        if any(term in msg.lower() for term in ["player response", "bot", "sign in", "429", "confirm you're not a bot"]):
            raise UrlDownloadError(
                "YouTube is blocking requests from this server's IP address (common on cloud/datacenter deployments like AWS, Render, or Railway). "
                "To resolve this on your deployed server: "
                "1. Update yt-dlp to latest (pip install -U yt-dlp). "
                "2. Provide YouTube cookies via the YOUTUBE_COOKIES_CONTENT or YOUTUBE_COOKIES_PATH environment variable, or configure YOUTUBE_PROXY."
            )

        raise UrlDownloadError(f"Could not download video from link: {msg.split('ERROR:')[-1].strip()}")

    raw_title = info.get("title") or "Imported Video"
    title = sanitize_title(raw_title)
    duration = info.get("duration")
    fps = info.get("fps")
    width = info.get("width")
    height = info.get("height")
    resolution = f"{width}x{height}" if width and height else None

    # Determine downloaded file path
    expected_filename = f"{unique_id}.mp4"
    local_path = os.path.join(output_dir, expected_filename)

    if not os.path.exists(local_path):
        candidates = [f for f in os.listdir(output_dir) if f.startswith(unique_id)]
        if candidates:
            local_path = os.path.join(output_dir, candidates[0])
        else:
            raise UrlDownloadError("Downloaded file could not be found on the server.")

    # Fallback metadata probe if needed
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
            final_file_path = object_storage.local_path(storage_path)
            try:
                if os.path.abspath(local_path) != os.path.abspath(final_file_path) and os.path.exists(local_path):
                    os.remove(local_path)
            except Exception:
                pass
        except Exception as sto_err:
            logger.warning(f"Could not store imported video in remote object storage ({sto_err}); using local file fallback.")
            final_file_path = local_path
            storage_path = f"uploads/{os.path.basename(local_path)}"
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
