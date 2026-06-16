import os
import sys

# Ensure app is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), 'app')))

from app.services.prompt_editing_agent import prompt_editing_agent
from app.services.clip_rendering_service import clip_rendering_service
from app.services.transcription_service import transcription_service
from app.services.subtitle_service import subtitle_service
import logging

logging.basicConfig(level=logging.INFO)

def run_agent_test():
    prompt = "Make it more energetic with Tamil captions and frequent zooms!"
    print(f"Testing Prompt: '{prompt}'")
    
    # 1. Parse prompt
    instructions = prompt_editing_agent.parse_prompt(prompt)
    print("Parsed Instructions:", instructions)
    
    video_path = "uploads\\9723e137-d396-4122-8bda-03c15d1dd6c2.mp4"
    if not os.path.exists(video_path):
        print("Video not found. Skipping full edit pipeline test.")
        return

    # 2. Render Clip with zooms
    trajectory = []
    for i in range(120): # 5 seconds
        t = i / 24.0
        trajectory.append({
            "timestamp": t,
            "x": int(t / 5.0 * 580),
            "y": 0,
            "width": 268,
            "height": 478
        })

    output_path = "test_agent_clip.mp4"
    print("Rendering clip with dynamic zooms...")
    clip_rendering_service.render_clip(
        video_path=video_path,
        output_path=output_path,
        start_time=0.0,
        end_time=5.0,
        crop_trajectory=trajectory,
        editing_instructions=instructions
    )
    
    # 3. Transcription & Translation
    print("Transcribing...")
    words = transcription_service.transcribe(output_path)
    
    if instructions.get("language") != "en":
        print(f"Translating to {instructions['language']}...")
        words = prompt_editing_agent.translate_transcript(words, instructions['language'])
        
    # 4. Generate & Burn Subtitles
    subtitle_path = "test_agent_clip.ass"
    final_output = "test_agent_final.mp4"
    
    style_config = {
        "caption_style": instructions.get("caption_style", "standard")
    }
    
    print(f"Generating ASS subtitles with style '{style_config['caption_style']}'...")
    subtitle_service.generate_ass(words, subtitle_path, style_config)
    
    print("Burning subtitles...")
    subtitle_service.burn_subtitles(output_path, subtitle_path, final_output)
    print(f"Success! Output saved to {final_output}")

if __name__ == "__main__":
    run_agent_test()
