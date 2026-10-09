"""
CTA (Call to Action) & Creator Outro Service.
Appends a custom 9:16 vertical outro screen (e.g. 3 seconds) after the audio/video
duration finishes. Supports user-defined Like, Comment, Subscribe, Follow buttons
and a custom long text/link area.
"""

import os
import shutil
import subprocess
import tempfile
import logging
from typing import Optional, List
from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)


def _get_font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    """Safely load TrueType font with cross-platform fallback."""
    windows_font_paths = [
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
    ]
    for fp in windows_font_paths:
        if os.path.exists(fp):
            try:
                return ImageFont.truetype(fp, size=size)
            except Exception:
                pass
    linux_paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for fp in linux_paths:
        if os.path.exists(fp):
            try:
                return ImageFont.truetype(fp, size=size)
            except Exception:
                pass
    return ImageFont.load_default()


def _wrap_text(text: str, max_chars_per_line: int = 36) -> List[str]:
    """Wraps text into readable lines."""
    words = text.split()
    lines = []
    current_line = []
    current_len = 0
    for w in words:
        addition = len(w) + (1 if current_line else 0)
        if current_len + addition <= max_chars_per_line:
            current_line.append(w)
            current_len += addition
        else:
            if current_line:
                lines.append(" ".join(current_line))
            current_line = [w]
            current_len = len(w)
    if current_line:
        lines.append(" ".join(current_line))
    return lines


