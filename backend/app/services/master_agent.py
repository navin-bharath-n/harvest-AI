import os
import logging
from typing import List

logger = logging.getLogger(__name__)

# Absolute path anchor for this file — used to resolve video paths
_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def _detect_audio_has_speech(audio_path: str) -> bool:
    """
    Lightweight check to determine whether an audio file contains human speech
    (as opposed to pure music/sound effects). Analyzes energy variation patterns
    in the audio — speech has characteristic bursts with gaps between phrases.
    Returns True if speech is likely present, False otherwise.
    """
    try:
        import numpy as np
        import scipy.io.wavfile as wavfile

        sample_rate, data = wavfile.read(audio_path)

        # Convert to mono if stereo
        if len(data.shape) > 1:
            data = data.mean(axis=1)

        # Normalize
        if data.dtype == np.int16:
            data = data.astype(np.float32) / 32768.0
        elif data.dtype == np.int32:
            data = data.astype(np.float32) / 2147483648.0
        else:
            data = data.astype(np.float32)
            max_val = np.max(np.abs(data))
            if max_val > 0:
                data = data / max_val

        total_duration = len(data) / sample_rate
        if total_duration < 1.0:
            return False

        # Use larger windows (100ms) for more stable energy measurement
        # and analyze the FULL audio, not just the first ~50 seconds
        window_size = int(sample_rate * 0.1)  # 100ms windows
        hop_size = int(sample_rate * 0.05)  # 50ms hop
        num_windows = max(1, (len(data) - window_size) // hop_size)

        energies = []
        for i in range(num_windows):
            start = i * hop_size
            window = data[start:start + window_size]
            if len(window) == 0:
                break
            energy = np.sqrt(np.mean(window ** 2))
            energies.append(energy)

        if not energies:
            return False

        energies = np.array(energies)

        # Speech characteristics (more lenient thresholds for real-world audio):
        # 1. Energy coefficient of variation — speech has more variation than pure music
        energy_cv = np.std(energies) / (np.mean(energies) + 1e-10)

        # 2. Silent ratio — fraction of windows below a low-energy threshold
        threshold = np.mean(energies) * 0.2
        silent_ratio = np.sum(energies < threshold) / len(energies)

        # 3. Energy dynamic range — speech typically has wider dynamic range
        sorted_energies = np.sort(energies)
        low_10 = np.mean(sorted_energies[:max(1, len(sorted_energies) // 10)])
        high_10 = np.mean(sorted_energies[-max(1, len(sorted_energies) // 10):])
        dynamic_range = high_10 / (low_10 + 1e-10)

        # Decision: Use OR logic — any strong speech indicator triggers True
        # - energy_cv > 0.2 means there's noticeable energy variation (speech has gaps)
        # - silent_ratio > 0.02 means there are some quiet moments (between words/phrases)
        # - dynamic_range > 3.0 means loud and quiet parts differ significantly
        # Pure music typically has energy_cv < 0.15, silent_ratio < 0.01, dynamic_range < 2.0
        has_speech_pattern = (energy_cv > 0.2 and silent_ratio > 0.02) or dynamic_range > 4.0

        logger.info(
            f"Speech detection — energy_cv={energy_cv:.3f}, silent_ratio={silent_ratio:.3f}, "
            f"dynamic_range={dynamic_range:.1f}, has_speech_pattern={has_speech_pattern}"
        )
        return has_speech_pattern

    except Exception as e:
        logger.warning(f"Speech detection heuristic failed (assuming speech exists): {e}")
        # If detection fails, assume speech exists to avoid drowning it with music
        return True


class MasterAIAgent:
    def __init__(self):
        pass  # Heavy services are imported lazily inside generate_shorts()

    def generate_shorts(
        self,
        video_path: str,
        length: float = 60.0,
        platform: str = "youtube",
        optional_prompt: str = "",
        progress_callback=None,
        db_video=None,
        translate_language: str = "none",
        dub_voice: bool = False,
        caption_language: str = "translated",
        dub_mix_mode: str = "replace",
        speaker_gender: str = "female"
    ) -> List[str]:
        """
        End-to-end pipeline to generate 5 stylistic variations of the best highlight from a video.
        All heavy ML imports are deferred to here so the Celery worker doesn't crash at startup
        if a package is missing.
        """
        # --- Lazy imports (deferred so module-level import failures don't kill the worker) ---
        from app.services.video_processor import VideoProcessor
        from app.services.transcription_service import transcription_service
        from app.services.content_understanding_service import content_understanding_service
        from app.services.smart_cropping_service import smart_cropping_service
        from app.services.prompt_editing_agent import prompt_editing_agent
        from app.services.clip_rendering_service import clip_rendering_service
        from app.services.subtitle_service import subtitle_service
        from app.services.music_agent import music_agent

        video_processor = VideoProcessor()

        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video not found: {video_path}")

        logger.info(f"Starting Master AI Agent for {video_path}")

        # 1. Metadata extraction
        logger.info("Extracting metadata...")
        metadata = video_processor.process(video_path)

        audio_path = metadata.get("audio_path")

        # 2. Transcription — use extracted audio file, NOT the video file
        if progress_callback: progress_callback("transcribing")
        full_transcript = []
        if audio_path and os.path.exists(audio_path):
            logger.info(f"Transcribing audio: {audio_path}")
            try:
                full_transcript = transcription_service.transcribe(audio_path)
            except Exception as e:
                logger.warning(f"Transcription failed (continuing without transcript): {e}")
        else:
            logger.warning("No audio track found. Skipping transcription.")

        # 3. Content Understanding to find highlight
        if progress_callback: progress_callback("analyzing")
        logger.info("Analyzing content for highlights...")

        # Determine whether this video contains speech or is music/sfx only.
        # This drives both highlight detection strategy and music mixing volume.
        audio_has_speech = False
        if audio_path and os.path.exists(audio_path):
            audio_has_speech = _detect_audio_has_speech(audio_path)
            logger.info(f"Audio speech detection result: {audio_has_speech}")

        # Decide the analysis path:
        # - If we have a meaningful transcript (>=5 words), always use LLM analysis
        # - If transcript is sparse BUT speech is detected, still use LLM analysis
        #   (the transcript, however small, is still useful context)
        # - Only fall back to audio-peaks when there's truly no speech
        has_meaningful_transcript = full_transcript and len(full_transcript) >= 5
        use_audio_peaks = False

        if has_meaningful_transcript:
            # Good transcript — use LLM content analysis
            try:
                analysis = content_understanding_service.analyze(full_transcript, metadata)
            except Exception as e:
                logger.warning(f"Content analysis failed (using defaults): {e}")
                analysis = {"importance_scores": []}
        elif audio_has_speech:
            # Sparse transcript but speech detected — still try LLM with what we have,
            # falling back to audio peaks if analysis fails
            logger.info("Transcript is sparse but speech was detected in audio. Attempting LLM analysis with available words.")
            if full_transcript:
                try:
                    analysis = content_understanding_service.analyze(full_transcript, metadata)
                except Exception as e:
                    logger.warning(f"Content analysis failed with sparse transcript: {e}")
                    analysis = {"importance_scores": []}
            else:
                analysis = {"importance_scores": []}
        elif audio_path and os.path.exists(audio_path):
            # No speech detected and no meaningful transcript — pure music/gameplay
            logger.info("No speech detected. Processing audio peaks for gameplay/action highlights.")
            use_audio_peaks = True
            try:
                from app.services.audio_analyzer import detect_audio_highlights
                audio_highlights = detect_audio_highlights(audio_path)
                analysis = {
                    "topic": "Gameplay Highlight",
                    "summary": "Highlight detected directly from wave audio amplitude peaks.",
                    "importance_scores": audio_highlights
                }
            except Exception as e:
                logger.warning(f"Audio highlight peak detection failed: {e}")
                analysis = {"importance_scores": []}
        else:
            analysis = {"importance_scores": []}

        video_duration = metadata.get("duration", 0.0) or 0.0
        is_long_video = video_duration > 300.0

        scores = analysis.get("importance_scores", [])
        if not scores:
            logger.warning("No highlights found. Defaulting to beginning of video.")
            best_start = 0.0
            default_len = 30.0 if is_long_video else length
            best_end = min(default_len, video_duration or default_len)
        else:
            # Pick highest score
            best_highlight = max(scores, key=lambda x: x.get("score", 0))
            h_start = float(best_highlight.get("start", 0.0))

            best_start = h_start
            if is_long_video:
                h_end = float(best_highlight.get("end", h_start + 15.0))
                best_end = min(h_end, h_start + 30.0)
            else:
                h_end = h_start + length
                best_end = h_end

            if video_duration and best_end > video_duration:
                best_end = video_duration
                if is_long_video:
                    best_start = max(0.0, best_end - 30.0)
                else:
                    best_start = max(0.0, best_end - length)

            best_start = round(best_start, 2)
            best_end = round(best_end, 2)

        logger.info(f"Selected highlight: {best_start}s to {best_end}s (Is long video? {is_long_video})")

        # 4. Smart Cropping Trajectory
        if progress_callback: progress_callback("rendering")
        logger.info("Calculating crop trajectory...")
        try:
            crop_data = smart_cropping_service.generate_crop_metadata(video_path)
            full_trajectory = crop_data.get("trajectory", [])
            if db_video is not None:
                from app.models.video import CropStatus
                db_video.crop_metadata = crop_data
                db_video.crop_status = CropStatus.COMPLETED
        except Exception as e:
            logger.warning(f"Smart cropping failed (using static center crop): {e}")
            full_trajectory = []

        # 5. The 1 AI Persona for quick testing
        personas = [
            f"Make it a highly viral hook. Energetic captions, frequent zooms, upbeat music. {optional_prompt}"
        ]

        generated_files = []
        base_dir = os.path.dirname(video_path)

        for idx, persona_prompt in enumerate(personas, 1):
            logger.info(f"--- Generating Variation {idx}/1 ---")
            logger.info(f"Persona Prompt: {persona_prompt}")

            # Parse instructions
            instructions = prompt_editing_agent.parse_prompt(persona_prompt)
            if "transition" not in instructions:
                instructions["transition"] = "fade"
            # Merge explicit translation/dubbing parameters
            if translate_language != "none":
                instructions["translate_language"] = translate_language
            if dub_voice:
                instructions["dub_voice"] = dub_voice
            if caption_language:
                instructions["caption_language"] = caption_language
            if dub_mix_mode:
                instructions["dub_mix_mode"] = dub_mix_mode
            logger.info(f"Parsed Instructions: {instructions}")

            # Resolve content_type: user prompt override > auto-detection
            user_content_type = instructions.get("content_type", "auto")
            if user_content_type == "speech":
                # User explicitly said this has speech
                video_has_speech = True
                logger.info("Content type forced to SPEECH by user prompt.")
            elif user_content_type == "music_only":
                # User explicitly said this is music only
                video_has_speech = False
                logger.info("Content type forced to MUSIC_ONLY by user prompt.")
            else:
                # Auto: use detection result
                video_has_speech = audio_has_speech
                logger.info(f"Content type AUTO — detected speech: {video_has_speech}")

            # Determine parts
            MAX_PART_DURATION = 60.0
            total_duration = round(best_end - best_start, 2)

            parts = []
            if total_duration > MAX_PART_DURATION and not is_long_video:
                import math
                num_parts = math.ceil(total_duration / MAX_PART_DURATION)
                for p in range(num_parts):
                    part_start = round(best_start + p * MAX_PART_DURATION, 2)
                    part_end = round(min(best_end, part_start + MAX_PART_DURATION), 2)
                    if part_end - part_start > 0.5:
                        parts.append((part_start, part_end, p + 1, num_parts))
            else:
                parts.append((best_start, best_end, 1, 1))

            # Recommend music once per variation to keep style consistent across parts
            music_analysis = {"style": instructions.get("music_style", "standard")}
            music_track = music_agent.recommend_music(music_analysis)
            disable_music = True if instructions.get("music_style") == "none" else False

            for part_start, part_end, part_num, total_parts in parts:
                logger.info(f"Rendering part {part_num}/{total_parts} ({part_start:.2f}s to {part_end:.2f}s)")

                part_suffix = f"_part_{part_num}" if total_parts > 1 else ""
                variation_base = os.path.join(base_dir, f"variation_{idx}")

                clip_path = f"{variation_base}{part_suffix}_clip.mp4"
                ass_path = f"{variation_base}{part_suffix}_subs.ass"
                subbed_path = f"{variation_base}{part_suffix}_subbed.mp4"
                final_path = f"{variation_base}{part_suffix}_final.mp4"

                # Filter trajectory for this part
                part_trajectory = [t for t in full_trajectory if part_start <= t["timestamp"] <= part_end]
                if not part_trajectory:
                    part_trajectory = [{"timestamp": part_start, "x": 0, "y": 0, "width": 1080, "height": 1920}]

                caption_extras = []
                # If this is not the last part in a multi-part split, append transition subtitle
                if part_num < total_parts:
                    ord_words = {2: "second", 3: "third", 4: "fourth", 5: "fifth", 6: "sixth", 7: "seventh", 8: "eighth", 9: "ninth", 10: "tenth"}
                    next_part_word = ord_words.get(part_num + 1, f"part {part_num + 1}")
                    text_msg = f"Previous one is to continue, moving to {next_part_word}"

                    part_dur = part_end - part_start
                    msg_start = max(0.0, part_dur - 3.0)
                    msg_end = part_dur

                    caption_extras.append({
                        "start": msg_start,
                        "end": msg_end,
                        "text": text_msg
                    })

                # If this is a long video, prepend the theme title subtitle for the first 3 seconds
                if is_long_video:
                    topic = analysis.get("topic", "General Highlight")
                    caption_extras.append({
                        "start": 0.0,
                        "end": min(3.0, part_end - part_start),
                        "text": f"THEME: {topic.upper()}"
                    })

                # Determine subtitle options and translate
                caption_preset = instructions.get("caption_style", "standard")

                # Filter and shift words for this part
                part_words = [w for w in full_transcript if w["start"] >= part_start and w["end"] <= part_end]
                shifted_words = []
                for w in part_words:
                    shifted_words.append({
                        "start": w["start"] - part_start,
                        "end": w["end"] - part_start,
                        "text": w["text"]
                    })
                orig_shifted_words = shifted_words.copy()

                # Resolve translation parameters
                t_lang = instructions.get("translate_language", translate_language)
                if t_lang == "none":
                    t_lang = instructions.get("language", "none")

                cap_lang_opt = instructions.get("caption_language", caption_language)
                d_voice = instructions.get("dub_voice", dub_voice)
                d_mix_mode = instructions.get("dub_mix_mode", dub_mix_mode)

                from app.services.translation_service import translate_and_distribute_words
                if cap_lang_opt == "none":
                    shifted_words = []
                elif cap_lang_opt == "original":
                    pass
                elif cap_lang_opt == "english":
                    if t_lang != "en" and t_lang != "none":
                        try:
                            shifted_words = translate_and_distribute_words(orig_shifted_words, "en")
                        except Exception as te:
                            logger.warning(f"Subtitle translation to English failed: {te}")
                    else:
                        try:
                            shifted_words = translate_and_distribute_words(orig_shifted_words, "en")
                        except Exception as te:
                            logger.warning(f"Subtitle translation to English failed: {te}")
                elif cap_lang_opt == "translated":
                    if t_lang != "none" and t_lang != "en":
                        try:
                            shifted_words = translate_and_distribute_words(orig_shifted_words, t_lang)
                        except Exception as te:
                            logger.warning(f"Subtitle translation failed: {te}")
                    elif t_lang == "en":
                        try:
                            shifted_words = translate_and_distribute_words(orig_shifted_words, "en")
                        except Exception as te:
                            logger.warning(f"Subtitle translation failed: {te}")

                if caption_extras and cap_lang_opt != "none":
                    shifted_words = sorted([*caption_extras, *shifted_words], key=lambda item: item["start"])

                # Dub voice if requested
                dubbed_audio_path = None
                if d_voice and t_lang != "none" and audio_path and os.path.exists(audio_path):
                    from app.services.voice_service import voice_service
                    try:
                        dubbed_audio_path = f"{variation_base}{part_suffix}_dubbed.wav"
                        voice_service.dub_voice(
                            original_audio_path=audio_path,
                            transcript_words=part_words,
                            target_lang=t_lang,
                            start_time=part_start,
                            end_time=part_end,
                            output_path=dubbed_audio_path,
                            mix_mode=d_mix_mode,
                            speaker_gender=speaker_gender
                        )
                        logger.info("Successfully generated dubbed audio track for master variation.")
                    except Exception as de:
                        logger.error(f"Voice dubbing failed for master variation: {de}", exc_info=True)
                        dubbed_audio_path = None

                has_subtitles = caption_preset != "none" and len(shifted_words) > 0

                try:
                    # Step A: Subtitles and ASS file generation
                    if has_subtitles:
                        style_config = {"caption_style": caption_preset}
                        subtitle_service.generate_ass(shifted_words, ass_path, style_config)

                    # Step B: Render Crop with Zooms and on-the-fly subtitle burning
                    temp_video_source = subbed_path if has_subtitles else clip_path
                    clip_rendering_service.render_clip(
                        video_path=video_path,
                        output_path=temp_video_source,
                        start_time=part_start,
                        end_time=part_end,
                        crop_trajectory=part_trajectory,
                        editing_instructions=instructions,
                        subtitle_path=ass_path if has_subtitles else None
                    )

                    # Replace video audio with dubbed audio if available
                    if dubbed_audio_path and os.path.exists(dubbed_audio_path):
                        import shutil
                        import subprocess
                        logger.info(f"Replacing master variation audio with dubbed audio: {dubbed_audio_path}")
                        temp_dubbed_video = f"{variation_base}{part_suffix}_temp_dubbed.mp4"
                        mux_cmd = [
                            "ffmpeg", "-y", "-loglevel", "error",
                            "-i", temp_video_source,
                            "-i", dubbed_audio_path,
                            "-map", "0:v:0",
                            "-map", "1:a:0",
                            "-c:v", "copy",
                            "-c:a", "aac",
                            "-movflags", "+faststart",
                            temp_dubbed_video
                        ]
                        try:
                            subprocess.run(mux_cmd, capture_output=True, check=True)
                            shutil.move(temp_dubbed_video, temp_video_source)
                        except Exception as me:
                            logger.error(f"Muxing dubbed audio failed: {me}")
                        finally:
                            if os.path.exists(dubbed_audio_path):
                                try:
                                    os.remove(dubbed_audio_path)
                                except Exception:
                                    pass

                    # Step C: Music Mixing
                    # has_voice should be True if speech was detected OR transcript has words.
                    # This ensures music stays at background volume (0.15) when speech exists,
                    # even if the transcript is sparse.
                    effective_has_voice = video_has_speech or len(shifted_words) > 0
                    music_agent.apply_music(
                        video_path=temp_video_source,
                        music_path=music_track,
                        output_path=final_path,
                        options={"disable_music": disable_music, "has_voice": effective_has_voice}
                    )

                    # Determine descriptive title
                    if total_parts > 1:
                        title = f"Master Variation {idx} - Part {part_num}"
                    else:
                        title = f"Master Variation {idx}"

                    generated_files.append({
                        "path": final_path,
                        "title": title,
                        "duration": part_end - part_start,
                        "start_time": part_start,
                        "end_time": part_end
                    })
                    logger.info(f"Variation {idx} Part {part_num} saved to {final_path}")

                except Exception as e:
                    logger.error(f"Variation {idx} Part {part_num} failed: {e}", exc_info=True)

                finally:
                    # Cleanup intermediates regardless of success/failure
                    for temp_file in [clip_path, ass_path, subbed_path]:
                        if os.path.exists(temp_file):
                            try:
                                os.remove(temp_file)
                            except Exception:
                                pass

        return generated_files


master_agent = MasterAIAgent()
