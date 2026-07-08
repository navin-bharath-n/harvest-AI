import os
import logging
from pathlib import Path
from app.core.celery_app import celery_app
from app.core.database import SessionLocal
from app import models

logger = logging.getLogger(__name__)

# Absolute path to the backend directory — anchors all relative upload paths
_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent  # backend/

@celery_app.task(ignore_result=True)
def process_video_task(video_id: int):
    logger.info(f"Starting to process video {video_id}")

    db = SessionLocal()
    try:
        video = db.query(models.Video).filter(models.Video.id == video_id).first()
        if not video:
            logger.error(f"Video {video_id} not found")
            return

        video.status = models.VideoStatus.PROCESSING
        db.commit()

        # Resolve video path to an absolute path anchored to the backend directory
        if os.path.isabs(video.storage_path):
            video_path = video.storage_path
        else:
            video_path = str(_BACKEND_DIR / video.storage_path)

        if not os.path.exists(video_path):
            logger.error(f"Video file not found at {video_path}")
            video.status = models.VideoStatus.FAILED
            db.commit()
            return

        logger.info(f"Processing video {video_id} at {video_path} using FFmpeg...")
        from app.services.video_processor import VideoProcessor
        processor = VideoProcessor()
        results = processor.process(video_path)

        # Update database with results
        video.duration = results.get("duration")
        video.resolution = results.get("resolution")
        video.fps = results.get("fps")
        video.bitrate = results.get("bitrate")
        video.audio_path = results.get("audio_path")
        video.frame_directory = results.get("frame_directory")
        video.short_path = results.get("short_path")

        video.status = models.VideoStatus.COMPLETED
        db.commit()
        logger.info(f"Successfully processed video {video_id}")
    except Exception as e:
        logger.error(f"Error processing video {video_id}: {e}", exc_info=True)
        db.rollback()

        video = db.query(models.Video).filter(models.Video.id == video_id).first()
        if video:
            video.status = models.VideoStatus.FAILED
            db.commit()
    finally:
        db.close()

@celery_app.task(ignore_result=True)
def transcribe_video_task(video_id: int):
    logger.info(f"Starting to transcribe video {video_id}")

    db = SessionLocal()
    try:
        video = db.query(models.Video).filter(models.Video.id == video_id).first()
        if not video:
            logger.error(f"Video {video_id} not found")
            return

        if not video.audio_path:
            logger.error(f"Video {video_id} has no audio path")
            video.transcription_status = models.TranscriptionStatus.FAILED
            db.commit()
            return

        video.transcription_status = models.TranscriptionStatus.PROCESSING
        db.commit()

        logger.info(f"Transcribing audio for video {video_id}...")
        from app.services.transcription_service import transcription_service
        transcript = transcription_service.transcribe(video.audio_path)

        # Update database with results
        video.transcript = transcript
        video.transcription_status = models.TranscriptionStatus.COMPLETED
        db.commit()
        logger.info(f"Successfully transcribed video {video_id}")
    except Exception as e:
        logger.error(f"Error transcribing video {video_id}: {e}")
        db.rollback()

        video = db.query(models.Video).filter(models.Video.id == video_id).first()
        if video:
            video.transcription_status = models.TranscriptionStatus.FAILED
            db.commit()
    finally:
        db.close()

