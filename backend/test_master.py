import os
import sys

# Ensure app is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), 'app')))

from app.services.master_agent import master_agent
from app.services.transcription_service import transcription_service
from app.services.content_understanding_service import content_understanding_service
from app.services.smart_cropping_service import smart_cropping_service
from app.services.video_processor import VideoProcessor
import logging

logging.basicConfig(level=logging.INFO)

def run_master_test():
    os.makedirs("uploads", exist_ok=True)
    video_path = "uploads/mock_master_video.mp4"
    audio_wav_path = "uploads/mock_master_video_audio.wav"
    
    # Create a 75-second mock video so we can test highlights up to 75 seconds
    print("Creating mock 75s video with sine wave audio...")
    os.system(f"ffmpeg -y -f lavfi -i color=c=blue:s=640x480:d=75 -f lavfi -i sine=frequency=440:duration=75 -c:v libx264 -c:a aac -shortest {video_path}")

    print("Extracting mock WAV audio track...")
    os.system(f"ffmpeg -y -i {video_path} -q:a 0 -map a {audio_wav_path}")

    # Save original functions to restore them later
    original_transcribe = transcription_service.transcribe
    original_analyze = content_understanding_service.analyze
    original_crop = smart_cropping_service.generate_crop_metadata
    original_processor = VideoProcessor.process

    # 1. Mock smart cropping trajectory
    def mock_crop(path, target_fps=5):
        print("[MOCK] Generating crop")
        traj = []
        for i in range(1000):
            traj.append({
                "timestamp": i / 5.0,
                "x": 0, "y": 0, "width": 640, "height": 480
            })
        return {"trajectory": traj}
    smart_cropping_service.generate_crop_metadata = mock_crop

    # 2. Mock prompt parsing & music recommendation to avoid LLM timeouts
    from app.services.prompt_editing_agent import prompt_editing_agent
    from app.services.music_agent import music_agent
    original_parse = prompt_editing_agent.parse_prompt
    original_recommend = music_agent.recommend_music

    def mock_parse(prompt):
        print(f"[MOCK] Parsing prompt: {prompt}")
        return {
            "cuts": "standard",
            "zooms": "none",
            "caption_style": "standard",
            "music_style": "none",
            "language": "en"
        }
    prompt_editing_agent.parse_prompt = mock_parse

    def mock_recommend(analysis):
        print(f"[MOCK] Recommending music: {analysis}")
        return None
    music_agent.recommend_music = mock_recommend

    try:
        # -------------------------------------------------------------
        # TEST CASE 1: Short Video (<= 5 mins) with Long Highlight (> 60s)
        # Should split into two parts: Part 1 (60s) and Part 2 (15s)
        # -------------------------------------------------------------
        print("\n=======================================================")
        print("TEST CASE 1: Short Video (75s) with 75s Highlight (Standard LLM Flow)")
        print("=======================================================")

        def mock_process_short(self, path):
            return {
                "duration": 75.0,
                "resolution": "640x480",
                "fps": 25.0,
                "bitrate": "1000k",
                "audio_path": audio_wav_path,
                "frame_directory": "",
                "short_path": ""
            }
        VideoProcessor.process = mock_process_short

        # Return >= 5 elements to bypass the gameplay/audio fallback check
        def mock_transcribe_short(path):
            return [
                {"start": 10.0, "end": 12.0, "text": "This"},
                {"start": 12.0, "end": 14.0, "text": "is"},
                {"start": 14.0, "end": 16.0, "text": "a"},
                {"start": 16.0, "end": 18.0, "text": "short"},
                {"start": 18.0, "end": 20.0, "text": "video"},
                {"start": 20.0, "end": 75.0, "text": "transcript."}
            ]
        transcription_service.transcribe = mock_transcribe_short

        def mock_analyze_short(transcript, metadata):
            return {
                "topic": "Gaming Tips",
                "summary": "Highlight showing strategies.",
                "importance_scores": [
                    {"start": 0.0, "end": 75.0, "score": 10, "reason": "Highlight region of interest"}
                ]
            }
        content_understanding_service.analyze = mock_analyze_short

        results1 = master_agent.generate_shorts(
            video_path=video_path,
            platform="youtube",
            optional_prompt="Split test"
        )
        print("RESULTS 1:")
        for r in results1:
            print(f"- {r}")

        # -------------------------------------------------------------
        # TEST CASE 2: Long Video (> 5 mins)
        # Should restrict to single 30s clip and prepend theme
        # -------------------------------------------------------------
        print("\n=======================================================")
        print("TEST CASE 2: Long Video (350s) with 40s Highlight (Theme Mode)")
        print("=======================================================")

        def mock_process_long(self, path):
            return {
                "duration": 350.0,
                "resolution": "640x480",
                "fps": 25.0,
                "bitrate": "1000k",
                "audio_path": audio_wav_path,
                "frame_directory": "",
                "short_path": ""
            }
        VideoProcessor.process = mock_process_long

        # Return >= 5 elements to bypass the gameplay/audio fallback check
        def mock_transcribe_long(path):
            return [
                {"start": 15.0, "end": 16.0, "text": "Welcome"},
                {"start": 16.0, "end": 17.0, "text": "to"},
                {"start": 17.0, "end": 18.0, "text": "the"},
                {"start": 18.0, "end": 19.0, "text": "theme"},
                {"start": 19.0, "end": 20.0, "text": "test."}
            ]
        transcription_service.transcribe = mock_transcribe_long

        def mock_analyze_long(transcript, metadata):
            return {
                "topic": "Machine Learning Explained",
                "summary": "Intro to neural networks.",
                "importance_scores": [
                    {"start": 10.0, "end": 50.0, "score": 9, "reason": "Excellent explanation"}
                ]
            }
        content_understanding_service.analyze = mock_analyze_long

        results2 = master_agent.generate_shorts(
            video_path=video_path,
            platform="youtube",
            optional_prompt="Theme test"
        )
        print("RESULTS 2:")
        for r in results2:
            print(f"- {r}")

        # -------------------------------------------------------------
        # TEST CASE 3: Gameplay Video with Empty Transcript (Fallback)
        # Should trigger audio peak highlight algorithm and pass successfully
        # -------------------------------------------------------------
        print("\n=======================================================")
        print("TEST CASE 3: Gameplay Video (75s) with Empty Transcript (Fallback Mode)")
        print("=======================================================")

        def mock_process_gameplay(self, path):
            return {
                "duration": 75.0,
                "resolution": "640x480",
                "fps": 25.0,
                "bitrate": "1000k",
                "audio_path": audio_wav_path,
                "frame_directory": "",
                "short_path": ""
            }
        VideoProcessor.process = mock_process_gameplay

        # Return empty list to trigger the gameplay/audio peak fallback
        def mock_transcribe_empty(path):
            return []
        transcription_service.transcribe = mock_transcribe_empty

        results3 = master_agent.generate_shorts(
            video_path=video_path,
            platform="youtube",
            optional_prompt="Gameplay fallback test"
        )
        print("RESULTS 3:")
        for r in results3:
            print(f"- {r}")

    finally:
        # Restore original functions
        transcription_service.transcribe = original_transcribe
        content_understanding_service.analyze = original_analyze
        smart_cropping_service.generate_crop_metadata = original_crop
        VideoProcessor.process = original_processor
        prompt_editing_agent.parse_prompt = original_parse
        music_agent.recommend_music = original_recommend

if __name__ == "__main__":
    run_master_test()
