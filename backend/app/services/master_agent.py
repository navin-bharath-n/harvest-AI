import os
import uuid
import logging
from typing import List

logger = logging.getLogger(__name__)

# Cancellation registry to immediately terminate any running generation task cooperatively
_cancelled_videos = set()
_cancel_all_flag = False

def cancel_video_job(video_id: int):
    """Mark a video as cancelled so running tasks abort immediately."""
    if video_id is not None:
        _cancelled_videos.add(int(video_id))
        logger.info(f"Cancellation registered for video {video_id}")

def cancel_all_video_jobs():
    """Cancel all active video generation tasks across the server."""
    global _cancel_all_flag
    _cancel_all_flag = True
    logger.info("Cancellation registered for ALL active video tasks")

def clear_video_cancellation(video_id: int):
    """Clear cancellation flag when starting a new generation."""
    global _cancel_all_flag
    _cancel_all_flag = False
    if video_id is not None:
        _cancelled_videos.discard(int(video_id))

def is_video_cancelled(video_id: int) -> bool:
    if _cancel_all_flag:
        return True
    if video_id is not None and int(video_id) in _cancelled_videos:
        return True
    return False

# Absolute path anchor for this file — used to resolve video paths
_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def _detect_audio_has_speech(audio_path: str) -> bool:
    """
    Lightweight check to determine whether an audio file contains human speech
    (as opposed to pure music/sound effects or silence). Analyzes energy variation patterns
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

        # Use 100ms windows and 50ms hop
        window_size = int(sample_rate * 0.1)
        hop_size = int(sample_rate * 0.05)
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

        # Speech characteristics:
        energy_cv = np.std(energies) / (np.mean(energies) + 1e-10)
        threshold = np.mean(energies) * 0.2
        silent_ratio = np.sum(energies < threshold) / len(energies)
        sorted_energies = np.sort(energies)
        low_10 = np.mean(sorted_energies[:max(1, len(sorted_energies) // 10)])
        high_10 = np.mean(sorted_energies[-max(1, len(sorted_energies) // 10):])
        dynamic_range = high_10 / (low_10 + 1e-10)

        has_speech_pattern = (energy_cv > 0.2 and silent_ratio > 0.02) or dynamic_range > 4.0

        logger.info(
            f"Speech detection — energy_cv={energy_cv:.3f}, silent_ratio={silent_ratio:.3f}, "
            f"dynamic_range={dynamic_range:.1f}, has_speech_pattern={has_speech_pattern}"
        )
        return has_speech_pattern

    except Exception as e:
        logger.warning(f"Speech detection heuristic failed (assuming speech exists): {e}")
        return True


class MasterAIAgent:
    def __init__(self):
        pass

    def generate_shorts(
        self,
        video_path: str,
        length: float = 60.0,
        platform: str = "youtube",
        optional_prompt: str = "",
        audio_theme: str = "auto",
        progress_callback=None,
        db_video=None,
        translate_language: str = "none",
        dub_voice: bool = False,
        caption_language: str = "translated",
        dub_mix_mode: str = "replace",
        speaker_gender: str = "female",
        framing_mode: str = "fit_blur",
        on_variation_complete=None
    ) -> List[dict]:
        """
        End-to-end pipeline to generate 5 distinct video variations featuring:
        - 5 Smooth Animated Caption Styles (Viral Pop, Karaoke Flow, Cinematic Fade, Boxed Pill, Neon Pulse)
        - Smart Content-Based BGM / Music Soundtrack:
            * If speech is present: Softly ducked BGM underneath (~0.16 volume).
            * If NO sound/speech is detected (silent video, gameplay without mic): Full-soundtrack song (1.0 volume) matched to video content.
        - Pristine 9:16 vertical smart crop without jarring cuts.
        """
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

        video_id = db_video.id if db_video else None
        if is_video_cancelled(video_id):
            logger.info(f"Video {video_id} is marked cancelled. Aborting master pipeline.")
            return []

        logger.info(f"Starting Master AI Agent for {video_path}")

        # 1. Metadata extraction
        logger.info("Extracting metadata...")
        metadata = video_processor.process(video_path)
        audio_path = metadata.get("audio_path")

        if is_video_cancelled(video_id):
            logger.info(f"Video {video_id} cancelled after metadata extraction. Aborting.")
            return []

        # 2. Transcription — use extracted audio file
        if progress_callback:
            progress_callback("transcribing")
        full_transcript = []
        if audio_path and os.path.exists(audio_path):
            logger.info(f"Transcribing audio: {audio_path}")
            try:
                full_transcript = transcription_service.transcribe(audio_path)
                if db_video is not None:
                    db_video.transcript = full_transcript
            except Exception as e:
                logger.warning(f"Transcription failed (continuing without transcript): {e}")
        else:
            logger.warning("No audio track found. Skipping transcription.")

        if is_video_cancelled(video_id):
            logger.info(f"Video {video_id} cancelled after transcription. Aborting.")
            return []

        # 3. Content Understanding to find highlight
        if progress_callback:
            progress_callback("analyzing")
        logger.info("Analyzing content for highlights...")

        audio_has_speech = False
        if audio_path and os.path.exists(audio_path):
            audio_has_speech = _detect_audio_has_speech(audio_path)
            logger.info(f"Audio speech detection result: {audio_has_speech}")

        has_meaningful_transcript = full_transcript and len(full_transcript) >= 5

        if has_meaningful_transcript:
            try:
                analysis = content_understanding_service.analyze(full_transcript, metadata)
            except Exception as e:
                logger.warning(f"Content analysis failed (using defaults): {e}")
                analysis = {"topic": "Highlight", "importance_scores": []}
        elif audio_has_speech and full_transcript:
            try:
                analysis = content_understanding_service.analyze(full_transcript, metadata)
            except Exception as e:
                logger.warning(f"Content analysis failed with sparse transcript: {e}")
                analysis = {"topic": "Highlight", "importance_scores": []}
        elif audio_path and os.path.exists(audio_path):
            logger.info("No speech detected. Processing audio peaks for gameplay/action highlights.")
            try:
                from app.services.audio_analyzer import detect_audio_highlights
                audio_highlights = detect_audio_highlights(audio_path)
                analysis = {
                    "topic": "Action / Gameplay Highlight",
                    "summary": "Highlight detected directly from wave audio amplitude peaks.",
                    "importance_scores": audio_highlights
                }
            except Exception as e:
                logger.warning(f"Audio highlight peak detection failed: {e}")
                analysis = {"topic": "Visual Highlight", "importance_scores": []}
        else:
            analysis = {"topic": "Video Highlight", "importance_scores": []}

        video_duration = float(metadata.get("duration", 0.0) or 0.0)
        scores = analysis.get("importance_scores", [])

        # User-selected length
        requested_length = float(length) if length and float(length) > 0 else 60.0
        target_dur = requested_length
        if video_duration > 0 and target_dur > video_duration:
            target_dur = video_duration

        def _snap_to_speech_boundaries(st_val: float, desired_dur: float) -> tuple:
            """
            Snaps clip start and end timestamps to natural sentence beginnings and endings.
            Prevents cutting off the speaker mid-sentence or starting mid-word.
            """
            if not full_transcript or len(full_transcript) < 2:
                st = max(0.0, float(st_val))
                en = st + desired_dur
                if video_duration > 0 and en > video_duration:
                    en = video_duration
                    st = max(0.0, en - desired_dur)
                return round(st, 2), round(en, 2)

            sorted_words = sorted(full_transcript, key=lambda w: float(w.get("start", 0.0)))

            # 1. Snap start time to nearest natural sentence or phrase beginning
            sentence_start_candidates = []
            for i, word in enumerate(sorted_words):
                w_start = float(word.get("start", 0.0))
                w_text = word.get("text", "").strip()

                is_sentence_start = False
                if i == 0:
                    is_sentence_start = True
                else:
                    prev_word = sorted_words[i - 1]
                    prev_text = prev_word.get("text", "").strip()
                    prev_end = float(prev_word.get("end", 0.0))
                    if any(prev_text.endswith(p) for p in [".", "!", "?", ":", ";"]):
                        is_sentence_start = True
                    elif w_start - prev_end >= 0.35:
                        is_sentence_start = True
                    elif w_text and w_text[0].isupper() and len(w_text) > 1:
                        is_sentence_start = True

                if is_sentence_start and abs(w_start - st_val) <= 4.5:
                    sentence_start_candidates.append((w_start, abs(w_start - st_val)))

            if sentence_start_candidates:
                sentence_start_candidates.sort(key=lambda x: x[1])
                best_start = max(0.0, sentence_start_candidates[0][0] - 0.1)
            else:
                closest_word = min(sorted_words, key=lambda w: abs(float(w.get("start", 0.0)) - st_val))
                best_start = max(0.0, float(closest_word.get("start", 0.0)) - 0.05)

            # 2. Snap end time to natural sentence ending near best_start + desired_dur
            target_en = best_start + desired_dur
            if video_duration > 0 and target_en > video_duration:
                target_en = video_duration

            sentence_end_candidates = []
            for i, word in enumerate(sorted_words):
                w_end = float(word.get("end", 0.0))
                w_text = word.get("text", "").strip()
                if w_end < best_start + 10.0:
                    continue

                is_sentence_end = False
                if any(w_text.endswith(p) for p in [".", "!", "?", ","]):
                    is_sentence_end = True
                elif i < len(sorted_words) - 1:
                    next_start = float(sorted_words[i + 1].get("start", 0.0))
                    if next_start - w_end >= 0.4:
                        is_sentence_end = True

                if is_sentence_end and abs(w_end - target_en) <= 4.5:
                    sentence_end_candidates.append((w_end, abs(w_end - target_en)))

            if sentence_end_candidates:
                sentence_end_candidates.sort(key=lambda x: x[1])
                best_end = min(video_duration or 99999.0, sentence_end_candidates[0][0] + 0.2)
            else:
                valid_ends = [w for w in sorted_words if float(w.get("end", 0.0)) >= best_start + 10.0] or sorted_words
                closest_end_word = min(valid_ends, key=lambda w: abs(float(w.get("end", 0.0)) - target_en))
                best_end = min(video_duration or 99999.0, float(closest_end_word.get("end", 0.0)) + 0.15)

            return round(best_start, 2), round(best_end, 2)

        def _calc_window(st_val: float):
            return _snap_to_speech_boundaries(st_val, target_dur)

        # Build candidate highlight windows for the 5 variations
        candidate_windows = []
        if scores:
            sorted_scores = sorted(scores, key=lambda x: float(x.get("score", 0)), reverse=True)
            for sc in sorted_scores:
                st = float(sc.get("start", 0.0))
                candidate_windows.append(_calc_window(st))

        target_variation_count = 5
        if not candidate_windows:
            if video_duration > target_dur * 1.2:
                step = max(5.0, (video_duration - target_dur) / max(1, target_variation_count - 1))
                for i in range(target_variation_count):
                    s_t = min(i * step, max(0.0, video_duration - target_dur))
                    candidate_windows.append(_calc_window(s_t))
            else:
                default_w = _calc_window(0.0)
                candidate_windows = [default_w] * target_variation_count
        else:
            while len(candidate_windows) < target_variation_count:
                if video_duration > target_dur * 1.2:
                    idx_needed = len(candidate_windows)
                    step = (video_duration - target_dur) / max(1, target_variation_count - 1)
                    s_t = min(idx_needed * step, max(0.0, video_duration - target_dur))
                    candidate_windows.append(_calc_window(s_t))
                else:
                    candidate_windows.append(candidate_windows[len(candidate_windows) % len(candidate_windows)])

        logger.info(f"Candidate highlight windows: {candidate_windows}")

        # 4. Smart Cropping Trajectory
        if progress_callback:
            progress_callback("cropping")
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

        # Analyze topic for content-matched songs / BGM
        video_topic = analysis.get("topic", "")
        music_analysis = music_agent.analyze_video(full_transcript, metadata, topic_hint=video_topic)
        logger.info(f"Video content music analysis: {music_analysis}")

        # 5. Define 5 smooth animated caption variations
        prompt_suffix = f" {optional_prompt}".strip() if optional_prompt else ""
        personas = [
            {
                "name": "Viral Pop Bounce",
                "caption_style": "pop",
                "music_style": "upbeat",
                "prompt": f"Viral short with energetic word pop-in bounce animated captions, upbeat BGM, and clean video flow.{prompt_suffix}",
                "zooms": "none",
                "transition": "none"
            },
            {
                "name": "Karaoke Flow Sweep",
                "caption_style": "karaoke",
                "music_style": "standard",
                "prompt": f"Modern short with smooth word-by-word karaoke highlight sweep animated captions and chill BGM.{prompt_suffix}",
                "zooms": "none",
                "transition": "none"
            },
            {
                "name": "Cinematic Smooth Fade",
                "caption_style": "minimalist",
                "music_style": "cinematic",
                "prompt": f"Cinematic aesthetic with minimalist smooth fade subtitles and atmospheric soundtrack.{prompt_suffix}",
                "zooms": "none",
                "transition": "none"
            },
            {
                "name": "Boxed Pill Highlight",
                "caption_style": "boxed",
                "music_style": "upbeat",
                "prompt": f"Clean short with modern boxed pill tag animated captions and upbeat background music.{prompt_suffix}",
                "zooms": "none",
                "transition": "none"
            },
            {
                "name": "Neon Pulse Glow",
                "caption_style": "neon",
                "music_style": "suspenseful",
                "prompt": f"High-energy short with glowing neon pulse animated captions and dynamic background soundtrack.{prompt_suffix}",
                "zooms": "none",
                "transition": "none"
            }
        ]

        generated_files = []
        base_dir = os.path.dirname(video_path)

        if progress_callback:
            progress_callback("rendering")

        for idx, persona_info in enumerate(personas, 1):
            if is_video_cancelled(video_id):
                logger.info(f"Video {video_id} cancelled before variation {idx}. Aborting.")
                return generated_files

            persona_name = persona_info["name"]
            persona_prompt = persona_info["prompt"]
            logger.info(f"--- Generating Variation {idx}/{len(personas)} ({persona_name}) ---")

            window_idx = (idx - 1) % len(candidate_windows)
            best_start, best_end = candidate_windows[window_idx]
            logger.info(f"Variation {idx} window: {best_start}s to {best_end}s ({best_end - best_start}s)")

            # Parse instructions with LLM
            instructions = prompt_editing_agent.parse_prompt(persona_prompt)
            # Enforce persona's specific animated caption style and BGM
            instructions["caption_style"] = persona_info["caption_style"]
            instructions["music_style"] = persona_info.get("music_style", "standard")
            instructions["zooms"] = "none"
            instructions["transition"] = "none"
            instructions["framing_mode"] = framing_mode

            # Translation / Dubbing if requested by user in UI
            if translate_language and translate_language != "none":
                instructions["translate_language"] = translate_language
            if dub_voice:
                instructions["dub_voice"] = dub_voice
            if caption_language:
                instructions["caption_language"] = caption_language
            if dub_mix_mode:
                instructions["dub_mix_mode"] = dub_mix_mode

            logger.info(f"Variation {idx} instructions: {instructions}")

            parts = [(best_start, best_end, 1, 1)]

            # Recommend music track for this variation based on selected audio theme
            if audio_theme == "none":
                music_track = None
            elif audio_theme and audio_theme != "auto":
                # User selected a specific theme (e.g. cinematic, upbeat, lofi, gaming, etc.)
                music_track = music_agent.recommend_music({
                    "style": audio_theme,
                    "topic": video_topic,
                    "search_query": f"{audio_theme} {video_topic}".strip()
                })
            else:
                # Auto: Use content analysis + variation persona complementary style
                target_music_style = instructions.get("music_style", persona_info.get("music_style", "standard"))
                music_track = music_agent.recommend_music({
                    "style": target_music_style,
                    "topic": video_topic,
                    "search_query": f"{target_music_style} {video_topic}".strip()
                })

            for part_start, part_end, part_num, total_parts in parts:
                if is_video_cancelled(video_id):
                    logger.info(f"Video {video_id} cancelled before rendering clip part. Aborting.")
                    return generated_files
                part_suffix = f"_part_{part_num}" if total_parts > 1 else ""
                var_uid = uuid.uuid4().hex[:8]
                variation_base = os.path.join(base_dir, f"var_{idx}_{var_uid}")

                clip_path = f"{variation_base}{part_suffix}_clip.mp4"
                ass_path = f"{variation_base}{part_suffix}_subs.ass"
                subbed_path = f"{variation_base}{part_suffix}_subbed.mp4"
                final_path = f"{variation_base}{part_suffix}_final.mp4"

                # Filter trajectory
                part_trajectory = [t for t in full_trajectory if part_start <= t["timestamp"] <= part_end]
                if not part_trajectory:
                    part_trajectory = [{"timestamp": part_start, "x": 0, "y": 0, "width": 1080, "height": 1920}]

                # Filter and shift words for this part (include all overlapping words)
                caption_preset = instructions.get("caption_style", "pop")
                part_words = [
                    w for w in full_transcript
                    if float(w.get("end", 0.0)) > part_start + 0.05 and float(w.get("start", 0.0)) < part_end - 0.05
                ]
                shifted_words = []
                for w in part_words:
                    w_st = max(0.0, float(w.get("start", 0.0)) - part_start)
                    w_en = max(w_st + 0.05, min(part_end - part_start, float(w.get("end", 0.0)) - part_start))
                    shifted_words.append({
                        "start": round(w_st, 2),
                        "end": round(w_en, 2),
                        "text": w.get("text", "")
                    })
                orig_shifted_words = shifted_words.copy()

                # Translation
                t_lang = instructions.get("translate_language", "none")
                cap_lang_opt = instructions.get("caption_language", "original")
                d_voice = instructions.get("dub_voice", False)
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

                # Dub voice if explicitly requested
                dubbed_audio_path = None
                if d_voice and audio_path and os.path.exists(audio_path) and part_words:
                    from app.services.voice_service import voice_service
                    try:
                        dubbed_audio_path = f"{variation_base}{part_suffix}_dubbed.wav"
                        voice_service.dub_voice(
                            original_audio_path=audio_path,
                            transcript_words=part_words,
                            target_lang=t_lang if t_lang != "none" else "en",
                            start_time=part_start,
                            end_time=part_end,
                            output_path=dubbed_audio_path,
                            mix_mode=d_mix_mode,
                            speaker_gender=speaker_gender,
                            variation_index=idx
                        )
                        logger.info(f"Successfully generated dubbed audio track for Variation {idx}.")
                    except Exception as de:
                        logger.error(f"Voice dubbing failed for Variation {idx}: {de}", exc_info=True)
                        dubbed_audio_path = None

                has_subtitles = caption_preset != "none" and len(shifted_words) > 0

                try:
                    # Step A: Subtitles and Animated ASS file generation
                    if has_subtitles:
                        style_config = {
                            "caption_style": caption_preset,
                            "target_lang": t_lang
                        }
                        subtitle_service.generate_ass(shifted_words, ass_path, style_config)

                    # Step B: Render Crop with on-the-fly subtitle burning
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
                        logger.info(f"Replacing Variation {idx} audio with dubbed audio: {dubbed_audio_path}")
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

                    # Step C: Smart Music & BGM Mixing
                    # If video has speech: mix BGM ducked underneath (~0.16 volume)
                    # If NO sound/speech was detected in video: apply song at full volume (1.0)
                    has_voice_in_clip = audio_has_speech or len(shifted_words) > 0
                    music_vol = 0.16 if has_voice_in_clip else 1.0

                    music_agent.apply_music(
                        video_path=temp_video_source,
                        music_path=music_track,
                        output_path=final_path,
                        options={
                            "disable_music": False if music_track else True,
                            "has_voice": has_voice_in_clip,
                            "volume": music_vol
                        }
                    )

                    title = f"Master Variation {idx} - {persona_name}"

                    var_item = {
                        "path": final_path,
                        "title": title,
                        "duration": round(part_end - part_start, 2),
                        "start_time": part_start,
                        "end_time": part_end,
                        "persona": persona_name,
                        "variation_index": idx
                    }
                    generated_files.append(var_item)
                    logger.info(f"Variation {idx} saved to {final_path} (Duration: {var_item['duration']}s)")

                    if on_variation_complete:
                        try:
                            on_variation_complete(var_item, idx, len(personas))
                        except Exception as ce:
                            logger.warning(f"on_variation_complete callback error: {ce}")

                except Exception as e:
                    logger.error(f"Variation {idx} failed: {e}", exc_info=True)

                finally:
                    # Cleanup intermediates
                    for temp_file in [clip_path, ass_path, subbed_path]:
                        if os.path.exists(temp_file):
                            try:
                                os.remove(temp_file)
                            except Exception:
                                pass

        return generated_files


master_agent = MasterAIAgent()