@celery_app.task(ignore_result=True)
def analyze_content_task(video_id: int):
    logger.info(f"Starting to analyze content for video {video_id}")

    db = SessionLocal()
    try:
        video = db.query(models.Video).filter(models.Video.id == video_id).first()
        if not video:
            logger.error(f"Video {video_id} not found")
            return

        # Check transcript length
        transcript_len = len(video.transcript) if video.transcript else 0

        # Determine absolute audio path
        audio_path = video.audio_path
        if audio_path and not os.path.isabs(audio_path):
            _app_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
            audio_path = os.path.join(_app_dir, audio_path)

        # Fallback to audio highlights if transcript is empty/short
        if transcript_len < 5 and audio_path and os.path.exists(audio_path):
            video.analysis_status = models.ContentAnalysisStatus.PROCESSING
            db.commit()

            logger.info(f"Transcript is empty/short for video {video_id}. Detecting highlights using audio peaks...")
            from app.services.audio_analyzer import detect_audio_highlights
            audio_highlights = detect_audio_highlights(audio_path)

            video.content_analysis = {
                "topic": "Gameplay Highlight",
                "summary": "Highlight detected directly from wave audio amplitude peaks.",
                "importance_scores": audio_highlights
            }
            video.analysis_status = models.ContentAnalysisStatus.COMPLETED
            db.commit()
            logger.info(f"Successfully analyzed video {video_id} using audio peak detection.")
            return

        if not video.transcript:
            logger.error(f"Video {video_id} has no transcript. Must be transcribed first.")
            video.analysis_status = models.ContentAnalysisStatus.FAILED
            db.commit()
            return

        video.analysis_status = models.ContentAnalysisStatus.PROCESSING
        db.commit()

        logger.info(f"Sending video {video_id} transcript to Qwen AI...")
        from app.services.content_understanding_service import content_understanding_service

        metadata = {
            "duration": video.duration,
            "resolution": video.resolution,
            "fps": video.fps
        }

        analysis_result = content_understanding_service.analyze(video.transcript, metadata)

        # Update database with results
        video.content_analysis = analysis_result
        video.analysis_status = models.ContentAnalysisStatus.COMPLETED
        db.commit()
        logger.info(f"Successfully analyzed video {video_id}")
    except Exception as e:
        logger.error(f"Error analyzing video {video_id}: {e}")
        db.rollback()

        video = db.query(models.Video).filter(models.Video.id == video_id).first()
        if video:
            video.analysis_status = models.ContentAnalysisStatus.FAILED
            db.commit()
    finally:
        db.close()

@celery_app.task(ignore_result=True)
def detect_highlights_task(video_id: int):
    logger.info(f"Starting highlight detection for video {video_id}")

    db = SessionLocal()
    try:
        video = db.query(models.Video).filter(models.Video.id == video_id).first()
        if not video:
            logger.error(f"Video {video_id} not found")
            return

        # Check transcript length
        transcript_len = len(video.transcript) if video.transcript else 0

        # Fallback to audio highlights if transcript is empty/short
        if transcript_len < 5 and video.content_analysis:
            video.highlight_status = models.HighlightDetectionStatus.PROCESSING
            db.commit()

            logger.info(f"Transcript is empty/short for video {video_id}. Building highlights directly from audio analysis.")
            audio_highlights = video.content_analysis.get("importance_scores", [])
            clips = []
            for idx, h in enumerate(audio_highlights):
                clips.append({
                    "start_time": h["start"],
                    "end_time": h["end"],
                    "importance_score": int(h["score"] * 10),
                    "viral_score": int(h["score"] * 10),
                    "reason": h["reason"],
                    "title": f"Action Highlight {idx + 1}"
                })

            video.highlights = {"clips": clips}
            video.highlight_status = models.HighlightDetectionStatus.COMPLETED
            db.commit()
            logger.info(f"Successfully detected highlights for video {video_id} via audio peaks.")
            return

        if not video.transcript or not video.content_analysis:
            logger.error(f"Video {video_id} is missing transcript or content analysis.")
            video.highlight_status = models.HighlightDetectionStatus.FAILED
            db.commit()
            return

        video.highlight_status = models.HighlightDetectionStatus.PROCESSING
        db.commit()

        logger.info(f"Sending video {video_id} data to Qwen AI for highlight detection...")
        from app.services.highlight_detection_service import highlight_detection_service

        highlights_result = highlight_detection_service.detect(video.transcript, video.content_analysis)

        # Update database with results
        video.highlights = highlights_result
        video.highlight_status = models.HighlightDetectionStatus.COMPLETED
        db.commit()
        logger.info(f"Successfully detected highlights for video {video_id}")
    except Exception as e:
        logger.error(f"Error detecting highlights for video {video_id}: {e}")
        db.rollback()

        video = db.query(models.Video).filter(models.Video.id == video_id).first()
        if video:
            video.highlight_status = models.HighlightDetectionStatus.FAILED
            db.commit()
    finally:
        db.close()

