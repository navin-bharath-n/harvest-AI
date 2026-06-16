import os
from faster_whisper import WhisperModel
import logging

logger = logging.getLogger(__name__)

class TranscriptionService:
    def __init__(self, model_size="base"):
        self.model_size = model_size
        # device="auto" automatically selects "cuda" if GPU is available, else "cpu"
        # compute_type="float16" for GPU, default to "int8" for CPU
        try:
            self.model = WhisperModel(self.model_size, device="auto", compute_type="default")
            logger.info(f"Loaded WhisperModel ({model_size}) on device 'auto'")
        except Exception as e:
            logger.error(f"Failed to load WhisperModel: {e}")
            raise

    def transcribe(self, audio_path: str):
        """
        Transcribe an audio file and return word-level timestamps.
        Output format: list of dictionaries {"start": float, "end": float, "text": str}
        """
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file not found at {audio_path}")
        
        logger.info(f"Starting transcription for {audio_path}")
        
        # We explicitly request word-level timestamps
        segments, info = self.model.transcribe(audio_path, word_timestamps=True)
        
        logger.info(f"Detected language '{info.language}' with probability {info.language_probability}")
        
        transcript = []
        for segment in segments:
            for word in segment.words:
                transcript.append({
                    "start": word.start,
                    "end": word.end,
                    "text": word.word
                })
                
        logger.info(f"Transcription complete for {audio_path}. Total words: {len(transcript)}")
        return transcript

transcription_service = TranscriptionService()
