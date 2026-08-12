import os
import subprocess
import logging
import uuid
import json
import asyncio
from pathlib import Path
from typing import List, Dict
from gtts import gTTS

logger = logging.getLogger(__name__)

# 5 Distinct Voice Actor Profiles per Language for Male and Female Dubbing
MULTI_VOICE_PRESETS = {
    # English (5 Diverse Studio Voices)
    ("en", "male"): [
        {"voice": "en-US-ChristopherNeural", "rate": "+6%", "pitch": "+0Hz", "name": "Punchy Viral Host"},
        {"voice": "en-US-GuyNeural", "rate": "+2%", "pitch": "-2Hz", "name": "Conversational Podcast Host"},
        {"voice": "en-US-EricNeural", "rate": "-4%", "pitch": "-6Hz", "name": "Deep Broadcast Narrator"},
        {"voice": "en-GB-RyanNeural", "rate": "+4%", "pitch": "+2Hz", "name": "British Studio Voice"},
        {"voice": "en-US-BrianMultilingualNeural", "rate": "+8%", "pitch": "+4Hz", "name": "Modern Dynamic Creator"}
    ],
    ("en", "female"): [
        {"voice": "en-US-JennyNeural", "rate": "+6%", "pitch": "+2Hz", "name": "Bright Viral Female"},
        {"voice": "en-US-AriaNeural", "rate": "+0%", "pitch": "+0Hz", "name": "Natural Conversational Female"},
        {"voice": "en-US-AvaMultilingualNeural", "rate": "-4%", "pitch": "-4Hz", "name": "Deep Cinematic Narrator"},
        {"voice": "en-GB-SoniaNeural", "rate": "+4%", "pitch": "+2Hz", "name": "British Host"},
        {"voice": "en-AU-NatashaNeural", "rate": "+8%", "pitch": "+4Hz", "name": "Dynamic Creator"}
    ],

    # Tamil (5 Distinct Regional & Paced Male / Female Voices)
    ("ta", "male"): [
        {"voice": "ta-IN-ValluvarNeural", "rate": "+8%", "pitch": "+3Hz", "name": "High-Energy Tamil Host"},
        {"voice": "ta-MY-SuryaNeural", "rate": "+1%", "pitch": "+0Hz", "name": "Natural Conversational Male"},
        {"voice": "ta-SG-AnbuNeural", "rate": "-5%", "pitch": "-6Hz", "name": "Deep Cinematic Storyteller"},
        {"voice": "ta-LK-KumarNeural", "rate": "+4%", "pitch": "+2Hz", "name": "Broadcaster Male"},
        {"voice": "ta-IN-ValluvarNeural", "rate": "+10%", "pitch": "-2Hz", "name": "Punchy Hook Male"}
    ],
    ("ta", "female"): [
        {"voice": "ta-IN-PallaviNeural", "rate": "+8%", "pitch": "+3Hz", "name": "Expressive Tamil Host"},
        {"voice": "ta-MY-KaniNeural", "rate": "+0%", "pitch": "+0Hz", "name": "Conversational Female"},
        {"voice": "ta-SG-VenbaNeural", "rate": "-4%", "pitch": "-4Hz", "name": "Cinematic Storyteller"},
        {"voice": "ta-LK-SaranyaNeural", "rate": "+4%", "pitch": "+2Hz", "name": "Engaging Broadcaster"},
        {"voice": "ta-IN-PallaviNeural", "rate": "+10%", "pitch": "-2Hz", "name": "Punchy Hook Female"}
    ],

    # Hindi (5 Varied Pacing & Pitch Profiles)
    ("hi", "male"): [
        {"voice": "hi-IN-MadhurNeural", "rate": "+8%", "pitch": "+4Hz", "name": "High-Energy Viral Male"},
        {"voice": "hi-IN-MadhurNeural", "rate": "+0%", "pitch": "+0Hz", "name": "Natural Conversational Male"},
        {"voice": "hi-IN-MadhurNeural", "rate": "-6%", "pitch": "-6Hz", "name": "Deep Cinematic Narrator"},
        {"voice": "hi-IN-MadhurNeural", "rate": "+5%", "pitch": "-2Hz", "name": "Radio / Podcast Host"},
        {"voice": "hi-IN-MadhurNeural", "rate": "+10%", "pitch": "+2Hz", "name": "Fast-Paced Hook Male"}
    ],
    ("hi", "female"): [
        {"voice": "hi-IN-SwaraNeural", "rate": "+8%", "pitch": "+4Hz", "name": "High-Energy Viral Female"},
        {"voice": "hi-IN-SwaraNeural", "rate": "+0%", "pitch": "+0Hz", "name": "Conversational Female"},
        {"voice": "hi-IN-SwaraNeural", "rate": "-5%", "pitch": "-4Hz", "name": "Cinematic Narrator"},
        {"voice": "hi-IN-SwaraNeural", "rate": "+4%", "pitch": "-2Hz", "name": "Radio Broadcaster"},
        {"voice": "hi-IN-SwaraNeural", "rate": "+10%", "pitch": "+3Hz", "name": "Dynamic Hook Female"}
    ],

    # Telugu (5 Distinct Profiles)
    ("te", "male"): [
        {"voice": "te-IN-MohanNeural", "rate": "+7%", "pitch": "+3Hz", "name": "High-Energy Telugu Male"},
        {"voice": "te-IN-MohanNeural", "rate": "+0%", "pitch": "+0Hz", "name": "Conversational Male"},
        {"voice": "te-IN-MohanNeural", "rate": "-5%", "pitch": "-5Hz", "name": "Deep Narrator"},
        {"voice": "te-IN-MohanNeural", "rate": "+4%", "pitch": "-2Hz", "name": "Podcast Host"},
        {"voice": "te-IN-MohanNeural", "rate": "+9%", "pitch": "+2Hz", "name": "Dynamic Hook Male"}
    ],
    ("te", "female"): [
        {"voice": "te-IN-ShrutiNeural", "rate": "+7%", "pitch": "+3Hz", "name": "Expressive Telugu Host"},
        {"voice": "te-IN-ShrutiNeural", "rate": "+0%", "pitch": "+0Hz", "name": "Conversational Female"},
        {"voice": "te-IN-ShrutiNeural", "rate": "-4%", "pitch": "-4Hz", "name": "Storyteller Female"},
        {"voice": "te-IN-ShrutiNeural", "rate": "+4%", "pitch": "-2Hz", "name": "Podcast Host"},
        {"voice": "te-IN-ShrutiNeural", "rate": "+9%", "pitch": "+2Hz", "name": "Hook Female"}
    ],

    # Spanish (5 Distinct Regional Voices)
    ("es", "male"): [
        {"voice": "es-ES-AlvaroNeural", "rate": "+6%", "pitch": "+0Hz", "name": "Spanish Studio Male"},
        {"voice": "es-MX-JorgeNeural", "rate": "+2%", "pitch": "-2Hz", "name": "Mexican Host"},
        {"voice": "es-AR-TomasNeural", "rate": "-4%", "pitch": "-5Hz", "name": "Deep Cinematic Male"},
        {"voice": "es-CO-GonzaloNeural", "rate": "+5%", "pitch": "+2Hz", "name": "Colombian Broadcaster"},
        {"voice": "es-CL-LorenzoNeural", "rate": "+8%", "pitch": "+4Hz", "name": "Dynamic Creator"}
    ],
    ("es", "female"): [
        {"voice": "es-ES-ElviraNeural", "rate": "+6%", "pitch": "+0Hz", "name": "Spanish Studio Female"},
        {"voice": "es-MX-DaliaNeural", "rate": "+2%", "pitch": "-2Hz", "name": "Mexican Host"},
        {"voice": "es-AR-ElenaNeural", "rate": "-4%", "pitch": "-4Hz", "name": "Deep Storyteller"},
        {"voice": "es-CO-SalomeNeural", "rate": "+5%", "pitch": "+2Hz", "name": "Broadcaster Female"},
        {"voice": "es-ES-XimenaNeural", "rate": "+8%", "pitch": "+3Hz", "name": "Dynamic Female"}
    ],

    # French (5 Distinct Voices)
    ("fr", "male"): [
        {"voice": "fr-FR-HenriNeural", "rate": "+5%", "pitch": "+0Hz", "name": "French Studio Male"},
        {"voice": "fr-FR-RemyMultilingualNeural", "rate": "+0%", "pitch": "-2Hz", "name": "Conversational Male"},
        {"voice": "fr-CA-JeanNeural", "rate": "-4%", "pitch": "-5Hz", "name": "Deep Narrator"},
        {"voice": "fr-BE-GerardNeural", "rate": "+4%", "pitch": "+2Hz", "name": "Broadcaster"},
        {"voice": "fr-CA-AntoineNeural", "rate": "+8%", "pitch": "+3Hz", "name": "Energetic Host"}
    ],
    ("fr", "female"): [
        {"voice": "fr-FR-DeniseNeural", "rate": "+5%", "pitch": "+0Hz", "name": "French Studio Female"},
        {"voice": "fr-FR-VivienneMultilingualNeural", "rate": "+0%", "pitch": "-2Hz", "name": "Conversational Female"},
        {"voice": "fr-CA-SylvieNeural", "rate": "-4%", "pitch": "-4Hz", "name": "Storyteller Female"},
        {"voice": "fr-BE-CharlineNeural", "rate": "+4%", "pitch": "+2Hz", "name": "Broadcaster Female"},
        {"voice": "fr-FR-EloiseNeural", "rate": "+8%", "pitch": "+3Hz", "name": "Energetic Female"}
    ],
}