@celery_app.task(ignore_result=True)
def generate_smart_crop_task(video_id: int, target_fps: int = 5):
    logger.info(f"Starting smart cropping for video {video_id} at {target_fps} FPS")

    db = SessionLocal()
    try:
        video = db.query(models.Video).filter(models.Video.id == video_id).first()
        if not video:
            logger.error(f"Video {video_id} not found")
            return

        video.crop_status = models.CropStatus.PROCESSING
        db.commit()

        # Resolve video path to absolute, anchored to backend dir
        if os.path.isabs(video.storage_path):
            video_path = video.storage_path
        else:
            video_path = str(_BACKEND_DIR / video.storage_path)

        if not os.path.exists(video_path):
            logger.error(f"Video file not found at {video_path}")
            video.crop_status = models.CropStatus.FAILED
            db.commit()
            return

        from app.services.smart_cropping_service import smart_cropping_service
        crop_metadata = smart_cropping_service.generate_crop_metadata(video_path, target_fps)

        video.crop_metadata = crop_metadata
        video.crop_status = models.CropStatus.COMPLETED
        db.commit()
        logger.info(f"Successfully generated smart crop for video {video_id}")

    except Exception as e:
        logger.error(f"Error generating smart crop for video {video_id}: {e}", exc_info=True)
        db.rollback()

        video = db.query(models.Video).filter(models.Video.id == video_id).first()
        if video:
            video.crop_status = models.CropStatus.FAILED
            db.commit()
    finally:
        db.close()

