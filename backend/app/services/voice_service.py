import os
import subprocess
import logging
import uuid
import json
from pathlib import Path
from typing import List, Dict

logger = logging.getLogger(__name__)

class VoiceService:
    def __init__(self, use_mock=False):
        self.use_mock = use_mock
        self.model = None
        
        if not self.use_mock:
            try:
                from TTS.api import TTS
                import torch
                # Get device
                device = "cuda" if torch.cuda.is_available() else "cpu"
                logger.info(f"Loading XTTS-v2 model on {device}...")
                # Initialize XTTS-v2
                self.model = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
                logger.info("XTTS-v2 loaded successfully.")
            except ImportError:
                logger.warning("TTS package not found. Running in MOCK mode. Please 'pip install TTS' to use XTTS-v2.")
                self.use_mock = True
            except Exception as e:
                logger.error(f"Failed to load XTTS-v2: {e}")
                self.use_mock = True

    def generate_speech(self, text: str, language: str, speaker_wav: str, output_path: str):
        """
        Generates cloned speech for the given text.
        """
        if not os.path.exists(speaker_wav):
            raise FileNotFoundError(f"Speaker reference WAV not found: {speaker_wav}")

        if self.use_mock:
            logger.info(f"[MOCK] Generating voice for text: '{text}' in {language}")
            # Generate a 1-second silent WAV as a mock
            cmd = ['ffmpeg', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '1', '-q:a', '9', '-acodec', 'libmp3lame', output_path]
            subprocess.run(cmd, capture_output=True, check=True)
            return output_path

        # Supported languages by XTTS: en, es, fr, de, it, pt, pl, tr, ru, nl, cs, ar, zh-cn, ja, hu, ko, hi
        # Map user languages to XTTS supported languages
        lang_map = {
            "english": "en", "en": "en",
            "spanish": "es", "es": "es",
            "french": "fr", "fr": "fr",
            "german": "de", "de": "de",
            "italian": "it", "it": "it",
            "portuguese": "pt", "pt": "pt",
            "polish": "pl", "pl": "pl",
            "turkish": "tr", "tr": "tr",
            "russian": "ru", "ru": "ru",
            "dutch": "nl", "nl": "nl",
            "czech": "cs", "cs": "cs",
            "arabic": "ar", "ar": "ar",
            "chinese": "zh-cn", "zh": "zh-cn",
            "japanese": "ja", "ja": "ja",
            "hungarian": "hu", "hu": "hu",
            "korean": "ko", "ko": "ko",
            "hindi": "hi", "hi": "hi"
        }
        
        target_lang = lang_map.get(language.lower(), "en") # Fallback to English if unsupported
        
        try:
            self.model.tts_to_file(
                text=text,
                speaker_wav=speaker_wav,
                language=target_lang,
                file_path=output_path
            )
            logger.info(f"Generated XTTS speech to {output_path}")
        except Exception as e:
            logger.error(f"XTTS generation failed: {e}")
            raise

    def get_audio_duration(self, audio_path: str) -> float:
        cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audio_path]
        result = subprocess.run(cmd, capture_output=True, text=True)
        return float(result.stdout.strip())

    def match_pacing(self, input_wav: str, target_duration: float, output_wav: str):
        """
        Uses FFmpeg's atempo to stretch/shrink the audio to precisely match target_duration.
        """
        current_duration = self.get_audio_duration(input_wav)
        if current_duration == 0:
            return

        ratio = current_duration / target_duration
        
        # atempo only supports 0.5 to 100. If we need more, we have to chain them.
        # For simplicity, assuming the ratio is within 0.5 to 2.0 usually.
        ratio = max(0.5, min(2.0, ratio))

        logger.info(f"Time-stretching {input_wav} (Dur: {current_duration:.2f}s) to {target_duration:.2f}s (Ratio: {ratio:.2f})")
        
        cmd = [
            "ffmpeg", "-y",
            "-i", input_wav,
            "-filter:a", f"atempo={ratio}",
            output_wav
        ]
        
        subprocess.run(cmd, capture_output=True, check=True)

    def compile_voiceover(self, segments: List[Dict], total_duration: float, output_wav: str):
        """
        Takes a list of dictionaries:
        [ {"path": "stretched_seg1.wav", "start": 0.5}, ... ]
        And places them on a silent audio timeline of `total_duration`.
        """
        if not segments:
            # Just create silence
            cmd = ['ffmpeg', '-y', '-f', 'lavfi', '-i', f'anullsrc=r=44100:cl=stereo', '-t', str(total_duration), output_wav]
            subprocess.run(cmd, capture_output=True, check=True)
            return

        # We use adelay filter in ffmpeg.
        # ffmpeg -i seg1.wav -i seg2.wav -filter_complex "[0]adelay=500|500[a0];[1]adelay=2000|2000[a1];[a0][a1]amix=inputs=2[out]" -map "[out]" output.wav
        
        inputs = []
        filter_complex = ""
        amix_inputs = ""
        
        for i, seg in enumerate(segments):
            inputs.extend(["-i", seg["path"]])
            # adelay requires milliseconds
            delay_ms = int(seg["start"] * 1000)
            filter_complex += f"[{i}]adelay={delay_ms}|{delay_ms}[a{i}];"
            amix_inputs += f"[a{i}]"
            
        filter_complex += f"{amix_inputs}amix=inputs={len(segments)}:dropout_transition=0:normalize=0[mix];"
        
        # Add a base silent track to ensure total duration
        inputs.extend(['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', str(total_duration)])
        base_idx = len(segments)
        
        filter_complex += f"[{base_idx}][mix]amix=inputs=2:dropout_transition=0:normalize=0[out]"

        cmd = ["ffmpeg", "-y"] + inputs + ["-filter_complex", filter_complex, "-map", "[out]", output_wav]
        
        subprocess.run(cmd, capture_output=True, check=True)

    def mix_audio(self, original_audio: str, voiceover_audio: str, mode: str, output_path: str):
        """
        Modes:
        - "keep": Just return original_audio
        - "replace": Just return voiceover_audio
        - "mix": Blend them, ducking original volume
        """
        if mode == "keep":
            cmd = ["ffmpeg", "-y", "-i", original_audio, "-c:a", "copy", output_path]
            subprocess.run(cmd, capture_output=True, check=True)
            return
            
        if mode == "replace":
            cmd = ["ffmpeg", "-y", "-i", voiceover_audio, "-c:a", "copy", output_path]
            subprocess.run(cmd, capture_output=True, check=True)
            return

        # Mix mode - Original lowered volume (ducking)
        logger.info("Mixing audio tracks...")
        cmd = [
            "ffmpeg", "-y",
            "-i", original_audio,
            "-i", voiceover_audio,
            "-filter_complex", "[0:a]volume=0.3[a0];[1:a]volume=1.0[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=0[out]",
            "-map", "[out]",
            output_path
        ]
        subprocess.run(cmd, capture_output=True, check=True)

    def dub_voice(self, original_audio_path: str, transcript_words: List[Dict], target_lang: str, start_time: float, end_time: float, output_path: str, mix_mode: str = "replace") -> str:
        """
        Dubs/translates the voice of a clip.
        """
        import uuid
        import shutil
        from app.services.subtitle_service import subtitle_service
        from app.services.translation_service import translate_text_google
        
        duration = end_time - start_time
        temp_dir = os.path.dirname(output_path)
        unique_id = uuid.uuid4().hex[:8]
        
        # 1. Extract speaker reference wav
        ref_duration = min(5.0, duration)
        speaker_wav = os.path.join(temp_dir, f"speaker_ref_{unique_id}.wav")
        cmd = [
            "ffmpeg", "-y", "-loglevel", "error",
            "-ss", str(start_time),
            "-t", str(ref_duration),
            "-i", original_audio_path,
            "-acodec", "pcm_s16le",
            "-ar", "22050",
            "-ac", "1",
            speaker_wav
        ]
        subprocess.run(cmd, capture_output=True, check=True)
        
        # 2. Group words into lines
        lines = subtitle_service.group_words_into_lines(transcript_words)
        
        processed_segments = []
        try:
            for idx, line in enumerate(lines):
                line_start = line["start"]
                line_end = line["end"]
                line_duration = line_end - line_start
                
                orig_text = " ".join([w["text"].strip() for w in line["words"]])
                if not orig_text.strip():
                    continue
                
                # Translate line text
                translated_text = translate_text_google(orig_text, target_lang)
                
                # Paths
                raw_seg = os.path.join(temp_dir, f"raw_seg_{idx}_{unique_id}.wav")
                stretched_seg = os.path.join(temp_dir, f"stretched_seg_{idx}_{unique_id}.wav")
                
                # Generate cloned speech in target language
                self.generate_speech(
                    text=translated_text,
                    language=target_lang,
                    speaker_wav=speaker_wav,
                    output_path=raw_seg
                )
                
                # Pacing stretch
                self.match_pacing(raw_seg, line_duration, stretched_seg)
                
                processed_segments.append({
                    "path": stretched_seg,
                    "start": line_start - start_time
                })
                
                # Clean up raw segment
                if os.path.exists(raw_seg):
                    os.remove(raw_seg)
                    
            # 3. Compile full voiceover track
            voiceover_wav = os.path.join(temp_dir, f"voiceover_{unique_id}.wav")
            self.compile_voiceover(processed_segments, duration, voiceover_wav)
            
            # 4. Extract original audio slice
            original_slice = os.path.join(temp_dir, f"original_slice_{unique_id}.wav")
            cmd = [
                "ffmpeg", "-y", "-loglevel", "error",
                "-ss", str(start_time),
                "-t", str(duration),
                "-i", original_audio_path,
                "-acodec", "pcm_s16le",
                original_slice
            ]
            subprocess.run(cmd, capture_output=True, check=True)
            
            # 5. Mix original audio slice with dubbed voiceover
            self.mix_audio(
                original_audio=original_slice,
                voiceover_audio=voiceover_wav,
                mode=mix_mode,
                output_path=output_path
            )
            
            # Clean up
            for p in [voiceover_wav, original_slice]:
                if os.path.exists(p):
                    os.remove(p)
                    
        finally:
            # Clean up temporary segmented wav files and reference speaker wav
            if os.path.exists(speaker_wav):
                os.remove(speaker_wav)
            for seg in processed_segments:
                if os.path.exists(seg["path"]):
                    os.remove(seg["path"])
                    
        return output_path

voice_service = VoiceService()
