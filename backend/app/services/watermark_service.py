import os
import re
import uuid
import shutil
import logging
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any, Tuple

from app.core.config import settings

logger = logging.getLogger(__name__)


def _resolve_local_file(path_str: str) -> Optional[str]:
    """Resolves local path or downloads from remote object storage if needed."""
    if not path_str:
        return None
    from app.services import object_storage
    if object_storage.is_remote(path_str):
        try:
            return object_storage.local_path(path_str)
        except Exception as e:
            logger.warning(f"Could not resolve remote path {path_str} locally: {e}")
            return None

    if os.path.isabs(path_str) and os.path.exists(path_str):
        return path_str

    candidates = [
        path_str,
        os.path.join(os.getcwd(), path_str),
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), path_str),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None


def probe_video_dimensions(video_path: str) -> Tuple[int, int]:
    """Returns (width, height) of the video using ffprobe, defaulting to 1080x1920."""
    try:
        cmd = [
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height",
            "-of", "csv=s=x:p=0",
            video_path
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=10)
        output = res.stdout.strip()
        if "x" in output:
            parts = output.split("x")
            w, h = int(parts[0]), int(parts[1])
            if w > 0 and h > 0:
                return (w, h)
    except Exception as e:
        logger.warning(f"Failed to probe dimensions for {video_path}: {e}")
    return (1080, 1920)