@celery_app.task(ignore_result=True)
def render_clip_task(clip_id: int):
    logger.info(f"Starting to render clip {clip_id}")
    db = SessionLocal()
    try:
        clip = db.query(models.Clip).filter(models.Clip.id == clip_id).first()
        if not clip:
            logger.error(f"Clip {clip_id} not found")
            return

        video = clip.video
        if not video:
            logger.error(f"Cannot render clip {clip_id}: missing video")
            clip.status = models.ClipStatus.FAILED
            db.commit()
            return

        import os
        import uuid
        if os.path.isabs(video.storage_path):
            video_path = video.storage_path
        else:
            video_path = str(_BACKEND_DIR / video.storage_path)

        # Check if we have crop trajectory; if not, calculate on the fly
        has_crop_trajectory = (
            video.crop_metadata is not None
            and isinstance(video.crop_metadata, dict)
            and video.crop_metadata.get("trajectory")
        )

        if not has_crop_trajectory:
            logger.info(f"No crop trajectory found for video {video.id}. Generating on the fly...")
            try:
                from app.services.smart_cropping_service import smart_cropping_service
                crop_data = smart_cropping_service.generate_crop_metadata(video_path)
                video.crop_metadata = crop_data
                video.crop_status = models.CropStatus.COMPLETED
                db.commit()
                has_crop_trajectory = True
                logger.info("Successfully generated crop trajectory on the fly.")
            except Exception as e:
                logger.warning(f"Failed to generate crop metadata on the fly: {e}")

        clip.status = models.ClipStatus.RENDERING
        db.commit()

        # Ensure clips directory exists
        clips_dir = os.path.join(os.path.dirname(video_path), "clips")
        os.makedirs(clips_dir, exist_ok=True)

        output_filename = f"clip_{uuid.uuid4().hex[:8]}.mp4"
        output_path = os.path.join(clips_dir, output_filename)

        # Compute path relative to the app dir so the frontend can serve it via /uploads/
        # _BACKEND_DIR is defined at module level as the backend/ directory
        _app_dir = str(_BACKEND_DIR / "app")
        relative_path = os.path.relpath(output_path, _app_dir).replace("\\", "/")

        # Determine edit options
        edit_options = clip.edit_options or {}
        prompt = edit_options.get("prompt")
        instructions = {}

        # 1. Parse prompt if provided
        if prompt:
            from app.services.prompt_editing_agent import prompt_editing_agent
            try:
                instructions = prompt_editing_agent.parse_prompt(prompt)
                logger.info(f"Parsed AI prompt '{prompt}': {instructions}")
                # Map music_style to music_preset since prompt parser returns music_style
                if "music_style" in instructions and "music_preset" not in instructions:
                    instructions["music_preset"] = instructions["music_style"]
            except Exception as pe:
                logger.warning(f"Failed to parse edit prompt: {pe}")

        # 2. Merge manual edits (manual settings take precedence over AI prompt parser only if changed from defaults)
        ai_controlled_keys = {"caption_style", "zooms", "music_preset", "music_style", "language", "transition"}
        for key, val in edit_options.items():
            if key != "prompt" and val is not None:
                if prompt and key in ai_controlled_keys:
                    # Let the AI prompt's parsed value take precedence UNLESS the user manually changed it from the default.
                    is_default = False
                    if key == "caption_style" and val == "standard":
                        is_default = True
                    elif key == "zooms" and val == "none":
                        is_default = True
                    elif key == "music_preset" and val == "none":
                        is_default = True
                    elif key == "music_style" and val == "none":
                        is_default = True
                    elif key == "transition" and val == "fade":
                        is_default = True

                    if not is_default:
                        instructions[key] = val
                    else:
                        # Keep AI parsed instruction if present
                        if key == "music_preset" and "music_preset" in instructions:
                            pass
                        elif key == "music_preset" and "music_style" in instructions:
                            instructions["music_preset"] = instructions["music_style"]
                        elif key in instructions:
                            pass
                        else:
                            instructions[key] = val
                else:
                    instructions[key] = val

        # Intermediate rendering paths
        variation_base = os.path.join(clips_dir, f"temp_edit_{uuid.uuid4().hex[:8]}")
        cropped_path = f"{variation_base}_crop.mp4"
        ass_path = f"{variation_base}_subs.ass"
        subbed_path = f"{variation_base}_subbed.mp4"

        # 3. Filter and shift subtitles
        manual_subs = edit_options.get("subtitles")
        shifted_words = []
        absolute_words = []
        if manual_subs:
            logger.info("Using manually edited subtitles from edit options.")
            for w in manual_subs:
                start_val = float(w["start"])
                end_val = float(w["end"])
                if start_val >= clip.start_time and end_val <= clip.end_time:
                    absolute_words.append({
                        "start": start_val,
                        "end": end_val,
                        "text": w["text"]
                    })
                    shifted_words.append({
                        "start": start_val - clip.start_time,
                        "end": end_val - clip.start_time,
                        "text": w["text"]
                    })
        else:
            full_transcript = video.transcript or []
            part_words = [w for w in full_transcript if w["start"] >= clip.start_time and w["end"] <= clip.end_time]
            for w in part_words:
                absolute_words.append({
                    "start": w["start"],
                    "end": w["end"],
                    "text": w["text"]
                })
                shifted_words.append({
                    "start": w["start"] - clip.start_time,
                    "end": w["end"] - clip.start_time,
                    "text": w["text"]
                })

        # 4. Translate subtitles based on caption language configuration
        translate_lang = instructions.get("translate_language", "none")
        if translate_lang == "none":
            translate_lang = instructions.get("language", "none")

        caption_lang_opt = instructions.get("caption_language", "translated")
        dub_voice = instructions.get("dub_voice", False)
        dub_mix_mode = instructions.get("dub_mix_mode", "replace")

        from app.services.translation_service import translate_and_distribute_words
        orig_shifted_words = shifted_words.copy()

        if caption_lang_opt == "none":
            shifted_words = []
        elif caption_lang_opt == "original":
            pass
        elif caption_lang_opt == "english":
            if translate_lang != "en" and translate_lang != "none":
                try:
                    shifted_words = translate_and_distribute_words(orig_shifted_words, "en")
                except Exception as te:
                    logger.warning(f"Subtitle translation to English failed: {te}")
            else:
                try:
                    shifted_words = translate_and_distribute_words(orig_shifted_words, "en")
                except Exception as te:
                    logger.warning(f"Subtitle translation to English failed: {te}")
        elif caption_lang_opt == "translated":
            if translate_lang != "none" and translate_lang != "en":
                try:
                    shifted_words = translate_and_distribute_words(orig_shifted_words, translate_lang)
                except Exception as te:
                    logger.warning(f"Subtitle translation failed: {te}")
            elif translate_lang == "en":
                try:
                    shifted_words = translate_and_distribute_words(orig_shifted_words, "en")
                except Exception as te:
                    logger.warning(f"Subtitle translation failed: {te}")

        # Dub voice if requested
        dubbed_audio_path = None
        speaker_gender = edit_options.get("speaker_gender", "female")
        if dub_voice and translate_lang != "none" and video.audio_path:
            logger.info(f"Voice dubbing requested to language: {translate_lang} (Gender: {speaker_gender})")
            from app.services.voice_service import voice_service

            # Resolve absolute path to original audio
            if os.path.isabs(video.audio_path):
                abs_audio_path = video.audio_path
            else:
                abs_audio_path = os.path.join(os.path.dirname(video_path), os.path.basename(video.audio_path))

            if os.path.exists(abs_audio_path):
                try:
                    dubbed_audio_path = f"{variation_base}_dubbed.wav"
                    voice_service.dub_voice(
                        original_audio_path=abs_audio_path,
                        transcript_words=absolute_words,
                        target_lang=translate_lang,
                        start_time=clip.start_time,
                        end_time=clip.end_time,
                        output_path=dubbed_audio_path,
                        mix_mode=dub_mix_mode,
                        speaker_gender=speaker_gender
                    )
                    logger.info("Successfully generated dubbed audio track.")
                except Exception as de:
                    logger.error(f"Voice dubbing failed: {de}", exc_info=True)
                    dubbed_audio_path = None

        # 5. Generate subtitles ASS file
        caption_preset = instructions.get("caption_style", "standard")
        has_subtitles = caption_preset != "none" and len(shifted_words) > 0

        if has_subtitles:
            from app.services.subtitle_service import subtitle_service
            style_config = {
                "caption_style": caption_preset,
                "font_name": instructions.get("font_name"),
                "font_size": instructions.get("font_size"),
                "primary_color": instructions.get("primary_color"),
                "highlight_color": instructions.get("highlight_color"),
                "outline_size": instructions.get("outline_size"),
                "alignment": instructions.get("alignment"),
                "margin_v": instructions.get("margin_v")
            }
            # Clean styling overrides
            style_config = {k: v for k, v in style_config.items() if v is not None}

            try:
                subtitle_service.generate_ass(shifted_words, ass_path, style_config)
            except Exception as se:
                logger.error(f"Subtitle ASS generation failed: {se}")
                has_subtitles = False

        # 6. OpenCV crop rendering with zooms and transitions (if crop trajectory available)
        temp_video_source = subbed_path if has_subtitles else cropped_path

        if has_crop_trajectory:
            from app.services.clip_rendering_service import clip_rendering_service
            clip_rendering_service.render_clip(
                video_path=video_path,
                output_path=temp_video_source,
                start_time=clip.start_time,
                end_time=clip.end_time,
                crop_trajectory=video.crop_metadata["trajectory"],
                editing_instructions=instructions,
                subtitle_path=ass_path if has_subtitles else None
            )
        else:
            # Fallback: direct FFmpeg trim (no smart crop, but respects start/end times and burns subtitles if needed)
            logger.info(f"No crop trajectory for clip {clip_id}, using direct FFmpeg trim fallback.")
            import subprocess
            duration = clip.end_time - clip.start_time

            ffmpeg_cmd = [
                "ffmpeg", "-y",
                "-loglevel", "error",
                "-ss", str(clip.start_time),
                "-t", str(duration),
                "-i", video_path,
            ]

            if has_subtitles:
                import shutil
                ext = os.path.splitext(ass_path)[1]
                temp_sub_name = f"_tmp_sub_{uuid.uuid4().hex[:8]}{ext}"
                temp_sub_path = os.path.join(os.getcwd(), temp_sub_name)
                shutil.copy2(ass_path, temp_sub_path)
                safe_sub_path = temp_sub_name

                ffmpeg_cmd.extend(["-vf", f"subtitles='{safe_sub_path}'"])

            ffmpeg_cmd.extend([
                "-c:v", "libx264", "-preset", "fast", "-crf", "18", # Higher quality encoding
                "-c:a", "aac", "-b:a", "128k",
                "-movflags", "+faststart",
                temp_video_source
            ])

            try:
                result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
                if result.returncode != 0:
                    raise RuntimeError(f"FFmpeg trim failed: {result.stderr[-500:]}")
            finally:
                if has_subtitles and 'temp_sub_path' in locals() and os.path.exists(temp_sub_path):
                    try:
                        os.remove(temp_sub_path)
                    except Exception:
                        pass

        # 6.5. Replace video audio with dubbed audio if available
        if dubbed_audio_path and os.path.exists(dubbed_audio_path):
            import shutil
            import subprocess
            logger.info(f"Replacing render audio with dubbed audio: {dubbed_audio_path}")
            temp_dubbed_video = f"{variation_base}_temp_dubbed.mp4"
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

        # 7. Mix music track
        music_style = instructions.get("music_style", "none")
        music_preset = instructions.get("music_preset", music_style)
        music_track = None
        disable_music = True

        if music_preset and music_preset != "none":
            from app.services.music_agent import music_agent
            music_track = music_agent.recommend_music({"style": music_preset})
            disable_music = False

        from app.services.music_agent import music_agent
        try:
            vol = instructions.get("music_volume")
            vol_val = float(vol) if vol is not None else (0.15 if len(shifted_words) > 0 else 1.0)
            music_agent.apply_music(
                video_path=temp_video_source,
                music_path=music_track,
                output_path=output_path,
                options={
                    "disable_music": disable_music,
                    "has_voice": len(shifted_words) > 0,
                    "volume": vol_val
                }
            )
        except Exception as me:
            logger.error(f"Music mix failed, copying directly: {me}")
            import subprocess
            subprocess.run(["ffmpeg", "-y", "-i", temp_video_source, "-c", "copy", output_path], capture_output=True)

        # Cleanup intermediate files
        for fpath in [cropped_path, ass_path, subbed_path]:
            if os.path.exists(fpath) and fpath != output_path:
                try:
                    os.remove(fpath)
                except Exception as ex:
                    logger.warning(f"Failed to remove temp file {fpath}: {ex}")

        clip.storage_path = relative_path
        clip.status = models.ClipStatus.COMPLETED
        db.commit()
        logger.info(f"Successfully rendered clip {clip_id} to {relative_path}")

    except Exception as e:
        logger.error(f"Error rendering clip {clip_id}: {e}")
        db.rollback()

        clip = db.query(models.Clip).filter(models.Clip.id == clip_id).first()
        if clip:
            clip.status = models.ClipStatus.FAILED
            db.commit()
    finally:
        db.close()

