import os
import subprocess
import logging
import uuid
import json
from pathlib import Path
from typing import List, Dict
from gtts import gTTS

logger = logging.getLogger(__name__)

class VoiceService:
    def __init__(self):
        logger.info("Google Text-to-Speech (gTTS) engine initialized successfully.")

    def generate_speech(self, text: str, language: str, speaker_wav: str, output_path: str, speaker_gender: str = "female"):
        """
        Generates TTS speech for the given text, using Google Cloud TTS (Wavenet/Neural)
        as primary if configured, with a pitch-shifted local gTTS fallback.
        """

        # Map user languages to gTTS/GCP supported languages
        lang_map = {
            "english": "en", "en": "en",
            "spanish": "es", "es": "es",
            "french": "fr", "fr": "fr",
            "german": "de", "de": "de",
            "italian": "it", "it": "it",
            "portuguese": "pt", "pt": "pt",
            "turkish": "tr", "tr": "tr",
            "russian": "ru", "ru": "ru",
            "arabic": "ar", "ar": "ar",
            "chinese": "zh-CN", "zh": "zh-CN", "zh-cn": "zh-CN",
            "japanese": "ja", "ja": "ja",
            "korean": "ko", "ko": "ko",
            "hindi": "hi", "hi": "hi",
            "tamil": "ta", "ta": "ta", "ta-tanglish": "ta", "ta-colloquial": "ta",
            "telugu": "te", "te": "te",
            "malayalam": "ml", "ml": "ml",
            "kannada": "kn", "kn": "kn",
            "marathi": "mr", "mr": "mr",
            "gujarati": "gu", "gu": "gu",
            "bengali": "bn", "bn": "bn",
            "punjabi": "pa", "pa": "pa",
            "urdu": "ur", "ur": "ur",
            "vietnamese": "vi", "vi": "vi",
            "thai": "th", "th": "th",
            "indonesian": "id", "id": "id",
            "filipino": "fil", "fil": "fil", "tagalog": "fil",
            "dutch": "nl", "nl": "nl",
            "polish": "pl", "pl": "pl",
            "ukrainian": "uk", "uk": "uk",
            "swedish": "sv", "sv": "sv",
            "norwegian": "no", "no": "no",
            "danish": "da", "da": "da",
            "finnish": "fi", "fi": "fi",
            "greek": "el", "el": "el",
            "hebrew": "he", "he": "he",
            "romanian": "ro", "ro": "ro",
            "czech": "cs", "cs": "cs",
            "hungarian": "hu", "hu": "hu"
        }
        
        target_lang = lang_map.get(language.lower(), "en") # Fallback to English if unsupported

        # 1. Try Google Cloud Text-to-Speech (Neural / Wavenet Male & Female voices)
        gcp_creds = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        use_google_tts = False
        if gcp_creds and os.path.exists(gcp_creds):
            try:
                from google.cloud import texttospeech
                use_google_tts = True
            except ImportError:
                logger.warning("google-cloud-texttospeech library not found. Falling back to local pitch-shifted gTTS.")
        
        if use_google_tts:
            try:
                from google.cloud import texttospeech
                client = texttospeech.TextToSpeechClient()
                synthesis_input = texttospeech.SynthesisInput(text=text)
                
                # Select SSML gender
                ssml_gender = texttospeech.SsmlVoiceGender.FEMALE
                if speaker_gender == "male":
                    ssml_gender = texttospeech.SsmlVoiceGender.MALE
                
                # Map standard language code to GCP language code
                lang_code_map = {
                    "en": "en-US", "es": "es-ES", "fr": "fr-FR", "de": "de-DE",
                    "it": "it-IT", "pt": "pt-PT", "ja": "ja-JP", "ko": "ko-KR",
                    "hi": "hi-IN", "ta": "ta-IN", "te": "te-IN", "ml": "ml-IN",
                    "kn": "kn-IN", "mr": "mr-IN", "gu": "gu-IN", "bn": "bn-IN",
                    "pa": "pa-IN", "ur": "ur-PK", "vi": "vi-VN", "th": "th-TH",
                    "id": "id-ID", "zh-CN": "cmn-CN"
                }
                lang_code = lang_code_map.get(target_lang, "en-US")
                
                voice = texttospeech.VoiceSelectionParams(
                    language_code=lang_code,
                    ssml_gender=ssml_gender
                )
                
                audio_config = texttospeech.AudioConfig(
                    audio_encoding=texttospeech.AudioEncoding.MP3
                )
                
                logger.info(f"Synthesizing Google Cloud Text-to-Speech for language '{lang_code}' (Gender: {speaker_gender})...")
                response = client.synthesize_speech(
                    input=synthesis_input, voice=voice, audio_config=audio_config
                )
                
                temp_mp3 = output_path.replace(".wav", ".mp3")
                with open(temp_mp3, "wb") as out:
                    out.write(response.audio_content)
                
                # Convert MP3 to s16le WAV
                cmd = [
                    "ffmpeg", "-y", "-loglevel", "error",
                    "-i", temp_mp3,
                    "-acodec", "pcm_s16le",
                    "-ar", "22050",
                    "-ac", "1",
                    output_path
                ]
                subprocess.run(cmd, capture_output=True, check=True)
                if os.path.exists(temp_mp3):
                    os.remove(temp_mp3)
                logger.info(f"Successfully generated Google Cloud TTS voiceover to {output_path}")
                return output_path
            except Exception as ge:
                logger.error(f"Google Cloud Text-to-Speech failed: {ge}. Falling back to gTTS with pitch-shift...")

        # 2. Fallback to gTTS with FFmpeg Pitch Shift
        try:
            temp_mp3 = output_path.replace(".wav", ".mp3")
            
            logger.info(f"Generating gTTS for text: '{text}' in language '{target_lang}'")
            tts = gTTS(text=text, lang=target_lang)
            tts.save(temp_mp3)
            
            # Apply pitch shift to gTTS output using FFmpeg to match requested gender
            filter_chain = []
            if speaker_gender == "male":
                # Lower pitch by ~18%
                filter_chain = ["-filter:a", "asetrate=22050*0.82,atempo=1.22"]
            elif speaker_gender == "female":
                # Slightly higher/brighter pitch
                filter_chain = ["-filter:a", "asetrate=22050*1.12,atempo=0.89"]
                
            # Convert MP3 to s16le WAV (1 channel, 22050Hz) to match expected voice format
            cmd = [
                "ffmpeg", "-y", "-loglevel", "error",
                "-i", temp_mp3,
                "-acodec", "pcm_s16le",
                "-ar", "22050",
                "-ac", "1"
            ] + filter_chain + [output_path]
            
            subprocess.run(cmd, capture_output=True, check=True)
            if os.path.exists(temp_mp3):
                os.remove(temp_mp3)
            logger.info(f"Successfully generated gTTS voiceover (pitch shifted for {speaker_gender}) to {output_path}")
        except Exception as e:
            logger.error(f"gTTS generation failed: {e}")
            raise

    def get_audio_duration(self, audio_path: str) -> float:
        try:
            cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audio_path]
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            val = result.stdout.strip()
            return float(val) if val else 0.0
        except Exception as e:
            logger.warning(f"Failed to get audio duration for {audio_path}: {e}")
            return 0.0

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

    def dub_voice(self, original_audio_path: str, transcript_words: List[Dict], target_lang: str, start_time: float, end_time: float, output_path: str, mix_mode: str = "replace", speaker_gender: str = "female") -> str:
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
        try:
            subprocess.run(cmd, capture_output=True, check=True)
        except Exception as e:
            logger.warning(f"Could not extract speaker reference audio, generating a silent fallback reference. Error: {e}")
            cmd_silence = [
                "ffmpeg", "-y", "-loglevel", "error",
                "-f", "lavfi", "-i", "anullsrc=r=22050:cl=mono",
                "-t", "1.0",
                "-acodec", "pcm_s16le",
                speaker_wav
            ]
            subprocess.run(cmd_silence, capture_output=True, check=True)
        
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
                if target_lang.lower() in ["ta", "ta-tanglish", "ta-colloquial"]:
                    from app.services.translation_service import translate_text_llm
                    # Generate speech using colloquial Tamil script so that TTS reads it correctly
                    translated_text = translate_text_llm(orig_text, "ta")
                else:
                    translated_text = translate_text_google(orig_text, target_lang)
                
                # Paths
                raw_seg = os.path.join(temp_dir, f"raw_seg_{idx}_{unique_id}.wav")
                stretched_seg = os.path.join(temp_dir, f"stretched_seg_{idx}_{unique_id}.wav")
                
                # Generate cloned speech in target language
                self.generate_speech(
                    text=translated_text,
                    language=target_lang,
                    speaker_wav=speaker_wav,
                    output_path=raw_seg,
                    speaker_gender=speaker_gender
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