def _draw_vector_icon(d: ImageDraw.ImageDraw, icon_type: str, x: int, y: int, size: int, color=(255, 255, 255, 255)):
    """Draws a crisp high-resolution vector shape for like, comment, subscribe, or follow."""
    s = size
    if icon_type == "like":
        # Thumbs up
        cuff_w = int(s * 0.22)
        cuff_h = int(s * 0.45)
        d.rounded_rectangle([x, y + s - cuff_h, x + cuff_w, y + s], radius=max(2, int(s * 0.06)), fill=color)
        palm_x = x + cuff_w + int(s * 0.08)
        palm_w = int(s * 0.55)
        palm_h = int(s * 0.45)
        d.rounded_rectangle([palm_x, y + s - palm_h, palm_x + palm_w, y + s], radius=max(2, int(s * 0.08)), fill=color)
        thumb_w = int(s * 0.26)
        thumb_h = int(s * 0.48)
        d.rounded_rectangle([palm_x, y + int(s * 0.08), palm_x + thumb_w, y + int(s * 0.08) + thumb_h], radius=max(2, int(s * 0.1)), fill=color)
    elif icon_type == "comment":
        # Speech bubble with dots
        d.rounded_rectangle([x, y + int(s * 0.1), x + s, y + int(s * 0.75)], radius=max(4, int(s * 0.2)), fill=color)
        tail = [(x + int(s * 0.25), y + int(s * 0.72)), (x + int(s * 0.15), y + int(s * 0.95)), (x + int(s * 0.45), y + int(s * 0.72))]
        d.polygon(tail, fill=color)
        dot_r = max(2, int(s * 0.05))
        cy = y + int(s * 0.42)
        for dx in [0.32, 0.5, 0.68]:
            cx = x + int(s * dx)
            d.ellipse([cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r], fill=(20, 25, 35, 255))
    elif icon_type == "subscribe":
        # Bell
        bx = x + int(s * 0.2)
        bw = int(s * 0.6)
        d.pieslice([bx, y + int(s * 0.15), bx + bw, y + int(s * 0.75)], 180, 360, fill=color)
        d.rectangle([bx, y + int(s * 0.45), bx + bw, y + int(s * 0.72)], fill=color)
        d.rounded_rectangle([x + int(s * 0.12), y + int(s * 0.68), x + s - int(s * 0.12), y + int(s * 0.78)], radius=max(2, int(s * 0.05)), fill=color)
        cw = int(s * 0.18)
        d.ellipse([x + (s - cw) // 2, y + int(s * 0.78), x + (s + cw) // 2, y + int(s * 0.92)], fill=color)
    elif icon_type == "follow":
        # Heart
        r = int(s * 0.22)
        cy = y + int(s * 0.32)
        d.ellipse([x + int(s * 0.12), cy - r, x + int(s * 0.12) + 2 * r, cy + r], fill=color)
        d.ellipse([x + s - int(s * 0.12) - 2 * r, cy - r, x + s - int(s * 0.12), cy + r], fill=color)
        tri = [(x + int(s * 0.14), cy + int(r * 0.45)), (x + s - int(s * 0.14), cy + int(r * 0.45)), (x + s // 2, y + int(s * 0.88))]
        d.polygon(tri, fill=color)


def create_9_16_outro_image(
    output_png_path: str,
    like_text: Optional[str] = "Like",
    comment_text: Optional[str] = "Comment",
    subscribe_text: Optional[str] = "Subscribe",
    follow_text: Optional[str] = "Follow",
    long_text: Optional[str] = "",
    target_width: int = 1080,
    target_height: int = 1920,
) -> str:
    """
    Renders a stunning 1080x1920 9:16 vertical outro card with user-entered
    actions and an optional custom long text card.
    """
    # 1. Dark sleek canvas (#0b0f19)
    canvas = Image.new("RGBA", (target_width, target_height), (11, 15, 25, 255))
    draw = ImageDraw.Draw(canvas)

    # Ambient border frame
    draw.rounded_rectangle(
        [40, 40, target_width - 40, target_height - 40],
        radius=40,
        outline=(30, 41, 59, 255),
        width=3,
    )

    # Gather active actions with crisp vector badges
    active_actions = []
    if like_text and like_text.strip():
        active_actions.append({"icon_type": "like", "label": like_text.strip(), "color": (59, 130, 246, 255), "bg": (18, 30, 49, 240)})
    if comment_text and comment_text.strip():
        active_actions.append({"icon_type": "comment", "label": comment_text.strip(), "color": (16, 185, 129, 255), "bg": (14, 38, 30, 240)})
    if subscribe_text and subscribe_text.strip():
        active_actions.append({"icon_type": "subscribe", "label": subscribe_text.strip(), "color": (239, 68, 68, 255), "bg": (42, 18, 22, 240)})
    if follow_text and follow_text.strip():
        active_actions.append({"icon_type": "follow", "label": follow_text.strip(), "color": (236, 72, 153, 255), "bg": (40, 18, 34, 240)})

    clean_long_text = (long_text or "").strip()
    has_actions = len(active_actions) > 0
    has_long_text = bool(clean_long_text)

    font_title = _get_font(42, bold=True)
    font_sub = _get_font(26, bold=False)
    font_btn = _get_font(34, bold=True)
    font_long = _get_font(32, bold=False)
    font_long_bold = _get_font(36, bold=True)

    # Determine layout mode
    if has_actions and has_long_text:
        start_y = 260
    elif has_actions and not has_long_text:
        start_y = 380
    else:
        start_y = 440

    # Header section
    draw.text((target_width // 2, start_y), "THANKS FOR WATCHING", font=font_title, fill=(56, 189, 248, 255), anchor="mm")
    draw.text((target_width // 2, start_y + 55), "Support this channel & stay connected", font=font_sub, fill=(148, 163, 184, 255), anchor="mm")

    current_y = start_y + 130

    # Draw Action Buttons
    if has_actions:
        btn_w = 780
        btn_h = 100
        btn_x = (target_width - btn_w) // 2
        btn_gap = 24

        for item in active_actions:
            # Button container
            draw.rounded_rectangle(
                [btn_x, current_y, btn_x + btn_w, current_y + btn_h],
                radius=24,
                fill=item["bg"],
                outline=item["color"],
                width=2,
            )

            # Icon badge on the left
            badge_size = 64
            badge_x = btn_x + 20
            badge_y = current_y + (btn_h - badge_size) // 2
            draw.rounded_rectangle(
                [badge_x, badge_y, badge_x + badge_size, badge_y + badge_size],
                radius=16,
                fill=item["color"],
            )
            # Render crisp vector icon
            icon_padding = 14
            _draw_vector_icon(
                draw,
                item["icon_type"],
                badge_x + icon_padding,
                badge_y + icon_padding,
                badge_size - 2 * icon_padding,
                color=(255, 255, 255, 255),
            )

            # Label text
            draw.text(
                (badge_x + badge_size + 24, current_y + btn_h // 2),
                item["label"],
                font=font_btn,
                fill=(255, 255, 255, 255),
                anchor="lm",
            )

            current_y += btn_h + btn_gap

        current_y += 30

    # Draw Custom Long Text / Link Card
    if has_long_text:
        card_w = 860
        card_x = (target_width - card_w) // 2

        # Wrap text into lines
        lines = _wrap_text(clean_long_text, max_chars_per_line=34 if has_actions else 30)
        line_height = 48 if has_actions else 54
        text_block_h = len(lines) * line_height
        card_h = max(200, text_block_h + 100)

        # Center vertically if only long text
        if not has_actions:
            current_y = (target_height - card_h) // 2

        # Draw card container
        draw.rounded_rectangle(
            [card_x, current_y, card_x + card_w, current_y + card_h],
            radius=28,
            fill=(22, 27, 34, 240),
            outline=(56, 189, 248, 180),  # Soft cyan accent
            width=2,
        )

        # Top pill for the card
        draw.text(
            (target_width // 2, current_y + 40),
            "📢  CREATOR NOTE & LINK",
            font=_get_font(22, bold=True),
            fill=(56, 189, 248, 255),
            anchor="mm",
        )

        # Render lines of text
        text_y = current_y + 85
        font_to_use = font_long if has_actions else font_long_bold
        for line in lines:
            draw.text(
                (target_width // 2, text_y),
                line,
                font=font_to_use,
                fill=(255, 255, 255, 255),
                anchor="mm",
            )
            text_y += line_height

    # Bottom branding
    draw.text(
        (target_width // 2, target_height - 90),
        "Made with Harvest AI",
        font=_get_font(22, bold=False),
        fill=(100, 116, 139, 255),
        anchor="mm",
    )

    canvas.save(output_png_path, "PNG")
    return output_png_path


class CTAOverlayService:
    """Service to create and append 9:16 outro screens to video clips."""

    def get_video_duration(self, video_path: str) -> float:
        """Get duration in seconds using ffprobe."""
        try:
            cmd = [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                video_path
            ]
            res = subprocess.run(cmd, capture_output=True, text=True, check=True)
            return float(res.stdout.strip())
        except Exception as e:
            logger.warning(f"Failed to probe duration for {video_path}: {e}")
            return 30.0

    def _get_outro_audio_file(self, music_track_path: Optional[str] = None, music_preset: Optional[str] = None) -> Optional[str]:
        """Finds or resolves an audio track for the ending outro screen."""
        if music_track_path and os.path.isfile(music_track_path):
            return music_track_path

        backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        cache_dir = os.path.join(backend_dir, "assets", "music_cache")

        preset_map = {
            "upbeat": "audius_afe9d6715219.mp3",
            "lofi": "audius_2a4ef1462e1a.mp3",
            "gaming": "audius_967ef2eb3463.mp3",
            "hiphop": "audius_cea9b758011b.mp3",
            "electronic": "audius_b6f43e513b27.mp3",
            "ambient": "audius_7080bc07cf13.mp3",
        }
        target_name = preset_map.get((music_preset or "").lower().strip(), "audius_afe9d6715219.mp3")
        target_path = os.path.join(cache_dir, target_name)
        if os.path.isfile(target_path):
            return target_path

        if os.path.isdir(cache_dir):
            for f in os.listdir(cache_dir):
                if f.endswith(".mp3"):
                    p = os.path.join(cache_dir, f)
                    if os.path.isfile(p) and os.path.getsize(p) > 20000:
                        return p
        return None

    def append_9_16_outro(
        self,
        video_path: str,
        like_text: Optional[str] = "Like",
        comment_text: Optional[str] = "Comment",
        subscribe_text: Optional[str] = "Subscribe",
        follow_text: Optional[str] = "",
        long_text: Optional[str] = "",
        duration: float = 3.0,
        music_track_path: Optional[str] = None,
        music_preset: Optional[str] = None,
        with_audio: bool = True,
    ) -> bool:
        """
        Appends a 9:16 vertical outro screen of length `duration` (e.g. 3.0s)
        after the video finishes.
        If with_audio=True: adds upbeat outro audio track & smooth fade-out (for original audio mode).
        If with_audio=False: pads outro with silence so bg music or uploaded audio can extend over it.
        """
        if not os.path.exists(video_path):
            logger.error(f"Video file not found: {video_path}")
            return False

        # If everything is empty, no outro needed
        if (
            not (like_text and like_text.strip())
            and not (comment_text and comment_text.strip())
            and not (subscribe_text and subscribe_text.strip())
            and not (follow_text and follow_text.strip())
            and not (long_text and long_text.strip())
        ):
            logger.info("Outro requested but all texts are empty. Skipping outro append.")
            return True

        temp_dir = tempfile.mkdtemp(prefix="harvest_outro_")
        png_path = os.path.join(temp_dir, "outro_screen.png")
        outro_clip_path = os.path.join(temp_dir, "outro_clip.mp4")
        merged_path = os.path.join(temp_dir, "final_merged.mp4")

        try:
            # 1. Render 1080x1920 9:16 outro image
            create_9_16_outro_image(
                output_png_path=png_path,
                like_text=like_text,
                comment_text=comment_text,
                subscribe_text=subscribe_text,
                follow_text=follow_text,
                long_text=long_text,
                target_width=1080,
                target_height=1920,
            )

            # 2. Render outro clip
            outro_dur = max(1.5, min(10.0, float(duration or 3.0)))
            escaped_png = png_path.replace("\\", "/")

            if not with_audio:
                # Video visual only with silent audio so bg music / uploaded audio covers it
                outro_cmd = [
                    "ffmpeg", "-y", "-loglevel", "error",
                    "-loop", "1", "-t", f"{outro_dur:.2f}", "-i", escaped_png,
                    "-f", "lavfi", "-t", f"{outro_dur:.2f}", "-i", "anullsrc=r=44100:cl=stereo",
                    "-vf", "scale=1080:1920,setsar=1",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30",
                    "-s", "1080x1920",
                    "-c:a", "aac", "-b:a", "128k",
                    "-shortest",
                    outro_clip_path
                ]
            else:
                # Original audio mode: attach dedicated upbeat outro audio with fade in & fade out
                audio_source = self._get_outro_audio_file(music_track_path, music_preset)
                if audio_source and os.path.isfile(audio_source):
                    fade_out_st = max(0.2, outro_dur - 0.5)
                    outro_cmd = [
                        "ffmpeg", "-y", "-loglevel", "error",
                        "-loop", "1", "-t", f"{outro_dur:.2f}", "-i", escaped_png,
                        "-ss", "10.0", "-t", f"{outro_dur:.2f}", "-i", audio_source,
                        "-filter_complex", f"[1:a]afade=t=in:ss=0:d=0.2,afade=t=out:st={fade_out_st:.2f}:d=0.5,volume=0.85[a]",
                        "-map", "0:v",
                        "-map", "[a]",
                        "-vf", "scale=1080:1920,setsar=1",
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30",
                        "-s", "1080x1920",
                        "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
                        "-shortest",
                        outro_clip_path
                    ]
                else:
                    fade_out_st = max(0.2, outro_dur - 0.5)
                    harmonic_filter = (
                        f"sine=frequency=523.25:duration={outro_dur:.2f},volume=0.2[s1];"
                        f"sine=frequency=659.25:duration={outro_dur:.2f},volume=0.2[s2];"
                        f"sine=frequency=783.99:duration={outro_dur:.2f},volume=0.2[s3];"
                        f"[s1][s2][s3]amix=inputs=3,afade=t=out:st={fade_out_st:.2f}:d=0.5[a]"
                    )
                    outro_cmd = [
                        "ffmpeg", "-y", "-loglevel", "error",
                        "-loop", "1", "-t", f"{outro_dur:.2f}", "-i", escaped_png,
                        "-f", "lavfi", "-t", f"{outro_dur:.2f}", "-i", harmonic_filter,
                        "-vf", "scale=1080:1920,setsar=1",
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30",
                        "-s", "1080x1920",
                        "-c:a", "aac", "-b:a", "128k",
                        "-shortest",
                        outro_clip_path
                    ]
            res_outro = subprocess.run(outro_cmd, capture_output=True, text=True)
            if res_outro.returncode != 0 or not os.path.exists(outro_clip_path):
                logger.error(f"Failed to generate outro clip: {res_outro.stderr}")
                return False

            # 3. Check if input video has an audio stream
            has_audio = False
            try:
                probe_cmd = [
                    "ffprobe", "-v", "error",
                    "-select_streams", "a:0",
                    "-show_entries", "stream=codec_type",
                    "-of", "default=noprint_wrappers=1:nokey=1",
                    video_path
                ]
                pr = subprocess.run(probe_cmd, capture_output=True, text=True)
                has_audio = "audio" in pr.stdout.lower()
            except Exception:
                has_audio = True

            # 4. Concatenate input video + outro clip (strictly enforcing 1080x1920, 30fps, SAR 1:1, stereo 44.1kHz)
            if has_audio:
                concat_filter = (
                    "[0:v]fps=30,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v0];"
                    "[1:v]fps=30,scale=1080:1920,setsar=1,format=yuv420p[v1];"
                    "[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a0];"
                    "[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a1];"
                    "[v0][a0][v1][a1]concat=n=2:v=1:a=1[outv][outa]"
                )
                concat_cmd = [
                    "ffmpeg", "-y", "-loglevel", "error",
                    "-threads", "1", "-filter_threads", "1", "-filter_complex_threads", "1",
                    "-i", video_path,
                    "-i", outro_clip_path,
                    "-filter_complex", concat_filter,
                    "-map", "[outv]",
                    "-map", "[outa]",
                    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "22",
                    "-c:a", "aac", "-b:a", "128k",
                    "-movflags", "+faststart",
                    merged_path
                ]
            else:
                concat_filter = (
                    "[0:v]fps=30,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v0];"
                    "[1:v]fps=30,scale=1080:1920,setsar=1,format=yuv420p[v1];"
                    "[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[outa];"
                    "[v0][v1]concat=n=2:v=1:a=0[outv]"
                )
                concat_cmd = [
                    "ffmpeg", "-y", "-loglevel", "error",
                    "-threads", "1", "-filter_threads", "1", "-filter_complex_threads", "1",
                    "-i", video_path,
                    "-i", outro_clip_path,
                    "-filter_complex", concat_filter,
                    "-map", "[outv]",
                    "-map", "[outa]",
                    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "22",
                    "-c:a", "aac", "-b:a", "128k",
                    "-movflags", "+faststart",
                    merged_path
                ]

            import gc
            gc.collect()
            logger.info(f"Concatenating 9:16 outro ({outro_dur}s) to {video_path}")
            res_concat = subprocess.run(concat_cmd, capture_output=True, text=True)
            if res_concat.returncode != 0:
                logger.error(f"FFmpeg outro concat failed: {res_concat.stderr}")
                return False

            if os.path.exists(merged_path) and os.path.getsize(merged_path) > 1000:
                shutil.move(merged_path, video_path)
                logger.info(f"Successfully appended 9:16 outro to {video_path}")
                return True
            return False

        except Exception as e:
            logger.error(f"Error appending 9:16 outro: {e}", exc_info=True)
            return False
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)


cta_overlay_service = CTAOverlayService()
