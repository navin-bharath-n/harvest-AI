import os
import sys

# Ensure app is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), 'app')))

from app.services.voice_service import voice_service
import logging

logging.basicConfig(level=logging.INFO)

def run_voice_test():
    # Ensure uploads dir exists for testing
    os.makedirs("uploads", exist_ok=True)
    
    # 1. Create a dummy "original audio" (e.g. 10 seconds of tone)
    original_audio = "uploads/dummy_original.wav"
    os.system(f"ffmpeg -y -f lavfi -i sine=frequency=440:duration=10 -c:a pcm_s16le {original_audio}")

    # 2. Extract a 5-second sample to use as the cloned speaker target
    speaker_wav = "uploads/speaker_sample.wav"
    os.system(f"ffmpeg -y -i {original_audio} -t 5 {speaker_wav}")

    print("Testing Voice Service Generation & Time-Stretching...")
    
    # We have 2 segments
    segments = [
        {"text": "Hello, this is a test of the translated voice.", "start": 1.0, "end": 4.0}, # Target dur: 3.0s
        {"text": "And this is the second sentence.", "start": 5.5, "end": 8.0}  # Target dur: 2.5s
    ]
    
    processed_segments = []
    
    for i, seg in enumerate(segments):
        raw_wav = f"uploads/raw_{i}.wav"
        stretched_wav = f"uploads/stretched_{i}.wav"
        
        target_dur = seg["end"] - seg["start"]
        
        print(f"Generating segment {i}...")
        voice_service.generate_speech(
            text=seg["text"],
            language="hi", # Test Hindi or any language
            speaker_wav=speaker_wav,
            output_path=raw_wav
        )
        
        print(f"Stretching segment {i} to {target_dur}s...")
        voice_service.match_pacing(raw_wav, target_dur, stretched_wav)
        
        processed_segments.append({
            "path": stretched_wav,
            "start": seg["start"]
        })
        
    print("Compiling full voiceover track...")
    compiled_voiceover = "uploads/compiled_voiceover.wav"
    voice_service.compile_voiceover(processed_segments, total_duration=10.0, output_wav=compiled_voiceover)
    
    print("Mixing final audio with 'mix' mode (ducking original)...")
    final_mixed_audio = "uploads/final_mixed.wav"
    voice_service.mix_audio(
        original_audio=original_audio,
        voiceover_audio=compiled_voiceover,
        mode="mix",
        output_path=final_mixed_audio
    )
    
    print(f"Voice generation pipeline complete! Result saved at {final_mixed_audio}")

if __name__ == "__main__":
    run_voice_test()