@celery_app.task(ignore_result=True)
def generate_master_shorts_task(
    video_id: int,
    length: float,
    platform: str,
    optional_prompt: str,
    translate_language: str = "none",
    dub_voice: bool = False,
    caption_language: str = "translated",
    dub_mix_mode: str = "replace",
    speaker_gender: str = "female"
):
    logger.info(f"Starting master shorts generation for video {video_id}")
    db = SessionLocal()
    try:
        video = db.query(models.Video).filter(models.Video.id == video_id).first()
        if not video:
            logger.error(f"Video {video_id} not found")
            return

        # Reset statuses so progress displays correctly in UI
        from app.models.video import VideoStatus, TranscriptionStatus, ContentAnalysisStatus, HighlightDetectionStatus, CropStatus
        video.status = VideoStatus.PROCESSING
        video.transcription_status = TranscriptionStatus.NONE
        video.analysis_status = ContentAnalysisStatus.NONE
        video.highlight_status = HighlightDetectionStatus.NONE
        video.crop_status = CropStatus.NONE
        db.commit()

        import os
        import shutil
        import uuid
        from app.services.master_agent import master_agent

        # Build absolute video path — storage_path may be relative like "uploads/uuid.mp4"
        # Anchor it to the backend/app directory where uploads are stored
        _app_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        if os.path.isabs(video.storage_path):
            video_path = video.storage_path
        else:
            video_path = os.path.join(_app_dir, video.storage_path)

        if not os.path.exists(video_path):
            logger.error(f"Video file not found at {video_path}")
            return

        logger.info(f"Processing video at absolute path: {video_path}")

        def _update_progress(stage: str):
            from app.models import VideoStatus, TranscriptionStatus, ContentAnalysisStatus
            video.status = VideoStatus.COMPLETED
            if stage == "transcribing":
                video.transcription_status = TranscriptionStatus.PROCESSING
            elif stage == "analyzing":
                video.transcription_status = TranscriptionStatus.COMPLETED
                video.analysis_status = ContentAnalysisStatus.PROCESSING
            elif stage == "rendering":
                video.analysis_status = ContentAnalysisStatus.COMPLETED
            db.commit()

        results = master_agent.generate_shorts(
            video_path=video_path,
            length=length,
            platform=platform,
            optional_prompt=optional_prompt,
            progress_callback=_update_progress,
            db_video=video,
            translate_language=translate_language,
            dub_voice=dub_voice,
            caption_language=caption_language,
            dub_mix_mode=dub_mix_mode,
            speaker_gender=speaker_gender
        )

        # Save the results as Clip records
        clips_dir = os.path.join(os.path.dirname(video_path), "clips")
        os.makedirs(clips_dir, exist_ok=True)

        for i, item in enumerate(results):
            start_val = 0.0
            end_val = length

            if isinstance(item, dict):
                path = item["path"]
                title = item["title"]
                clip_dur = item.get("duration", length)
                start_val = item.get("start_time", 0.0)
                end_val = item.get("end_time", start_val + clip_dur)
                # Form descriptive filename based on title
                sanitized_title = title.lower().replace(" ", "_").replace("-", "")
                output_filename = f"{sanitized_title}_{uuid.uuid4().hex[:8]}.mp4"
            else:
                path = item
                title = f"Master Variation {i+1}"
                clip_dur = length
                end_val = length
                output_filename = f"variation_{i+1}_{uuid.uuid4().hex[:8]}.mp4"

            if not path or not os.path.exists(path):
                logger.warning(f"Result file not found at {path}, skipping.")
                continue

            final_path = os.path.join(clips_dir, output_filename)
            shutil.copy2(path, final_path)

            # Store path relative to app dir for serving via /uploads/
            rel_path = os.path.relpath(final_path, _app_dir).replace("\\", "/")

            db_clip = models.Clip(
                video_id=video_id,
                title=title,
                start_time=start_val,
                end_time=end_val,
                duration=clip_dur,
                status=models.ClipStatus.COMPLETED,
                storage_path=rel_path
            )
            db.add(db_clip)

        db.commit()
        logger.info(f"Successfully generated {len(results)} master variations for video {video_id}")

    except Exception as e:
        logger.error(f"Error generating master variations for video {video_id}: {e}", exc_info=True)
        db.rollback()
    finally:
        db.close()

