import os
import sys

# Ensure app is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), 'app')))

from app.services.clip_rendering_service import clip_rendering_service
from app.services.transcription_service import transcription_service
from app.services.subtitle_service import subtitle_service

def run_test():
    video_path = "uploads\\9723e137-d396-4122-8bda-03c15d1dd6c2.mp4"
    if not os.path.exists(video_path):
        print("Video not found.")
        return

    # Create dummy crop trajectory (e.g. pan from left to right over 5 seconds)
    trajectory = []
    # Video is 848x478. 9:16 crop width is 478 * (9/16) = 268.
    for i in range(120): # 24 fps * 5 seconds
        t = i / 24.0
        # Pan x from 0 to 848-268=580
        x = int(t / 5.0 * 580)
        trajectory.append({
            "timestamp": t,
            "x": x,
            "y": 0,
            "width": 268,
            "height": 478
        })

    output_path = "test_clip_output.mp4"
    
    print("Starting clip rendering test...")
    try:
        res = clip_rendering_service.render_clip(
            video_path=video_path,
            output_path=output_path,
            start_time=0.0,
            end_time=5.0,
            crop_trajectory=trajectory
        )
        print("Rendering Success! Output at:", res)
        
        print("Transcribing clip...")
        words = transcription_service.transcribe(output_path)
        
        subtitle_path = "test_clip_output.ass"
        final_output = "test_clip_output_subbed.mp4"
        style_config = {
            "font_name": "Montserrat",
            "font_size": 24,
            "primary_color": "#FFFFFF",
            "highlight_color": "#FFFF00", # Yellow
            "outline_color": "#000000",
            "back_color": "#000000",
            "bold": True,
            "outline_size": 2,
            "shadow_size": 1,
        }
        
        print("Generating subtitles...")
        subtitle_service.generate_ass(words, subtitle_path, style_config)
        
        print("Burning subtitles to video...")
        subtitle_service.burn_subtitles(output_path, subtitle_path, final_output)
        
        print("Success! Final output at:", final_output)

    except Exception as e:
        print("Error during processing:", e)

if __name__ == "__main__":
    run_test()
