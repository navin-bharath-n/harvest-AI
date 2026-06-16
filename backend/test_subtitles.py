import os
import logging
from app.services.subtitle_service import subtitle_service

logging.basicConfig(level=logging.INFO)

def test_subtitle_generation():
    # Mock Whisper word-level timestamps
    mock_words = [
        {"start": 0.0, "end": 0.5, "text": "This"},
        {"start": 0.5, "end": 0.8, "text": "is"},
        {"start": 0.8, "end": 1.0, "text": "a"},
        {"start": 1.0, "end": 1.5, "text": "test"},
        {"start": 1.5, "end": 2.0, "text": "of"},
        {"start": 2.0, "end": 2.2, "text": "the"},
        {"start": 2.2, "end": 3.0, "text": "subtitle"},
        {"start": 3.0, "end": 3.8, "text": "service."},
        {"start": 4.0, "end": 4.5, "text": "Hopefully"},
        {"start": 4.5, "end": 5.0, "text": "it"},
        {"start": 5.0, "end": 5.5, "text": "works"},
        {"start": 5.5, "end": 6.0, "text": "perfectly!"}
    ]

    srt_path = "test_output.srt"
    ass_path = "test_output.ass"

    print("Generating SRT...")
    subtitle_service.generate_srt(mock_words, srt_path)
    
    print("Generating ASS...")
    style_config = {
        "font_name": "Montserrat",
        "font_size": 24,
        "primary_color": "#FFFFFF",
        "highlight_color": "#FFFF00", # Yellow
        "outline_color": "#000000",
        "back_color": "#000000",
        "bold": True,
        "italic": False,
        "alignment": 5,
        "margin_v": 150,
        "outline_size": 2,
        "shadow_size": 1,
        "resolution_x": 1080,
        "resolution_y": 1920
    }
    subtitle_service.generate_ass(mock_words, ass_path, style_config)
    
    print(f"Generated {srt_path} and {ass_path}")

    # Read and print parts of ASS file to verify it visually
    with open(ass_path, "r", encoding="utf-8") as f:
        content = f.read()
        print("--- ASS CONTENT PREVIEW ---")
        print(content[:500])
        print("...")

if __name__ == "__main__":
    test_subtitle_generation()
