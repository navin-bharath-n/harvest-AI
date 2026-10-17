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
import re
import json
from pathlib import Path
from typing import Optional, List
from PIL import Image, ImageDraw, ImageFont, ImageOps

logger = logging.getLogger(__name__)


def _get_font(size: int, bold: bool = False, family: str = "sans") -> ImageFont.ImageFont:
    """Safely load TrueType font with cross-platform fallback."""
    family = (family or "sans").lower()
    if family == "script":
        windows_font_paths = ["C:/Windows/Fonts/segoesc.ttf", "C:/Windows/Fonts/seguisbi.ttf"]
        linux_paths = ["/usr/share/fonts/truetype/dejavu/DejaVuSerifCondensed-Italic.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"]
    elif family == "serif":
        windows_font_paths = ["C:/Windows/Fonts/georgiab.ttf" if bold else "C:/Windows/Fonts/georgia.ttf", "C:/Windows/Fonts/timesbd.ttf" if bold else "C:/Windows/Fonts/times.ttf"]
        linux_paths = ["/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf", "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf"]
    else:
        windows_font_paths = ["C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"]
        linux_paths = ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"]
    for fp in windows_font_paths:
        if os.path.exists(fp):
            try:
                return ImageFont.truetype(fp, size=size)
            except Exception:
                pass
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


try:
    import qrcode
except ImportError:
    qrcode = None


def _faith_outro_defaults() -> dict:
    """Load the local JSON defaults extracted from the supplied outro template."""
    config_path = Path(__file__).resolve().parents[1] / "assets" / "outro_templates" / "dw365-outro" / "config.json"
    try:
        with config_path.open("r", encoding="utf-8") as config_file:
            return json.load(config_file)
    except Exception as exc:
        logger.warning("Could not read local Faith outro config: %s", exc)
        return {"design": "faith_cinematic", "fontFamily": "serif"}


def _resolve_outro_background(background_path: Optional[str]) -> Optional[str]:
    """Resolve an uploaded background image without allowing arbitrary local paths."""
    if not background_path:
        return None
    try:
        from app.services import object_storage
        if object_storage.is_remote(background_path):
            resolved = object_storage.local_path(background_path)
            return resolved if os.path.isfile(resolved) else None

        backend_root = Path(__file__).resolve().parents[2]
        uploads_root = (backend_root / "uploads").resolve()
        raw_path = Path(background_path)
        resolved = raw_path.resolve() if raw_path.is_absolute() else (backend_root / raw_path).resolve()
        if os.path.commonpath([str(uploads_root), str(resolved)]) != str(uploads_root):
            logger.warning("Rejected outro background outside the uploads directory")
            return None
        return str(resolved) if resolved.is_file() else None
    except Exception as exc:
        logger.warning("Could not resolve outro background image: %s", exc)
        return None


