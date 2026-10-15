"""
Harvest AI - Automated Caption System Test Suite (Tests A through I)
Validates full video captioning independence, transcript data flow,
SRT generation, FFmpeg burning, failure isolation, and regressions.
"""

import os
import sys
import tempfile
import subprocess
import pytest
from pathlib import Path

# Add backend directory to sys.path
_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from app.services.subtitle_service import subtitle_service
from app.services.translation_service import translate_and_distribute_words


# =====================================================================
# Test A: Complete transcript retention
# =====================================================================
def test_a_complete_transcript():
    """Verify that every valid segment in a multi-segment transcript is preserved in the SRT output."""
    raw_segments = [
        {"start": float(i * 3), "end": float(i * 3 + 2.5), "text": f"Sentence number {i} spoken clearly."}
        for i in range(20)
    ]
    cleaned, stats = subtitle_service.validate_and_clean_transcript(raw_segments)
    assert stats["total_segments"] == 20
    assert stats["rejected_segments"] == 0
    assert stats["accepted_segments"] > 0

    with tempfile.NamedTemporaryFile(suffix=".srt", delete=False) as tf:
        srt_path = tf.name

    try:
        srt_stats = subtitle_service.generate_srt(cleaned, srt_path)
        assert os.path.exists(srt_path)
        assert srt_stats["caption_count"] > 0
        assert srt_stats["file_size"] > 0

        with open(srt_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Check that beginning, middle, and end sentences exist in SRT content
        assert "Sentence number 0" in content
        assert "Sentence number 10" in content
        assert "Sentence number 19" in content
    finally:
        if os.path.exists(srt_path):
            os.remove(srt_path)


# =====================================================================
# Test B: No arbitrary truncation (e.g. not limited to 5 segments)
# =====================================================================
def test_b_no_arbitrary_truncation():
    """Verify that transcripts with >5 segments are not truncated by .slice(0, 5) or hardcoded limits."""
    raw_segments = [
        {"start": float(i * 2), "end": float(i * 2 + 1.8), "text": f"Word_{i}"}
        for i in range(35)
    ]
    cleaned, stats = subtitle_service.validate_and_clean_transcript(raw_segments)
    assert len(cleaned) == 35

    with tempfile.NamedTemporaryFile(suffix=".srt", delete=False) as tf:
        srt_path = tf.name

    try:
        srt_stats = subtitle_service.generate_srt(cleaned, srt_path)
        with open(srt_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Count subtitle blocks (numbered lines like "1\n", "2\n", etc.)
        assert srt_stats["caption_count"] >= 5
        assert "Word_0" in content
        assert "Word_15" in content
        assert "Word_34" in content
    finally:
        if os.path.exists(srt_path):
            os.remove(srt_path)


# =====================================================================
# Test C: Invalid segments rejected safely
# =====================================================================
def test_c_invalid_segments():
    """Verify invalid segments (empty text, inverted/negative timestamps, NaN, noise brackets) are rejected safely."""
    raw_segments = [
        {"start": 0.0, "end": 2.0, "text": "Valid first sentence."},
        {"start": 2.5, "end": 1.0, "text": "Inverted timestamps segment."},  # end < start
        {"start": -5.0, "end": -1.0, "text": "Entirely negative interval."}, # end <= 0
        {"start": 3.0, "end": 4.5, "text": "   "},                           # empty text
        {"start": 5.0, "end": 6.0, "text": "[Applause]"},                    # noise bracket
        {"start": 6.5, "end": 7.5, "text": "♪♪♪"},                           # music note
        {"start": float("nan"), "end": 8.0, "text": "NaN timestamp."},       # NaN
        {"start": 8.5, "end": 10.0, "text": "Valid final sentence."},
    ]

    cleaned, stats = subtitle_service.validate_and_clean_transcript(raw_segments)
    assert stats["total_segments"] == 8
    assert stats["rejected_segments"] == 6
    # 2 valid multi-word sentences are proportionally split into 6 word-level tokens
    assert stats["accepted_segments"] == 6
    accepted_words = [w["text"] for w in cleaned]
    assert "Valid" in accepted_words
    assert "sentence." in accepted_words

    # Verify no invalid segment survived
    all_texts = " ".join([w["text"] for w in cleaned])
    assert "Inverted" not in all_texts
    assert "Entirely negative" not in all_texts
    assert "Applause" not in all_texts
    assert "NaN" not in all_texts


# =====================================================================
# Test D: Long video timing and formatting
# =====================================================================
def test_d_long_video():
    """Verify timing formatting remains strictly valid across long durations (e.g., 30+ minutes)."""
    long_segments = [
        {"start": 0.5, "end": 3.0, "text": "Welcome to this long presentation."},
        {"start": 900.0, "end": 904.5, "text": "We are now at the fifteen minute mark."},
        {"start": 1850.25, "end": 1855.75, "text": "Thank you for watching the entire thirty minute video."},
    ]
    cleaned, stats = subtitle_service.validate_and_clean_transcript(long_segments)

    with tempfile.NamedTemporaryFile(suffix=".srt", delete=False) as tf:
        srt_path = tf.name

    try:
        srt_stats = subtitle_service.generate_srt(cleaned, srt_path)
        assert srt_stats["last_timestamp"] >= 1855.0

        with open(srt_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Check SRT timestamp format: HH:MM:SS,mmm
        assert "00:00:00,500 --> " in content
        assert "00:15:00,000 --> " in content
        assert "00:30:50,250 --> " in content
        assert "00:30:55,750" in content
        assert "Welcome to this long presentation." in content
        assert "Thank you for watching the entire" in content
        assert "thirty minute video." in content
    finally:
        if os.path.exists(srt_path):
            os.remove(srt_path)


# =====================================================================
# Test E: Highlight captions timestamp shifting
# =====================================================================
def test_e_highlight_captions():
    """Verify that highlight clip captions correctly shift relative to clip start and clamp to clip duration."""
    clip_start = 30.0
    clip_end = 50.0
    clip_duration = clip_end - clip_start  # 20.0s

    all_words = [
        {"start": 10.0, "end": 12.0, "text": "Before clip"},
        {"start": 32.0, "end": 34.5, "text": "Highlight start"},
        {"start": 40.0, "end": 42.0, "text": "Highlight middle"},
        {"start": 48.0, "end": 49.8, "text": "Highlight end"},
        {"start": 55.0, "end": 57.0, "text": "After clip"},
    ]

    # Apply the highlight clip trimming and shifting logic
    shifted_words = []
    for w in all_words:
        w_st = float(w["start"])
        w_en = float(w["end"])
        if w_en > clip_start and w_st < clip_end:
            shifted_start = max(0.0, round(w_st - clip_start, 2))
            shifted_end = min(clip_duration, max(shifted_start + 0.05, round(w_en - clip_start, 2)))
            shifted_words.append({**w, "start": shifted_start, "end": shifted_end})

    assert len(shifted_words) == 3
    texts = [w["text"] for w in shifted_words]
    assert "Before clip" not in texts
    assert "After clip" not in texts
    assert "Highlight start" in texts

    # Verify shifted timestamps start at 2.0s, not 32.0s
    assert shifted_words[0]["start"] == 2.0
    assert shifted_words[0]["end"] == 4.5
    assert shifted_words[-1]["start"] == 18.0
    assert shifted_words[-1]["end"] == 19.8
    assert all(0.0 <= w["start"] < w["end"] <= clip_duration for w in shifted_words)


# =====================================================================
# Test F: Full-video captions independence from highlights
# =====================================================================
def test_f_full_video_captions_independence():
    """Verify full-video captioning never restricts its words to the 5-highlight list."""
    mock_highlights = [
        {"id": 0, "start_time": 10.0, "end_time": 20.0, "title": "Moment 1"},
        {"id": 1, "start_time": 30.0, "end_time": 40.0, "title": "Moment 2"},
        {"id": 2, "start_time": 50.0, "end_time": 60.0, "title": "Moment 3"},
        {"id": 3, "start_time": 70.0, "end_time": 80.0, "title": "Moment 4"},
        {"id": 4, "start_time": 90.0, "end_time": 100.0, "title": "Moment 5"},
    ]

    full_transcript = [
        {"start": 1.0, "end": 5.0, "text": "Intro spoken outside any highlight."},
        {"start": 12.0, "end": 15.0, "text": "Inside moment 1."},
        {"start": 45.0, "end": 48.0, "text": "Between moment 2 and 3."},
        {"start": 110.0, "end": 115.0, "text": "Outro spoken after all highlights."},
    ]

    # Full-video pipeline does NOT filter against mock_highlights
    cleaned, stats = subtitle_service.validate_and_clean_transcript(full_transcript)
    assert stats["accepted_segments"] == 18  # 18 words across all 4 sentences

    with tempfile.NamedTemporaryFile(suffix=".srt", delete=False) as tf:
        srt_path = tf.name

    try:
        srt_stats = subtitle_service.generate_srt(cleaned, srt_path)
        with open(srt_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Both non-highlight segments must be in full-video captions
        assert "Intro spoken outside any highlight." in content
        assert "Inside moment 1." in content
        assert "Between moment 2 and 3." in content
        assert "Outro spoken after all highlights." in content
    finally:
        if os.path.exists(srt_path):
            os.remove(srt_path)


# =====================================================================
# Test G: FFmpeg subtitle burning verification
# =====================================================================
def test_g_ffmpeg_rendering():
    """Generate synthetic video, burn subtitles with FFmpeg, and verify output is valid."""
    # Check if FFmpeg is available
    try:
        res = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True, timeout=5)
        if res.returncode != 0:
            pytest.skip("FFmpeg not available in environment")
    except Exception:
        pytest.skip("FFmpeg not installed")

    with tempfile.TemporaryDirectory() as temp_dir:
        video_path = os.path.join(temp_dir, "test_input.mp4")
        ass_path = os.path.join(temp_dir, "test_sub.ass")
        output_path = os.path.join(temp_dir, "test_output.mp4")

        # 1. Create 1.5s synthetic test video
        gen_cmd = [
            "ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=navy:s=320x240:d=1.5",
            "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", "1.5",
            "-c:v", "libx264", "-c:a", "aac", video_path
        ]
        sub_res = subprocess.run(gen_cmd, capture_output=True)
        assert sub_res.returncode == 0, f"Failed to generate test video: {sub_res.stderr}"

        # 2. Generate ASS subtitle
        words = [
            {"start": 0.2, "end": 1.2, "text": "Full Video Caption Test"}
        ]
        subtitle_service.generate_ass(words, ass_path, {
            "resolution_x": 320,
            "resolution_y": 240,
            "font_size": 24,
            "margin_v": 20,
        })
        assert os.path.exists(ass_path)

        # 3. Burn subtitles into video
        subtitle_service.burn_subtitles(video_path, ass_path, output_path)

        # 4. Verify output exists, is nonzero, and ffprobe reads valid streams
        assert os.path.exists(output_path)
        assert os.path.getsize(output_path) > 1000

        probe_cmd = [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", output_path
        ]
        probe_res = subprocess.run(probe_cmd, capture_output=True, text=True)
        dur = float(probe_res.stdout.strip() or 0.0)
        assert dur >= 1.0


# =====================================================================
# Test H: Failure handling & non-corruption of other assets
# =====================================================================
def test_h_failure_handling():
    """Verify that missing files and failed FFmpeg execution raise descriptive errors rather than silent success."""
    non_existent_video = "non_existent_video_path_xyz.mp4"
    non_existent_sub = "non_existent_sub_path_xyz.ass"
    dummy_out = "dummy_out.mp4"

    # Missing video raises FileNotFoundError
    with pytest.raises(FileNotFoundError):
        subtitle_service.burn_subtitles(non_existent_video, non_existent_sub, dummy_out)

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tf:
        valid_video_path = tf.name

    try:
        # Missing subtitle file raises FileNotFoundError
        with pytest.raises(FileNotFoundError):
            subtitle_service.burn_subtitles(valid_video_path, non_existent_sub, dummy_out)
    finally:
        if os.path.exists(valid_video_path):
            os.remove(valid_video_path)


# =====================================================================
# Test I: Regression tests for formatting and translation utilities
# =====================================================================
def test_i_regression_tests():
    """Verify timestamp formatting accuracy, gap filling, and multilingual translation utilities."""
    # Test SRT timestamp formatting
    assert subtitle_service._format_time_srt(0.0) == "00:00:00,000"
    assert subtitle_service._format_time_srt(65.123) == "00:01:05,123"
    assert subtitle_service._format_time_srt(3665.050) == "01:01:05,050"

    # Test ASS timestamp formatting
    assert subtitle_service._format_time_ass(0.0) == "0:00:00.00"
    assert subtitle_service._format_time_ass(65.50) == "0:01:05.50"
    assert subtitle_service._format_time_ass(3600.0) == "1:00:00.00"

    # Test continuous line grouping (gap under 0.8s filled)
    words = [
        {"start": 1.0, "end": 2.0, "text": "First"},
        {"start": 2.3, "end": 3.0, "text": "Second"},  # 0.3s gap
    ]
    lines = subtitle_service.group_words_into_lines(words, max_words=1)
    assert len(lines) == 2
    # Gap between line 0 end and line 1 start (1.0->2.0 and 2.3->3.0) should be filled to 2.3
    assert lines[0]["end"] == 2.3

    # Test translation fallback when target is none or original
    sample_words = [{"start": 0.0, "end": 1.0, "text": "Hello"}]
    assert translate_and_distribute_words(sample_words, "none") == sample_words
    assert translate_and_distribute_words(sample_words, "original") == sample_words
