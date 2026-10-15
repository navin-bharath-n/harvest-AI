import os
import tempfile
import pytest
from PIL import Image

from app.schemas.video import ClipBrandingRequest
from app.services.cta_overlay_service import create_9_16_outro_image, cta_overlay_service


def test_clip_branding_request_schema():
    req = ClipBrandingRequest(
        enable_outro=True,
        outro_custom_text="Follow us on YouTube!",
        outro_qr_link="https://harvestai.app/deal",
        outro_quote_text="Great things take time.",
    )
    assert req.enable_outro is True
    assert req.outro_qr_link == "https://harvestai.app/deal"
    assert req.outro_quote_text == "Great things take time."


def test_create_9_16_outro_image_with_qr_and_quote():
    with tempfile.TemporaryDirectory() as tmp_dir:
        out_png = os.path.join(tmp_dir, "test_outro.png")
        result = create_9_16_outro_image(
            output_png_path=out_png,
            like_text="Like",
            comment_text="Comment",
            subscribe_text="Subscribe",
            follow_text="Follow",
            long_text="Follow @harvestai for tips!",
            qr_link="https://harvestai.app/promo",
            quote_text="The best way to predict the future is to create it.",
        )
        assert os.path.isfile(result)
        assert os.path.getsize(result) > 5000

        with Image.open(result) as img:
            assert img.size == (1080, 1920)
            assert img.mode == "RGBA"


def test_create_9_16_outro_image_minimal():
    with tempfile.TemporaryDirectory() as tmp_dir:
        out_png = os.path.join(tmp_dir, "test_outro_qr_only.png")
        result = create_9_16_outro_image(
            output_png_path=out_png,
            like_text="",
            comment_text="",
            subscribe_text="",
            follow_text="",
            long_text="",
            qr_link="https://harvestai.app",
            quote_text="",
        )
        assert os.path.isfile(result)
        with Image.open(result) as img:
            assert img.size == (1080, 1920)