@celery_app.task(ignore_result=True)
def publish_video_task(clip_id: int, config: dict):
    logger.info(f"Starting social publishing task for clip {clip_id} with config {config}")

    db = SessionLocal()
    try:
        clip = db.query(models.Clip).filter(models.Clip.id == clip_id).first()
        if not clip:
            logger.error(f"Clip {clip_id} not found")
            return

        platforms = config.get("platforms", [])
        title = config.get("title", "")
        description = config.get("description", "")
        privacy = config.get("privacy", "public")

        # Resolve absolute path to video
        _app_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        if clip.storage_path:
            video_path = os.path.join(_app_dir, clip.storage_path) if not os.path.isabs(clip.storage_path) else clip.storage_path
        else:
            logger.error(f"Clip {clip_id} has no storage path, cannot publish")
            return

        # Publish to selected platforms using SocialPublishService
        from app.services.social_publish_service import SocialPublishService

        # Load credentials from database for this owner
        user_id = clip.video.project.owner_id if (clip.video and clip.video.project) else 1
        db_connections = db.query(models.SocialConnection).filter(models.SocialConnection.user_id == user_id).all()
        db_configs = {}
        for conn in db_connections:
            creds = conn.credentials or {}
            for k, v in creds.items():
                db_configs[k] = v

        # Request credentials can override DB credentials
        req_configs = config.get("platform_configs") or {}
        platform_configs = {**db_configs, **req_configs}

        published_urls = clip.published_urls or {}
        if not isinstance(published_urls, dict):
            published_urls = dict(published_urls)

        for platform in platforms:
            publish_config = {
                "title": title,
                "description": description,
                "privacy": privacy,
                "youtube_access_token": platform_configs.get("youtube_access_token"),
                "youtube_refresh_token": platform_configs.get("youtube_refresh_token"),
                "facebook_access_token": platform_configs.get("facebook_access_token"),
                "facebook_page_id": platform_configs.get("facebook_page_id"),
                "instagram_access_token": platform_configs.get("instagram_access_token"),
                "instagram_business_id": platform_configs.get("instagram_business_id"),
                "public_video_url": platform_configs.get("public_video_url")
            }
            try:
                res = SocialPublishService.publish_clip(video_path, platform, publish_config)
                logger.info(f"Publish result for platform {platform}: {res}")
                if res.get("status") == "success" and res.get("video_url"):
                    published_urls[platform] = res["video_url"]
                    updated_token = res.get("updated_access_token")
                    if updated_token:
                        for conn in db_connections:
                            if conn.platform == platform:
                                updated_credentials = {**(conn.credentials or {})}
                                updated_credentials[f"{platform}_access_token"] = updated_token
                                conn.credentials = updated_credentials
                                from sqlalchemy.orm.attributes import flag_modified
                                flag_modified(conn, "credentials")
                                db.commit()
                                logger.info(f"Successfully updated access token for platform {platform} in DB connection.")
                                break
            except Exception as pe:
                logger.error(f"Error publishing to {platform} for clip {clip_id}: {pe}", exc_info=True)
                published_urls[platform] = f"error: {str(pe)}"

        from sqlalchemy.orm.attributes import flag_modified
        clip.published_urls = published_urls
        flag_modified(clip, "published_urls")
        db.commit()

        logger.info(f"Successfully processed publishing request for clip {clip_id}")
    except Exception as e:
        logger.error(f"Error during social publishing of clip {clip_id}: {e}", exc_info=True)
    finally:
        db.close()
