import os
import sys

# Ensure app is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), 'app')))

from app.services.transcription_service import TranscriptionService

def run_tests():
    print("Initializing TranscriptionService...")
    # Initialize service with tiny model size for fast test
    service = TranscriptionService(model_size="tiny")
    
    # Verify that whisper_model is initially None (lazy loading)
    print("Verifying WhisperModel is not preloaded...")
    assert service.whisper_model is None, "Whisper model was preloaded during initialization!"
    print("OK: Whisper model is NOT preloaded initially.")
    
    # Trigger fallback or force load
    print("\nSimulating Google STT failure / force load...")
    service._ensure_whisper_loaded()
    
    # Verify that it is loaded now
    assert service.whisper_model is not None, "Whisper model was not loaded on demand!"
    print("OK: Whisper model was loaded successfully on demand.")
    
    print("\nAll lazy-loading checks passed successfully!")

if __name__ == "__main__":
    run_tests()
