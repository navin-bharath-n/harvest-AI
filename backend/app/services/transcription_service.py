import os
# Disable Hugging Face symlinks warning/error on Windows by forcing copies
os.environ["HF_HUB_DISABLE_SYMLINKS"] = "1"

import logging
from faster_whisper import WhisperModel
import subprocess

logger = logging.getLogger(__name__)

class TranscriptionService:
    def __init__(self, model_size="small"):
        self.model_size = model_size
        self.whisper_model = None
        self.use_google = False
        self._google_quota_exhausted = False
        
        self.device_name = "auto"
        self.comp_type = "default"
        try:
            import torch
            self.device_name = "cuda" if torch.cuda.is_available() else "cpu"
            self.comp_type = "float16" if self.device_name == "cuda" else "int8"
        except ImportError:
            pass
            
        # Heavy models (like large-v3) are too slow and cause bottlenecks on CPU.
        # Downgrade to 'small' automatically if CPU is used.
        if self.device_name == "cpu" and self.model_size in ["large", "large-v1", "large-v2", "large-v3", "medium"]:
            logger.info(f"CPU detected. Automatically downgrading Whisper model from {self.model_size} to small for performance.")
            self.model_size = "small"

        # Check if Google Application Credentials file path is set in the environment or settings
        gcp_creds = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
        if not gcp_creds:
            try:
                # Try to load from .env file directly if present
                backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
                env_path = os.path.join(backend_dir, ".env")
                if os.path.exists(env_path):
                    with open(env_path, "r", encoding="utf-8") as f:
                        for line in f:
                            if line.strip().startswith("GOOGLE_APPLICATION_CREDENTIALS"):
                                _, val = line.strip().split("=", 1)
                                gcp_creds = val.strip().strip('"').strip("'").strip()
                                if gcp_creds:
                                    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = gcp_creds
                                break
            except Exception as e:
                logger.debug(f"Failed to parse .env for credentials: {e}")

        if gcp_creds:
            if not os.path.exists(gcp_creds):
                # Try to locate the file in the backend root directory
                backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
                candidate = os.path.abspath(os.path.join(backend_dir, os.path.basename(gcp_creds)))
                if os.path.exists(candidate):
                    gcp_creds = candidate
                    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = gcp_creds
                else:
                    gcp_creds = None

        groq_key = (os.environ.get("GROQ_API_KEY", "")).strip()
        if not groq_key:
            try:
                from app.core.config import settings
                groq_key = (settings.GROQ_API_KEY or "").strip()
            except Exception:
                pass

        if groq_key:
            self.use_google = False
            logger.info("Groq Cloud Whisper configured as primary ultra-fast transcription engine (~2s, 0% CPU).")
        elif gcp_creds and os.path.exists(gcp_creds):
            try:
                from google.cloud import speech
                self.use_google = True
                logger.info("Google Cloud Speech-to-Text configuration found. Using Google STT as primary transcription engine.")
            except ImportError:
                logger.debug("google-cloud-speech library not found. Falling back to local Whisper.")
            except Exception as e:
                logger.debug(f"Failed to initialize Google Speech-to-Text: {e}")
        else:
            self.use_google = False
            logger.info("Using local Faster-Whisper for audio transcription.")

    def _is_quota_error(self, error):
        """Check if the error is a Google Cloud quota/resource exhausted error."""
        error_str = str(error).lower()
        quota_keywords = ["resource exhausted", "quota", "429", "rate limit", "billing", "unauthorized", "invalid_grant", "credentials"]
        return any(kw in error_str for kw in quota_keywords)

    def _ensure_whisper_loaded(self):
        """Lazily load the local Whisper model on demand to save resources and boot faster."""
        if not self.whisper_model:
            try:
                logger.info(f"Lazily loading WhisperModel ({self.model_size}) on device '{self.device_name}' with compute_type '{self.comp_type}'...")
                self.whisper_model = WhisperModel(self.model_size, device=self.device_name, compute_type=self.comp_type)
                logger.info(f"Loaded WhisperModel ({self.model_size}) successfully.")
            except Exception as e:
                logger.error(f"Failed to load WhisperModel: {e}")
                raise

    def _transcribe_groq(self, audio_path: str):
        """
        Transcribes audio using Groq Cloud Whisper API (whisper-large-v3).
        Takes ~2-4 seconds with 0% local CPU usage on 1-vCPU servers.
        """
        from openai import OpenAI
        from app.core.config import settings

        groq_key = (settings.GROQ_API_KEY or os.environ.get("GROQ_API_KEY", "")).strip()
        if not groq_key:
            raise ValueError("GROQ_API_KEY is not configured")

        logger.info(f"Transcribing audio with Groq Cloud Whisper ({audio_path})...")

        # Ensure file size is below Groq's 25MB limit (compress if needed)
        target_path = audio_path
        cleanup_temp = False
        try:
            if os.path.getsize(audio_path) > 23 * 1024 * 1024:
                compressed_path = audio_path.replace(".wav", "_compressed.mp3")
                comp_cmd = ["ffmpeg", "-y", "-i", audio_path, "-ac", "1", "-ar", "16000", "-b:a", "64k", compressed_path]
                subprocess.run(comp_cmd, capture_output=True, check=True)
                target_path = compressed_path
                cleanup_temp = True

            client = OpenAI(
                base_url="https://api.groq.com/openai/v1",
                api_key=groq_key
            )

            with open(target_path, "rb") as audio_file:
                resp = client.audio.transcriptions.create(
                    model="whisper-large-v3",
                    file=audio_file,
                    response_format="verbose_json",
                    timestamp_granularities=["word"]
                )

            transcript = []
            words = getattr(resp, "words", None)
            if words:
                for w in words:
                    if isinstance(w, dict):
                        text = w.get("word", "")
                        st = float(w.get("start", 0.0))
                        en = float(w.get("end", 0.0))
                    else:
                        text = getattr(w, "word", "") or ""
                        st = float(getattr(w, "start", 0.0))
                        en = float(getattr(w, "end", 0.0))
                    if text.strip():
                        transcript.append({"start": round(st, 2), "end": round(en, 2), "text": text.strip()})
            else:
                segments = getattr(resp, "segments", None) or []
                for seg in segments:
                    seg_words = seg.get("words", []) if isinstance(seg, dict) else getattr(seg, "words", [])
                    if seg_words:
                        for w in seg_words:
                            text = w.get("word", "") if isinstance(w, dict) else getattr(w, "word", "")
                            st = float(w.get("start", 0.0) if isinstance(w, dict) else getattr(w, "start", 0.0))
                            en = float(w.get("end", 0.0) if isinstance(w, dict) else getattr(w, "end", 0.0))
                            if text.strip():
                                transcript.append({"start": round(st, 2), "end": round(en, 2), "text": text.strip()})
                    else:
                        text = seg.get("text", "") if isinstance(seg, dict) else getattr(seg, "text", "")
                        st = float(seg.get("start", 0.0) if isinstance(seg, dict) else getattr(seg, "start", 0.0))
                        en = float(seg.get("end", 0.0) if isinstance(seg, dict) else getattr(seg, "end", 0.0))
                        if text.strip():
                            transcript.append({"start": round(st, 2), "end": round(en, 2), "text": text.strip()})

            logger.info(f"Groq Cloud transcription complete. Extracted {len(transcript)} words.")
            return transcript
        finally:
            if cleanup_temp and os.path.exists(target_path):
                try:
                    os.remove(target_path)
                except Exception:
                    pass

    def transcribe(self, audio_path: str):
        """
        Transcribe an audio file and return word-level timestamps.
        Priority:
          1. Groq Cloud Whisper (fastest ~2s, free tier, 0% CPU)
          2. Google Cloud STT (if configured)
          3. Local Faster-Whisper CPU (resilient local fallback)
        Output format: list of dictionaries {"start": float, "end": float, "text": str}
        """
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file not found at {audio_path}")

        # 1. Try Groq Cloud Whisper first if GROQ_API_KEY is available
        from app.core.config import settings
        groq_key = (settings.GROQ_API_KEY or os.environ.get("GROQ_API_KEY", "")).strip()
        if groq_key:
            try:
                return self._transcribe_groq(audio_path)
            except Exception as ge:
                logger.warning(f"Groq Cloud transcription failed ({ge}). Falling back to secondary provider...")

        # 2. Try Google Cloud STT if configured
        if self.use_google and not self._google_quota_exhausted:
            try:
                return self._transcribe_google(audio_path)
            except Exception as e:
                if self._is_quota_error(e):
                    logger.warning(f"Google Cloud STT quota exhausted or credentials issue! Switching permanently to local Whisper. Error: {e}")
                    self._google_quota_exhausted = True
                else:
                    logger.error(f"Google Cloud Speech-to-Text failed: {e}. Falling back to local Whisper...")
                
                self._ensure_whisper_loaded()
                return self._transcribe_whisper(audio_path)
        else:
            if self._google_quota_exhausted:
                logger.info("Using local Whisper (Google STT quota/credentials issue).")
            self._ensure_whisper_loaded()
            return self._transcribe_whisper(audio_path)

    def _transcribe_whisper(self, audio_path: str):
        logger.info(f"Starting Whisper transcription for {audio_path}")

        segments, info = self.whisper_model.transcribe(
            audio_path,
            beam_size=5,
            vad_filter=True,
            word_timestamps=True,
            condition_on_previous_text=False,
            no_speech_threshold=0.6,
            log_prob_threshold=-1.0,
            compression_ratio_threshold=2.4
        )

        logger.info(
            f"Detected language: {info.language} "
            f"(probability={info.language_probability:.2f})"
        )

        transcript = []

        for segment in segments:
            logger.info(
                f"[{segment.start:.2f}s -> {segment.end:.2f}s] "
                f"{segment.text}"
            )

            if segment.words:
                for word in segment.words:
                    if word.word.strip():
                        transcript.append({
                            "start": float(word.start),
                            "end": float(word.end),
                            "text": word.word.strip()
                        })
            else:
                transcript.append({
                    "start": float(segment.start),
                    "end": float(segment.end),
                    "text": segment.text.strip()
                })

        logger.info(
            f"Transcription complete. "
            f"Language={info.language}, "
            f"Words={len(transcript)}"
        )

        return transcript

    def _transcribe_google(self, audio_path: str):
        logger.info(f"Starting Google Cloud Speech-to-Text transcription for {audio_path}")
        from google.cloud import speech
        import io
        
        # Google Speech-to-Text works best with mono, LINEAR16 PCM audio at 22050Hz
        # Convert it to a temporary standard mono WAV file first to guarantee encoding compatibility
        temp_wav = audio_path.replace(".wav", "_gcp_temp.wav")
        cmd = [
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", audio_path,
            "-acodec", "pcm_s16le",
            "-ar", "22050",
            "-ac", "1",
            temp_wav
        ]
        subprocess.run(cmd, capture_output=True, check=True)
        
        transcript = []
        try:
            client = speech.SpeechClient()
            with io.open(temp_wav, "rb") as audio_file:
                content = audio_file.read()
                
            audio = speech.RecognitionAudio(content=content)
            config = speech.RecognitionConfig(
                encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
                sample_rate_hertz=22050,
                language_code="en-US",
                alternative_language_codes=[
                    "ta-IN",
                    "hi-IN",
                    "te-IN",
                    "ml-IN",
                    "kn-IN",
                    "es-ES",
                    "fr-FR",
                    "de-DE",
                    "it-IT",
                    "pt-PT",
                    "ja-JP",
                    "ko-KR",
                    "zh-CN",
                    "ar-SA",
                    "ru-RU",
                    "tr-TR"
                ],
                enable_word_time_offsets=True,
            )
            
            response = client.recognize(config=config, audio=audio)
            
            for result in response.results:
                alternative = result.alternatives[0]
                for word_info in alternative.words:
                    start_time = word_info.start_time.total_seconds()
                    end_time = word_info.end_time.total_seconds()
                    word = word_info.word
                    transcript.append({
                        "start": start_time,
                        "end": end_time,
                        "text": word
                    })
            
            logger.info(f"Google Cloud STT transcription complete. Total words: {len(transcript)}")
            return transcript
        finally:
            if os.path.exists(temp_wav):
                os.remove(temp_wav)
            logger.info("=== TRANSCRIPT DEBUG ===")

            for item in transcript[:50]:
                logger.info(item)

            logger.info("========================")

transcription_service = TranscriptionService(model_size="large-v3")
# Trigger reload: detected gcp-key.json added.