def create_faith_cinematic_outro_image(
    output_png_path: str,
    *,
    config: Optional[dict] = None,
    like_text: str = "",
    comment_text: str = "",
    subscribe_text: str = "",
    follow_text: str = "",
    long_text: str = "",
    qr_link: str = "",
    quote_text: str = "",
    target_width: int = 1080,
    target_height: int = 1920,
) -> str:
    """Render the supplied cinematic outro design with user-editable text and background."""
    defaults = _faith_outro_defaults()
    settings = {**defaults, **(config or {})}
    font_family = str(settings.get("font_family") or settings.get("fontFamily") or "serif")
    if font_family not in {"sans", "serif", "script"}:
        font_family = "serif"

    def text_value(key: str, default: str, limit: int = 120) -> str:
        value = settings.get(key, default)
        return str(value if value is not None else "").strip()[:limit]

    background_path = _resolve_outro_background(text_value("background_image_path", "", 500))
    if background_path:
        try:
            with Image.open(background_path) as source:
                canvas = ImageOps.fit(source.convert("RGBA"), (target_width, target_height), method=Image.Resampling.LANCZOS)
        except Exception as exc:
            logger.warning("Could not load custom outro background; using a gradient instead: %s", exc)
            canvas = Image.new("RGBA", (target_width, target_height), (8, 20, 38, 255))
    else:
        canvas = Image.new("RGBA", (target_width, target_height), (8, 20, 38, 255))
        pixels = canvas.load()
        for y in range(target_height):
            blend = y / max(1, target_height - 1)
            color = (int(23 - 14 * blend), int(75 - 61 * blend), int(123 - 98 * blend), 255)
            for x in range(target_width):
                pixels[x, y] = color

    overlay = Image.new("RGBA", (target_width, target_height), (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    for y in range(target_height):
        ratio = y / max(1, target_height - 1)
        alpha = int(55 + 145 * ratio)
        overlay_draw.line((0, y, target_width, y), fill=(3, 10, 20, alpha))
    canvas = Image.alpha_composite(canvas, overlay)
    draw = ImageDraw.Draw(canvas)

    gold = (255, 202, 91, 255)
    white = (255, 250, 243, 255)
    brand = text_value("brand", "DailyWhisper", 45)
    accent = text_value("brand_accent", text_value("brandAccent", "365", 20), 20)
    subbrand = text_value("subbrand", "A DAILY PRAYER FOR A BRIGHTER TOMORROW", 80)
    headline = text_value("headline", "Thanks for", 80)
    headline_emphasis = text_value("headline_emphasis", text_value("headlineEmphasis", "Watching", 80), 80)
    tagline = text_value("tagline", "STAY CONNECTED • STAY BLESSED", 100)
    footer = text_value("footer", "To God Be the Glory", 80)
    bottom_note = text_value("bottom_note", text_value("bottomNote", "PRAY DAILY • GROW IN FAITH • SHARE LOVE", 100), 100)
    qr_title = text_value("qr_title", text_value("qrTitle", "SCAN & CONNECT", 50), 50)
    qr_label = text_value("qr_label", text_value("qrLabel", "OUR CHANNEL", 50), 50)
    qr_description = text_value("qr_description", text_value("qrDescription", "Watch more prayers, songs and uplifting messages.", 120), 120)
    quote_title = text_value("quote_title", "✨ INSPIRING QUOTE / PROMO", 60)
    promo_font_family = str(settings.get("promo_font_family") or "sans").lower()
    quote_font_family = str(settings.get("quote_font_family") or font_family).lower()
    if promo_font_family not in {"sans", "serif", "script"}:
        promo_font_family = "sans"
    if quote_font_family not in {"sans", "serif", "script"}:
        quote_font_family = font_family
    supports = settings.get("action_support") or settings.get("actionSupport") or {}
    if not isinstance(supports, dict):
        supports = {}
    action_colors = settings.get("action_colors") or {}
    if not isinstance(action_colors, dict):
        action_colors = {}
    action_card_style = str(settings.get("action_card_style") or "filled").lower()
    if action_card_style not in {"filled", "outline", "glass", "neon"}:
        action_card_style = "filled"
    action_font_family = str(settings.get("action_font_family") or font_family).lower()
    if action_font_family not in {"sans", "serif", "script"}:
        action_font_family = "sans"
    try:
        action_card_opacity = max(0, min(100, int(settings.get("action_card_opacity", 35))))
    except (TypeError, ValueError):
        action_card_opacity = 35

    def color_from_hex(value, fallback):
        try:
            raw = str(value or "").strip().lstrip("#")
            if len(raw) == 3:
                raw = "".join(char * 2 for char in raw)
            if len(raw) != 6:
                return fallback
            return tuple(int(raw[index:index + 2], 16) for index in (0, 2, 4))
        except (TypeError, ValueError):
            return fallback

    promo_text_rgb = color_from_hex(settings.get("promo_text_color"), (255, 255, 255))
    promo_bg_rgb = color_from_hex(settings.get("promo_bg_color"), (255, 255, 255))
    quote_text_rgb = color_from_hex(settings.get("quote_text_color"), (241, 245, 249))
    quote_title_rgb = color_from_hex(settings.get("quote_title_color"), (192, 132, 252))
    quote_bg_rgb = color_from_hex(settings.get("quote_bg_color"), (18, 24, 38))
    quote_border_rgb = color_from_hex(settings.get("quote_border_color"), (168, 85, 247))

    def transparency_alpha(key, default):
        try:
            transparency = max(0, min(95, int(settings.get(key, default))))
        except (TypeError, ValueError):
            transparency = default
        return round(255 * (100 - transparency) / 100)

    promo_bg_alpha = transparency_alpha("promo_transparency", 82)
    quote_bg_alpha = transparency_alpha("quote_transparency", 5)

    def centered(text: str, y: int, size: int, fill, bold=False, max_width=920, family=None):
        if not text:
            return
        selected_family = family or font_family
        font_size = size
        font = _get_font(font_size, bold=bold, family=selected_family)
        while font_size > 18 and draw.textbbox((0, 0), text, font=font)[2] > max_width:
            font_size -= 2
            font = _get_font(font_size, bold=bold, family=selected_family)
        draw.text((target_width // 2, y), text, font=font, fill=fill, anchor="mm")

    def composite_rounded_panel(base, box, radius, fill, outline, width, glow=None):
        """Blend translucent panel pixels over the background before flattening to RGB."""
        layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
        layer_draw = ImageDraw.Draw(layer)
        if glow:
            for glow_width, glow_alpha, glow_rgb in glow:
                layer_draw.rounded_rectangle(
                    [box[0] - 2, box[1] - 2, box[2] + 2, box[3] + 2],
                    radius=radius,
                    outline=(*glow_rgb, glow_alpha),
                    width=glow_width,
                )
        layer_draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)
        return Image.alpha_composite(base, layer)

    centered(f"{brand} {accent}".strip(), 100, 48, white, bold=True)
    centered(subbrand, 163, 21, white, max_width=900)
    centered(headline, 330, 84, white, family="script" if font_family == "script" else font_family)
    centered(headline_emphasis, 455, 118, gold, family="script" if font_family == "script" else font_family)
    centered(tagline, 590, 25, white, max_width=950)
    if long_text and long_text.strip():
        canvas = composite_rounded_panel(canvas, [130, 620, target_width - 130, 684], 15, (*promo_bg_rgb, promo_bg_alpha), (255, 255, 255, 90), 2)
        draw = ImageDraw.Draw(canvas)
        centered(long_text.strip()[:100], 652, 24, (*promo_text_rgb, 255), bold=True, max_width=target_width - 300, family=promo_font_family)

    action_items = [
        ("like", like_text, (35, 191, 255)),
        ("comment", comment_text, (39, 231, 126)),
        ("subscribe", subscribe_text, (255, 72, 75)),
        # The fourth CTA is presented as Share, while retaining the existing API
        # field name for compatibility with already saved branding settings.
        ("share", follow_text, (224, 66, 228)),
    ]
    active_actions = [action for action in action_items if action[1]]
    if active_actions:
        columns = 4 if len(active_actions) == 4 else (2 if len(active_actions) > 1 else 1)
        gap_x, gap_y = 18, 16
        margin = 64
        card_width = (target_width - 2 * margin - gap_x * (columns - 1)) // columns
        card_height = 248 if columns == 4 else 132
        rows = (len(active_actions) + columns - 1) // columns
        total_width = card_width * columns + gap_x * (columns - 1)
        x_start = (target_width - total_width) // 2
        y_start = 700
        for index, (key, action_label, default_edge) in enumerate(active_actions):
            edge_rgb = color_from_hex(action_colors.get(key), default_edge)
            edge = (*edge_rgb, 255)
            x = x_start + (index % columns) * (card_width + gap_x)
            y = y_start + (index // columns) * (card_height + gap_y)
            if action_card_style == "outline":
                fill = (7, 16, 29, 222)
                outline = edge
                outline_width = 4
            elif action_card_style == "glass":
                fill = (255, 255, 255, int(255 * action_card_opacity / 100))
                outline = edge
                outline_width = 3
            else:
                fill = (*tuple(int(channel * 0.35) for channel in edge_rgb), 238)
                outline = edge
                outline_width = 3
            if action_card_style == "neon":
                fill = (*tuple(int(channel * 0.22) for channel in edge_rgb), 248)
                outline = edge
                outline_width = 4
            radius = 34 if columns == 4 else 22
            glow = [(14, 24, edge_rgb), (8, 42, edge_rgb)] if action_card_style == "neon" else None
            canvas = composite_rounded_panel(canvas, [x, y, x + card_width, y + card_height], radius, fill, outline, outline_width, glow=glow)
            draw = ImageDraw.Draw(canvas)
            if columns == 4:
                icon = {"like": "♥", "comment": "•••", "subscribe": "▶", "share": "↗"}[key]
                icon_y = y + 68
                icon_bg = [x + card_width // 2 - 38, icon_y - 38, x + card_width // 2 + 38, icon_y + 38]
                draw.rounded_rectangle(icon_bg, radius=22, fill=edge)
                center_x = x + card_width // 2
                if key == "like":
                    draw.polygon([(center_x - 22, icon_y - 3), (center_x - 10, icon_y - 3), (center_x + 1, icon_y - 23), (center_x + 9, icon_y - 24), (center_x + 12, icon_y - 18), (center_x + 8, icon_y - 5), (center_x + 22, icon_y - 5), (center_x + 27, icon_y + 1), (center_x + 20, icon_y + 23), (center_x - 22, icon_y + 23)], fill=white)
                elif key == "comment":
                    draw.rounded_rectangle([center_x - 24, icon_y - 17, center_x + 24, icon_y + 13], radius=10, fill=white)
                    draw.polygon([(center_x - 12, icon_y + 9), (center_x - 20, icon_y + 23), (center_x + 1, icon_y + 10)], fill=white)
                    for dot_x in (center_x - 12, center_x, center_x + 12):
                        draw.ellipse([dot_x - 3, icon_y - 4, dot_x + 3, icon_y + 2], fill=edge)
                elif key == "subscribe":
                    draw.rounded_rectangle([center_x - 25, icon_y - 17, center_x + 25, icon_y + 17], radius=10, fill=white)
                    draw.polygon([(center_x - 6, icon_y - 10), (center_x + 12, icon_y), (center_x - 6, icon_y + 10)], fill=edge)
                else:
                    first_node = (center_x - 16, icon_y)
                    upper_node = (center_x + 16, icon_y - 17)
                    lower_node = (center_x + 16, icon_y + 17)
                    draw.line([first_node, upper_node], fill=white, width=6)
                    draw.line([first_node, lower_node], fill=white, width=6)
                    for node_x, node_y in (first_node, upper_node, lower_node):
                        draw.ellipse([node_x - 8, node_y - 8, node_x + 8, node_y + 8], fill=white)
                label_font = _get_font(25, bold=True, family=action_font_family)
                draw.text((x + card_width // 2, y + 137), action_label.strip()[:24].upper(), font=label_font, fill=white, anchor="mm")
                support_x, support_y, support_width = x + card_width // 2, y + 190, card_width - 28
                support_anchor = "mm"
            else:
                draw.rounded_rectangle([x + 16, y + 18, x + 58, y + 60], radius=10, fill=edge)
                icon = {"like": "↑", "comment": "•••", "subscribe": "▶", "share": "↗"}[key]
                draw.text((x + 37, y + 39), icon, font=_get_font(23, bold=True, family="sans"), fill=white, anchor="mm")
                label_font = _get_font(23, bold=True, family=action_font_family)
                draw.text((x + 72, y + 39), action_label.strip()[:32], font=label_font, fill=white, anchor="lm")
                support_x, support_y, support_width = x + 72, y + 76, card_width - 92
                support_anchor = "lm"
            support = str(supports.get(key, supports.get("follow", "") if key == "share" else "")).strip()[:45]
            if support:
                words = support.split()
                lines, line = [], ""
                support_font = _get_font(18, family=action_font_family)
                for word in words:
                    trial = f"{line} {word}".strip()
                    if draw.textbbox((0, 0), trial, font=support_font)[2] > support_width and line:
                        lines.append(line)
                        line = word
                    else:
                        line = trial
                if line:
                    lines.append(line)
                for line_index, line_text in enumerate(lines[:2]):
                    draw.text((support_x, support_y + line_index * 24), line_text, font=support_font, fill=(255, 255, 255, 235), anchor=support_anchor)

    clean_qr_link = (qr_link or "").strip()
    if clean_qr_link and qrcode is not None:
        try:
            qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=8, border=2)
            qr.add_data(clean_qr_link)
            qr.make(fit=True)
            qr_size = 280
            card = [245, 1120, target_width - 245, 1590]
            draw.rounded_rectangle(card, radius=30, fill=(255, 255, 255, 250), outline=(56, 189, 248, 255), width=5)
            draw.rounded_rectangle([target_width // 2 - 118, 1140, target_width // 2 + 118, 1187], radius=12, fill=(15, 23, 42, 255))
            draw.text((target_width // 2, 1164), qr_title[:40], font=_get_font(22, bold=True, family="sans"), fill=(56, 189, 248, 255), anchor="mm")
            qr_img = qr.make_image(fill_color="#0b1730", back_color="#ffffff").convert("RGBA")
            qr_img = qr_img.resize((qr_size, qr_size), Image.Resampling.NEAREST)
            canvas.alpha_composite(qr_img, ((target_width - qr_size) // 2, 1195))
            centered(qr_label, 1490, 26, (21, 31, 62, 255), bold=True, max_width=520, family="sans")
            for index, line_text in enumerate(_wrap_text(qr_description, max_chars_per_line=42)[:2]):
                centered(line_text, 1520 + index * 22, 16, (36, 43, 58, 255), max_width=520, family="sans")
        except Exception as exc:
            logger.warning("Failed to generate QR code for cinematic outro: %s", exc)

    if quote_text and quote_text.strip():
        quote = "“" + quote_text.strip()[:180] + "”"
        quote_lines = _wrap_text(quote, max_chars_per_line=68)[:3]
        quote_bottom = 1020 + max(1, len(quote_lines)) * 27 + 18
        canvas = composite_rounded_panel(canvas, [110, 980, target_width - 110, quote_bottom], 22, (*quote_bg_rgb, quote_bg_alpha), (*quote_border_rgb, 255), 3)
        draw = ImageDraw.Draw(canvas)
        centered(quote_title, 1005, 18, (*quote_title_rgb, 255), bold=True, max_width=820, family="sans")
        for index, line_text in enumerate(quote_lines):
            centered(line_text, 1035 + index * 27, 23, (*quote_text_rgb, 255), max_width=820, family=quote_font_family)

    centered(footer, 1640, 38, gold, bold=True, family=font_family)
    centered(bottom_note, 1705, 22, white, max_width=950)
    canvas.convert("RGB").save(output_png_path, "PNG")
    return output_png_path


def create_9_16_outro_image(
    output_png_path: str,
    like_text: Optional[str] = "Like",
    comment_text: Optional[str] = "Comment",
    subscribe_text: Optional[str] = "Subscribe",
    follow_text: Optional[str] = "Follow",
    long_text: Optional[str] = "",
    qr_link: Optional[str] = "",
    quote_text: Optional[str] = "",
    outro_config: Optional[dict] = None,
    target_width: int = 1080,
    target_height: int = 1920,
) -> str:
    """
    Renders a stunning 1080x1920 9:16 vertical outro card with user-entered
    actions, optional custom quote card, and scannable QR code promotional card.
    """
    if isinstance(outro_config, dict) and outro_config.get("design") == "faith_cinematic":
        return create_faith_cinematic_outro_image(
            output_png_path,
            config=outro_config,
            like_text=like_text or "",
            comment_text=comment_text or "",
            subscribe_text=subscribe_text or "",
            follow_text=follow_text or "",
            long_text=long_text or "",
            qr_link=qr_link or "",
            quote_text=quote_text or "",
            target_width=target_width,
            target_height=target_height,
        )

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
    clean_qr_link = (qr_link or "").strip()
    clean_quote_text = (quote_text or "").strip()

    has_actions = len(active_actions) > 0
    has_long_text = bool(clean_long_text)
    has_qr = bool(clean_qr_link) and qrcode is not None
    has_quote = bool(clean_quote_text)

    font_title = _get_font(42, bold=True)
    font_sub = _get_font(26, bold=False)
    font_btn = _get_font(34, bold=True)
    font_btn_compact = _get_font(26, bold=True)
    font_long = _get_font(32, bold=False)
    font_long_bold = _get_font(34, bold=True)
    font_quote = _get_font(30, bold=False)

    # Dynamically estimate total content height to vertically center on the 1080x1920 screen
    header_h = 110
    buttons_h = 0
    if has_actions:
        if has_qr or has_quote:
            num_rows = (len(active_actions) + 1) // 2
            buttons_h = num_rows * (76 + 16) + 20
        else:
            buttons_h = len(active_actions) * (100 + 24) + 24

    headline_h = 0
    if has_long_text:
        headline_h = 55 if (has_qr or has_quote) else 230

    quote_h = 0
    if has_quote:
        quote_lines_est = _wrap_text(clean_quote_text, max_chars_per_line=34)
        quote_h = max(130, len(quote_lines_est) * 44 + 80) + 26

    qr_h = (370 + 20) if has_qr else 0

    total_content_h = header_h + buttons_h + headline_h + quote_h + qr_h
    start_y = max(160, min(360, (target_height - total_content_h) // 2))

    # Header section
    draw.text((target_width // 2, start_y), "THANKS FOR WATCHING", font=font_title, fill=(56, 189, 248, 255), anchor="mm")
    sub_text = "Scan the QR code & stay connected" if has_qr else "Support this channel & stay connected"
    draw.text((target_width // 2, start_y + 55), sub_text, font=font_sub, fill=(148, 163, 184, 255), anchor="mm")

    current_y = start_y + 120

    # Draw Action Buttons
    if has_actions:
        if has_qr or has_quote:
            # Compact 2x2 grid when QR code or quote card is displayed
            btn_w = 400
            btn_h = 76
            btn_x1 = 130
            btn_x2 = 550
            btn_gap = 16

            for idx, item in enumerate(active_actions):
                col = idx % 2
                row = idx // 2
                bx = btn_x1 if col == 0 else btn_x2
                by = current_y + row * (btn_h + btn_gap)

                draw.rounded_rectangle(
                    [bx, by, bx + btn_w, by + btn_h],
                    radius=20,
                    fill=item["bg"],
                    outline=item["color"],
                    width=2,
                )

                badge_size = 50
                badge_x = bx + 16
                badge_y = by + (btn_h - badge_size) // 2
                draw.rounded_rectangle(
                    [badge_x, badge_y, badge_x + badge_size, badge_y + badge_size],
                    radius=14,
                    fill=item["color"],
                )
                _draw_vector_icon(
                    draw,
                    item["icon_type"],
                    badge_x + 10,
                    badge_y + 10,
                    badge_size - 20,
                    color=(255, 255, 255, 255),
                )
                draw.text(
                    (badge_x + badge_size + 18, by + btn_h // 2),
                    item["label"],
                    font=font_btn_compact,
                    fill=(255, 255, 255, 255),
                    anchor="lm",
                )

            num_rows = (len(active_actions) + 1) // 2
            current_y += num_rows * (btn_h + btn_gap) + 20
        else:
            # Full-width buttons when no QR code
            btn_w = 780
            btn_h = 100
            btn_x = (target_width - btn_w) // 2
            btn_gap = 24

            for item in active_actions:
                draw.rounded_rectangle(
                    [btn_x, current_y, btn_x + btn_w, current_y + btn_h],
                    radius=24,
                    fill=item["bg"],
                    outline=item["color"],
                    width=2,
                )

                badge_size = 64
                badge_x = btn_x + 20
                badge_y = current_y + (btn_h - badge_size) // 2
                draw.rounded_rectangle(
                    [badge_x, badge_y, badge_x + badge_size, badge_y + badge_size],
                    radius=16,
                    fill=item["color"],
                )
                _draw_vector_icon(
                    draw,
                    item["icon_type"],
                    badge_x + 14,
                    badge_y + 14,
                    badge_size - 28,
                    color=(255, 255, 255, 255),
                )
                draw.text(
                    (badge_x + badge_size + 24, current_y + btn_h // 2),
                    item["label"],
                    font=font_btn,
                    fill=(255, 255, 255, 255),
                    anchor="lm",
                )
                current_y += btn_h + btn_gap

            current_y += 24

    # Draw Custom Headline / Outro Text Callout
    if has_long_text:
        if has_qr or has_quote:
            # Sleek callout banner
            draw.text(
                (target_width // 2, current_y + 20),
                clean_long_text,
                font=font_long_bold,
                fill=(255, 255, 255, 255),
                anchor="mm",
            )
            current_y += 55
        else:
            # Standard Creator Note & Link card
            card_w = 860
            card_x = (target_width - card_w) // 2
            lines = _wrap_text(clean_long_text, max_chars_per_line=34 if has_actions else 30)
            line_height = 48 if has_actions else 54
            text_block_h = len(lines) * line_height
            card_h = max(200, text_block_h + 100)

            if not has_actions:
                current_y = (target_height - card_h) // 2

            draw.rounded_rectangle(
                [card_x, current_y, card_x + card_w, current_y + card_h],
                radius=28,
                fill=(22, 27, 34, 240),
                outline=(56, 189, 248, 180),
                width=2,
            )
            draw.text(
                (target_width // 2, current_y + 40),
                "CREATOR NOTE & LINK",
                font=_get_font(22, bold=True),
                fill=(56, 189, 248, 255),
                anchor="mm",
            )
            text_y = current_y + 85
            for line in lines:
                draw.text((target_width // 2, text_y), line, font=font_long, fill=(255, 255, 255, 255), anchor="mm")
                text_y += line_height
            current_y += card_h + 30

    # Draw Custom Quote / Slogan Card
    if has_quote:
        card_w = 860
        card_x = (target_width - card_w) // 2
        quote_lines = _wrap_text(clean_quote_text, max_chars_per_line=34)
        line_height = 44
        text_block_h = len(quote_lines) * line_height
        card_h = max(130, text_block_h + 80)

        draw.rounded_rectangle(
            [card_x, current_y, card_x + card_w, current_y + card_h],
            radius=24,
            fill=(18, 24, 38, 240),
            outline=(168, 85, 247, 180),  # Soft purple accent
            width=2,
        )
        draw.text(
            (target_width // 2, current_y + 32),
            "INSPIRING QUOTE / PROMO",
            font=_get_font(20, bold=True),
            fill=(192, 132, 252, 255),
            anchor="mm",
        )
        text_y = current_y + 70
        for idx, line in enumerate(quote_lines):
            line_str = f"“{line}”" if len(quote_lines) == 1 else (f"“{line}" if idx == 0 else (f"{line}”" if idx == len(quote_lines) - 1 else line))
            draw.text((target_width // 2, text_y), line_str, font=font_quote, fill=(241, 245, 249, 255), anchor="mm")
            text_y += line_height

        current_y += card_h + 26

    # Draw Promotional QR Code Card
    if has_qr:
        try:
            qr = qrcode.QRCode(
                version=None,
                error_correction=qrcode.constants.ERROR_CORRECT_M,
                box_size=8,
                border=2,
            )
            qr.add_data(clean_qr_link)
            qr.make(fit=True)
            qr_img = qr.make_image(fill_color="#0f172a", back_color="#ffffff").convert("RGBA")
            qr_display_size = 240
            qr_img = qr_img.resize((qr_display_size, qr_display_size), Image.Resampling.LANCZOS)

            card_w = 560
            card_h = 370
            card_x = (target_width - card_w) // 2

            # White sleek rounded card container
            draw.rounded_rectangle(
                [card_x, current_y, card_x + card_w, current_y + card_h],
                radius=32,
                fill=(255, 255, 255, 255),
                outline=(56, 189, 248, 255),
                width=3,
            )

            # Top capsule pill inside card
            pill_w = 280
            pill_h = 34
            pill_x = (target_width - pill_w) // 2
            draw.rounded_rectangle(
                [pill_x, current_y + 14, pill_x + pill_w, current_y + 14 + pill_h],
                radius=10,
                fill=(15, 23, 42, 255),
            )
            draw.text(
                (target_width // 2, current_y + 14 + pill_h // 2),
                "SCAN TO VISIT / SHOP",
                font=_get_font(18, bold=True),
                fill=(56, 189, 248, 255),
                anchor="mm",
            )

            # Paste QR Code in center
            canvas.paste(qr_img, ((target_width - qr_display_size) // 2, current_y + 60), qr_img)

            # Link text below QR code
            clean_display_url = clean_qr_link.replace("https://", "").replace("http://", "").rstrip("/")
            if len(clean_display_url) > 34:
                clean_display_url = clean_display_url[:31] + "..."
            draw.text(
                (target_width // 2, current_y + 328),
                clean_display_url,
                font=_get_font(20, bold=True),
                fill=(51, 65, 85, 255),
                anchor="mm",
            )
            current_y += card_h + 20
        except Exception as qre:
            logger.warning(f"Failed to generate QR code for outro: {qre}")

    # Bottom branding
    draw.text(
        (target_width // 2, target_height - 70),
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
        qr_link: Optional[str] = "",
        quote_text: Optional[str] = "",
        duration: float = 3.0,
        music_track_path: Optional[str] = None,
        music_preset: Optional[str] = None,
        with_audio: bool = True,
        outro_config: Optional[dict] = None,
    ) -> bool:
        """
        Appends a 9:16 vertical outro screen of length `duration` (e.g. 3.0s)
        after the video finishes.
        Supports action buttons, promotional QR code, and custom quote/message.
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
            and not (qr_link and qr_link.strip())
            and not (quote_text and quote_text.strip())
            and not (isinstance(outro_config, dict) and outro_config.get("design") == "faith_cinematic")
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
                qr_link=qr_link,
                quote_text=quote_text,
                outro_config=outro_config,
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

            # Keep the source raster size; upscaling a low-resolution source
            # does not add detail and makes the rendered file unnecessarily large.
            target_width, target_height = 1080, 1920
            try:
                size_probe = subprocess.run(
                    ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", video_path],
                    capture_output=True, text=True, timeout=10,
                )
                match = re.fullmatch(r"\s*(\d+)x(\d+)\s*", size_probe.stdout or "")
                if size_probe.returncode == 0 and match:
                    target_width = max(2, int(match.group(1)) // 2 * 2)
                    target_height = max(2, int(match.group(2)) // 2 * 2)
            except Exception as probe_err:
                logger.warning(f"Could not read source dimensions; using 1080x1920 for outro render: {probe_err}")

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

            # 4. Normalize both segments before concatenating. Stream-copy can
            # join mismatched dimensions/timebases (for example, a 608x1080
            # source and this 1080x1920 outro), which some iPhone decoders handle
            # incorrectly. Re-encode to one standard H.264/AAC MP4 stream.
            import gc
            gc.collect()
            logger.info(f"Appending 9:16 outro ({outro_dur}s) at source resolution {target_width}x{target_height} with high-quality iOS-compatible encoding")
            source_video_filter = (
                f"setpts=PTS-STARTPTS,fps=30,scale={target_width}:{target_height}:force_original_aspect_ratio=decrease,"
                f"pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p"
            )
            outro_video_filter = source_video_filter
            if has_audio:
                concat_filter = (
                    f"[0:v]{source_video_filter}[v0];"
                    f"[1:v]{outro_video_filter}[v1];"
                    "[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a0];"
                    "[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a1];"
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
                    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-profile:v", "main", "-pix_fmt", "yuv420p", "-tag:v", "avc1",
                    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
                    "-movflags", "+faststart",
                    merged_path
                ]
            else:
                concat_filter = (
                    f"[0:v]{source_video_filter}[v0];"
                    f"[1:v]{outro_video_filter}[v1];"
                    "[v0][v1]concat=n=2:v=1:a=0[outv]"
                )
                concat_cmd = [
                    "ffmpeg", "-y", "-loglevel", "error",
                    "-threads", "1", "-filter_threads", "1", "-filter_complex_threads", "1",
                    "-i", video_path,
                    "-i", outro_clip_path,
                    "-filter_complex", concat_filter,
                    "-map", "[outv]",
                    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-profile:v", "main", "-pix_fmt", "yuv420p", "-tag:v", "avc1",
                    "-movflags", "+faststart",
                    merged_path
                ]

            gc.collect()
            res_concat2 = subprocess.run(concat_cmd, capture_output=True, text=True, timeout=300)
            if res_concat2.returncode == 0 and os.path.exists(merged_path) and os.path.getsize(merged_path) > 1000:
                shutil.move(merged_path, video_path)
                logger.info(f"Successfully appended normalized 9:16 outro to {video_path}")
                return True

            logger.warning("Could not append 9:16 outro; preserving original clip.")
            return False

        except Exception as e:
            logger.error(f"Error appending 9:16 outro: {e}", exc_info=True)
            return False
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)


cta_overlay_service = CTAOverlayService()