class VoiceService:
    def __init__(self):
        logger.info("VoiceService initialized with Edge-TTS 5-Persona Neural Engine.")

    def generate_speech(self, text: str, language: str, speaker_wav: str, output_path: str, speaker_gender: str = "female", variation_index: int = 1):
        """
        Generates hyper-realistic neural speech for the given text.
        Applies a distinct voice actor persona, pitch, and rate for each of the 5 variations.
        Primary: Microsoft Azure Neural Voices via Edge-TTS (Human intonation, zero robot sound).
        Secondary fallback: Google Cloud TTS (Neural / Wavenet).
        Tertiary fallback: Local pitch-shifted gTTS.
        """
        if not text or not text.strip():
            cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", "0.5", output_path]
            subprocess.run(cmd, capture_output=True, check=True)
            return output_path

        lang_norm = (language or "en").lower().strip()
        base_lang = lang_norm.split("-")[0]
        gender_raw = (speaker_gender or "female").lower()

        # Handle 'mixed' gender option across variations
        if gender_raw in ["mixed", "diverse", "both"]:
            target_gender = "male" if (variation_index % 2 == 1) else "female"
        elif gender_raw == "male":
            target_gender = "male"
        else:
            target_gender = "female"

        # Resolve voice persona preset for this variation index (0 to 4)
        preset_idx = max(0, variation_index - 1) % 5
        presets = MULTI_VOICE_PRESETS.get((base_lang, target_gender)) or MULTI_VOICE_PRESETS.get(("en", target_gender))
        
        if presets and len(presets) > 0:
            preset = presets[preset_idx % len(presets)]
            voice_name = preset.get("voice")
            rate_str = preset.get("rate", "+0%")
            pitch_str = preset.get("pitch", "+0Hz")
            persona_name = preset.get("name", f"{target_gender.capitalize()} Voice {preset_idx+1}")
        else:
            voice_name = "en-US-ChristopherNeural" if target_gender == "male" else "en-US-JennyNeural"
            rate_str = "+0%"
            pitch_str = "+0Hz"
            persona_name = f"{target_gender.capitalize()} Voice"

        # 1. Primary Engine: Edge-TTS Neural Studio with Persona Pitch/Rate
        try:
            import edge_tts

            logger.info(f"[Var {variation_index}] Generating Neural Voiceover: '{persona_name}' ({voice_name}) Rate={rate_str} Pitch={pitch_str} for lang '{lang_norm}'...")
            
            temp_mp3 = output_path.replace(".wav", f"_{uuid.uuid4().hex[:6]}.mp3")
            
            async def _run_edge_tts():
                comm = edge_tts.Communicate(text=text, voice=voice_name, rate=rate_str, pitch=pitch_str)
                await comm.save(temp_mp3)

            asyncio.run(_run_edge_tts())

            if os.path.exists(temp_mp3) and os.path.getsize(temp_mp3) > 100:
                cmd = [
                    "ffmpeg", "-y", "-loglevel", "error",
                    "-i", temp_mp3,
                    "-acodec", "pcm_s16le",
                    "-ar", "44100",
                    "-ac", "1",
                    output_path
                ]
                subprocess.run(cmd, capture_output=True, check=True)
                if os.path.exists(temp_mp3):
                    os.remove(temp_mp3)
                logger.info(f"Successfully generated studio voiceover ({persona_name}) to {output_path}")
                return output_path
        except Exception as ee:
            logger.warning(f"Edge-TTS synthesis failed: {ee}. Trying Google Cloud TTS fallback...")

        # 2. Secondary Engine: Google Cloud Text-to-Speech
        gcp_creds = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        if gcp_creds and os.path.exists(gcp_creds):
            try:
                from google.cloud import texttospeech
                client = texttospeech.TextToSpeechClient()
                synthesis_input = texttospeech.SynthesisInput(text=text)
                ssml_gender = texttospeech.SsmlVoiceGender.MALE if target_gender == "male" else texttospeech.SsmlVoiceGender.FEMALE

                lang_code_map = {
                    "en": "en-US", "es": "es-ES", "fr": "fr-FR", "de": "de-DE",
                    "it": "it-IT", "pt": "pt-PT", "ja": "ja-JP", "ko": "ko-KR",
                    "hi": "hi-IN", "ta": "ta-IN", "te": "te-IN", "ml": "ml-IN",
                    "kn": "kn-IN", "mr": "mr-IN", "gu": "gu-IN", "bn": "bn-IN",
                    "pa": "pa-IN", "ur": "ur-PK", "vi": "vi-VN", "th": "th-TH",
                    "id": "id-ID", "zh-cn": "cmn-CN"
                }
                lang_code = lang_code_map.get(lang_norm, "en-US")
                voice = texttospeech.VoiceSelectionParams(language_code=lang_code, ssml_gender=ssml_gender)
                audio_config = texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3)

                logger.info(f"Synthesizing Google Cloud TTS for '{lang_code}'...")
                response = client.synthesize_speech(input=synthesis_input, voice=voice, audio_config=audio_config)
                
                temp_mp3 = output_path.replace(".wav", f"_{uuid.uuid4().hex[:6]}.mp3")
                with open(temp_mp3, "wb") as out:
                    out.write(response.audio_content)

                cmd = [
                    "ffmpeg", "-y", "-loglevel", "error",
                    "-i", temp_mp3,
                    "-acodec", "pcm_s16le",
                    "-ar", "44100",
                    "-ac", "1",
                    output_path
                ]
                subprocess.run(cmd, capture_output=True, check=True)
                if os.path.exists(temp_mp3):
                    os.remove(temp_mp3)
                logger.info(f"Successfully generated Google Cloud TTS voiceover to {output_path}")
                return output_path
            except Exception as ge:
                logger.warning(f"Google Cloud TTS failed: {ge}. Falling back to gTTS...")

        # 3. Tertiary Fallback: Local gTTS with pitch-shift
        try:
            temp_mp3 = output_path.replace(".wav", f"_{uuid.uuid4().hex[:6]}.mp3")
            gtts_lang = lang_norm.split("-")[0]
            tts = gTTS(text=text, lang=gtts_lang)
            tts.save(temp_mp3)
            
            # Apply pitch shift corresponding to variation index
            shift_factors = [0.82, 0.88, 0.78, 0.92, 0.85] if target_gender == "male" else [1.10, 1.15, 1.05, 1.20, 1.12]
            sf = shift_factors[preset_idx % len(shift_factors)]
            
            filter_chain = ["-filter:a", f"asetrate=44100*{sf:.2f},atempo={1.0/sf:.2f}"]
                
            cmd = [
                "ffmpeg", "-y", "-loglevel", "error",
                "-i", temp_mp3,
                "-acodec", "pcm_s16le",
                "-ar", "44100",
                "-ac", "1"
            ] + filter_chain + [output_path]
            
            subprocess.run(cmd, capture_output=True, check=True)
            if os.path.exists(temp_mp3):
                os.remove(temp_mp3)
            logger.info(f"Generated gTTS voiceover to {output_path}")
            return output_path
        except Exception as e:
            logger.error(f"All TTS generation methods failed: {e}")
            cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", "1.0", output_path]
            subprocess.run(cmd, capture_output=True, check=True)
            return output_path

        # 3. Tertiary Fallback: Local gTTS with pitch-shift
        try:
            temp_mp3 = output_path.replace(".wav", f"_{uuid.uuid4().hex[:6]}.mp3")
            gtts_lang = lang_norm.split("-")[0]
            tts = gTTS(text=text, lang=gtts_lang)
            tts.save(temp_mp3)
            
            filter_chain = []
            if gender_norm == "male":
                filter_chain = ["-filter:a", "asetrate=44100*0.84,atempo=1.19"]
            else:
                filter_chain = ["-filter:a", "asetrate=44100*1.10,atempo=0.91"]
                
            cmd = [
                "ffmpeg", "-y", "-loglevel", "error",
                "-i", temp_mp3,
                "-acodec", "pcm_s16le",
                "-ar", "44100",
                "-ac", "1"
            ] + filter_chain + [output_path]
            
            subprocess.run(cmd, capture_output=True, check=True)
            if os.path.exists(temp_mp3):
                os.remove(temp_mp3)
            logger.info(f"Generated gTTS voiceover to {output_path}")
            return output_path
        except Exception as e:
            logger.error(f"All TTS generation methods failed: {e}")
            # Generate silence as safety net
            cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", "1.0", output_path]
            subprocess.run(cmd, capture_output=True, check=True)
            return output_path

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
        if current_duration <= 0 or target_duration <= 0:
            return

        ratio = current_duration / target_duration
        ratio = max(0.5, min(2.0, ratio))

        cmd = [
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", input_wav,
            "-filter:a", f"atempo={ratio:.3f}",
            output_wav
        ]
        subprocess.run(cmd, capture_output=True, check=True)

    def compile_voiceover(self, segments: List[Dict], total_duration: float, output_wav: str):
        """
        Places segments [ {"path": "...", "start": 0.5}, ... ] on a silent timeline of total_duration.
        """
        if not segments:
            cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', str(total_duration), output_wav]
            subprocess.run(cmd, capture_output=True, check=True)
            return

        inputs = []
        filter_complex = ""
        amix_inputs = ""
        
        for i, seg in enumerate(segments):
            inputs.extend(["-i", seg["path"]])
            delay_ms = max(0, int(round(seg["start"] * 1000)))
            filter_complex += f"[{i}]adelay={delay_ms}|{delay_ms},aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a{i}];"
            amix_inputs += f"[a{i}]"
            
        filter_complex += f"{amix_inputs}amix=inputs={len(segments)}:dropout_transition=0:normalize=0[mix];"
        
        inputs.extend(['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', str(total_duration)])
        base_idx = len(segments)
        
        filter_complex += f"[{base_idx}][mix]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[out]"

        cmd = ["ffmpeg", "-y", "-loglevel", "error"] + inputs + ["-filter_complex", filter_complex, "-map", "[out]", "-acodec", "pcm_s16le", output_wav]
        subprocess.run(cmd, capture_output=True, check=True)

    def mix_audio(self, original_audio: str, voiceover_audio: str, mode: str, output_path: str):
        """
        Modes:
        - "replace": Completely removes original audio and outputs only the clean dubbed voiceover.
        - "mix": Blend dubbed voiceover with original audio ducked to 15% volume.
        - "keep": Output original audio only.
        """
        if mode == "replace":
            logger.info("Replacing audio: Clean dubbed voiceover output (Original audio removed).")
            cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", voiceover_audio, "-c:a", "pcm_s16le", "-ar", "44100", "-ac", "2", output_path]
            subprocess.run(cmd, capture_output=True, check=True)
            return
            
        if mode == "keep":
            cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", original_audio, "-c:a", "copy", output_path]
            subprocess.run(cmd, capture_output=True, check=True)
            return

        # Mix mode - Original lowered volume (ducked to 0.15)
        logger.info("Mixing audio: Dubbed voiceover over ducked original audio...")
        cmd = [
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", original_audio,
            "-i", voiceover_audio,
            "-filter_complex", "[0:a]volume=0.15,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a0];[1:a]volume=1.0,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=0[out]",
            "-map", "[out]",
            "-acodec", "pcm_s16le",
            output_path
        ]
        subprocess.run(cmd, capture_output=True, check=True)

    def dub_voice(self, original_audio_path: str, transcript_words: List[Dict], target_lang: str, start_time: float, end_time: float, output_path: str, mix_mode: str = "replace", speaker_gender: str = "female", variation_index: int = 1) -> str:
        """
        Dubs/translates the voice of a clip with Edge-TTS studio neural models.
        Applies a distinct voice actor persona for each of the 5 variations based on variation_index.
        """
        import shutil
        from app.services.subtitle_service import subtitle_service
        from app.services.translation_service import translate_text_google
        
        duration = end_time - start_time
        temp_dir = os.path.dirname(output_path)
        unique_id = uuid.uuid4().hex[:8]
        
        # 1. Extract speaker reference wav (for optional voice matching)
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
        except Exception:
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
        original_slice = None
        voiceover_wav = None
        try:
            for idx, line in enumerate(lines):
                line_start = line["start"]
                line_end = line["end"]
                line_duration = max(0.4, line_end - line_start)
                
                orig_text = " ".join([w["text"].strip() for w in line["words"]])
                if not orig_text.strip():
                    continue
                
                # Translate line text
                if target_lang.lower() in ["ta", "ta-tanglish", "ta-colloquial"]:
                    from app.services.translation_service import translate_text_llm
                    translated_text = translate_text_llm(orig_text, "ta")
                else:
                    translated_text = translate_text_google(orig_text, target_lang)
                
                raw_seg = os.path.join(temp_dir, f"raw_seg_{idx}_{unique_id}.wav")
                stretched_seg = os.path.join(temp_dir, f"stretched_seg_{idx}_{unique_id}.wav")
                
                # Generate neural speech in target language for this variation's persona
                self.generate_speech(
                    text=translated_text,
                    language=target_lang,
                    speaker_wav=speaker_wav,
                    output_path=raw_seg,
                    speaker_gender=speaker_gender,
                    variation_index=variation_index
                )
                
                # Time stretch to match video dialogue pacing
                self.match_pacing(raw_seg, line_duration, stretched_seg)
                
                processed_segments.append({
                    "path": stretched_seg,
                    "start": max(0.0, line_start - start_time)
                })
                
                if os.path.exists(raw_seg):
                    os.remove(raw_seg)
                    
            # 3. Compile full neural voiceover track
            voiceover_wav = os.path.join(temp_dir, f"voiceover_{unique_id}.wav")
            self.compile_voiceover(processed_segments, duration, voiceover_wav)
            
            # 4. If replace mode: Output clean dubbed voiceover directly (Zero original voice)
            if mix_mode == "replace":
                logger.info(f"Replace Mode: Using pure dubbed neural audio track for {output_path}")
                shutil.copy2(voiceover_wav, output_path)
            else:
                # 5. Mix original audio slice with dubbed voiceover
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
                
                self.mix_audio(
                    original_audio=original_slice,
                    voiceover_audio=voiceover_wav,
                    mode=mix_mode,
                    output_path=output_path
                )
            
            return output_path

        finally:
            if os.path.exists(speaker_wav):
                try: os.remove(speaker_wav)
                except Exception: pass
            if voiceover_wav and os.path.exists(voiceover_wav):
                try: os.remove(voiceover_wav)
                except Exception: pass
            if original_slice and os.path.exists(original_slice):
                try: os.remove(original_slice)
                except Exception: pass
            for seg in processed_segments:
                if os.path.exists(seg["path"]):
                    try: os.remove(seg["path"])
                    except Exception: pass

voice_service = VoiceService()
