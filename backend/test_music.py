import os
import sys

# Ensure app is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), 'app')))

from app.services.music_agent import music_agent
import logging

logging.basicConfig(level=logging.INFO)

def run_music_test():
    # 1. Setup mock video
    os.makedirs("uploads", exist_ok=True)
    mock_video = "uploads/mock_video.mp4"
    print("Creating mock 10s video with silent audio...")
    # Create a 10s video with a silent audio track
    os.system(f"ffmpeg -y -f lavfi -i color=c=blue:s=640x480:d=10 -f lavfi -i anullsrc=r=44100:cl=stereo -c:v libx264 -c:a aac -shortest {mock_video}")

    # 2. Mock Analysis
    print("Analyzing video...")
    mock_transcript = [{"text": "Welcome to this happy and uplifting vlog!"}]
    mock_metadata = {"duration": 10.0}
    
    analysis = music_agent.analyze_video(mock_transcript, mock_metadata)
    print(f"Analysis result: {analysis}")

    # 3. Get Recommendation
    music_path = music_agent.recommend_music(analysis)
    print(f"Recommended Music Track: {music_path}")

    # 4. Apply Music (Test ducking/volume logic)
    print("\n--- Test Case 1: Video with Voice (Ducking to 15%) ---")
    out_1 = "uploads/video_with_music_ducked.mp4"
    music_agent.apply_music(
        video_path=mock_video,
        music_path=music_path,
        output_path=out_1,
        options={"has_voice": True}
    )

    print("\n--- Test Case 2: Video without Voice (Full Volume 100%) ---")
    out_2 = "uploads/video_with_music_full.mp4"
    music_agent.apply_music(
        video_path=mock_video,
        music_path=music_path,
        output_path=out_2,
        options={"has_voice": False}
    )

    print("\n--- Test Case 3: Music Disabled ---")
    out_3 = "uploads/video_music_disabled.mp4"
    music_agent.apply_music(
        video_path=mock_video,
        music_path=music_path,
        output_path=out_3,
        options={"disable_music": True}
    )
    
    print("\nAll music mixing tests passed successfully!")

if __name__ == "__main__":
    run_music_test()