class WatermarkService:
    @staticmethod
    def apply_branding_to_video(
        input_video_path: str,
        output_video_path: str,
        watermark_path: Optional[str] = None,
        watermark_position: str = "header",
        watermark_scale: float = 0.20,
        watermark_opacity: float = 0.90,
        watermark_mode: str = "always",
        header_image_path: Optional[str] = None,
        header_height: Optional[int] = 160,
        footer_image_path: Optional[str] = None,
        footer_height: Optional[int] = 180,
    ) -> str:
        """
        Overlays header banners, footer banners, and/or channel watermark logos onto a video clip.
        Supports customizable image sizes and 2-second interval visibility toggling.
        """
        local_video = _resolve_local_file(input_video_path)
        if not local_video or not os.path.exists(local_video):
            raise FileNotFoundError(f"Source video not found: {input_video_path}")

        video_w, video_h = probe_video_dimensions(local_video)
        logger.info(f"Applying branding to {local_video} (Dimensions: {video_w}x{video_h})")

        inputs = ["-i", local_video]
        filter_chains = []
        current_stream = "0:v"
        input_idx = 1

        # 1. Header Banner Image
        local_header = _resolve_local_file(header_image_path) if header_image_path else None
        if local_header and os.path.isfile(local_header):
            inputs.extend(["-i", local_header])
            hh = int(header_height or (video_h * 0.10))
            hh = max(40, min(int(video_h * 0.40), hh))
            hh = hh - (hh % 2)  # Ensure even height

            scaled_label = f"h_scale_{input_idx}"
            out_label = f"v_hdr_{input_idx}"
            filter_chains.append(f"[{input_idx}:v]scale={video_w}:{hh}[{scaled_label}]")
            filter_chains.append(f"[{current_stream}][{scaled_label}]overlay=0:0[{out_label}]")
            current_stream = out_label
            input_idx += 1

        # 2. Footer Banner Image
        local_footer = _resolve_local_file(footer_image_path) if footer_image_path else None
        if local_footer and os.path.isfile(local_footer):
            inputs.extend(["-i", local_footer])
            fh = int(footer_height or (video_h * 0.12))
            fh = max(40, min(int(video_h * 0.40), fh))
            fh = fh - (fh % 2)  # Ensure even height

            scaled_label = f"f_scale_{input_idx}"
            out_label = f"v_ftr_{input_idx}"
            filter_chains.append(f"[{input_idx}:v]scale={video_w}:{fh}[{scaled_label}]")
            filter_chains.append(f"[{current_stream}][{scaled_label}]overlay=0:{video_h - fh}[{out_label}]")
            current_stream = out_label
            input_idx += 1

        # 3. Watermark / Channel Logo (e.g., 'nb')
        local_wm = _resolve_local_file(watermark_path) if watermark_path else None
        if local_wm and os.path.isfile(local_wm):
            inputs.extend(["-i", local_wm])
            scale_val = max(0.06, min(0.50, float(watermark_scale or 0.20)))
            wm_w = int(video_w * scale_val)
            wm_w = wm_w - (wm_w % 2)
            opacity_val = max(0.10, min(1.0, float(watermark_opacity or 0.90)))

            scaled_label = f"wm_scale_{input_idx}"
            filter_chains.append(f"[{input_idx}:v]scale={wm_w}:-2,format=rgba,colorchannelmixer=aa={opacity_val}[{scaled_label}]")

            # Enable interval if mode is interval_2s (visible for 2s, hidden for 2s, repeating every 2s)
            enable_expr = ":enable='lt(mod(t,4),2)'" if (watermark_mode == "interval_2s") else ""

            pos = (watermark_position or "header").lower().strip()
            pad_x = max(16, int(video_w * 0.03))
            pad_y = max(16, int(video_h * 0.02))

            if pos == "top-left":
                out_label = f"v_wm_{input_idx}"
                filter_chains.append(f"[{current_stream}][{scaled_label}]overlay={pad_x}:{pad_y}{enable_expr}[{out_label}]")
                current_stream = out_label
            elif pos == "top-right":
                out_label = f"v_wm_{input_idx}"
                filter_chains.append(f"[{current_stream}][{scaled_label}]overlay=W-w-{pad_x}:{pad_y}{enable_expr}[{out_label}]")
                current_stream = out_label
            elif pos == "bottom-left":
                out_label = f"v_wm_{input_idx}"
                filter_chains.append(f"[{current_stream}][{scaled_label}]overlay={pad_x}:H-h-{pad_y}{enable_expr}[{out_label}]")
                current_stream = out_label
            elif pos == "bottom-right":
                out_label = f"v_wm_{input_idx}"
                filter_chains.append(f"[{current_stream}][{scaled_label}]overlay=W-w-{pad_x}:H-h-{pad_y}{enable_expr}[{out_label}]")
                current_stream = out_label
            elif pos in ("footer", "bottom"):
                out_label = f"v_wm_{input_idx}"
                filter_chains.append(f"[{current_stream}][{scaled_label}]overlay=(W-w)/2:H-h-{pad_y}{enable_expr}[{out_label}]")
                current_stream = out_label
            elif pos == "header_and_footer":
                # Watermark displayed at both header and footer
                label_mid = f"v_wm_mid_{input_idx}"
                out_label = f"v_wm_{input_idx}"
                filter_chains.append(f"[{current_stream}][{scaled_label}]overlay=(W-w)/2:{pad_y}{enable_expr}[{label_mid}]")
                filter_chains.append(f"[{label_mid}][{scaled_label}]overlay=(W-w)/2:H-h-{pad_y}{enable_expr}[{out_label}]")
                current_stream = out_label
            else:
                # Default "header" / "top" center
                out_label = f"v_wm_{input_idx}"
                filter_chains.append(f"[{current_stream}][{scaled_label}]overlay=(W-w)/2:{pad_y}{enable_expr}[{out_label}]")
                current_stream = out_label

            input_idx += 1

        if not filter_chains:
            # No branding layers specified, copy directly
            shutil.copyfile(local_video, output_video_path)
            return output_video_path

        filter_complex_str = ";".join(filter_chains)
        os.makedirs(os.path.dirname(os.path.abspath(output_video_path)), exist_ok=True)

        cmd = [
            "ffmpeg", "-y",
            "-threads", "1",
            "-filter_threads", "1",
            "-filter_complex_threads", "1",
            *inputs,
            "-filter_complex", filter_complex_str,
            "-map", f"[{current_stream}]",
            "-map", "0:a?",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "22",
            "-c:a", "copy",
            "-movflags", "+faststart",
            output_video_path
        ]

        import gc
        gc.collect()
        logger.info(f"Executing FFmpeg branding filter: {' '.join(cmd[:12])}...")
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            logger.error(f"FFmpeg branding failed (code {res.returncode}): {res.stderr}")
            raise RuntimeError(f"FFmpeg branding failed: {res.stderr[:400]}")

        if not os.path.exists(output_video_path) or os.path.getsize(output_video_path) == 0:
            raise RuntimeError("Branded video output file was not created or is empty.")

        logger.info(f"Successfully rendered branded video -> {output_video_path}")
        return output_video_path


watermark_service = WatermarkService()
