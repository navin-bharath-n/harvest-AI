import os
import logging
from pathlib import Path
from app.core.celery_app import celery_app
from app.core.database import SessionLocal
from app import models
from app.core.config import settings
from sqlalchemy.orm.attributes import flag_modified

logger = logging.getLogger(__name__)

# Absolute path to the backend directory — anchors all relative upload paths
_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent  # backend/

def _safe_relpath(path: str, start: str) -> str:
    """Like os.path.relpath but never raises ValueError on Windows cross-drive paths.

    On Windows, os.path.relpath('C:\\foo', 'D:\\bar') raises ValueError because
    you cannot express a relative path between two different drive letters.
    In that case we fall back to the absolute path (forward-slash normalised) so
    the stored storage_path is still a valid, usable string.
    """
    try:
        return os.path.relpath(path, start).replace("\\", "/")
    except ValueError:
        # Different drives on Windows — store the absolute path instead
        return path.replace("\\", "/")

def _resolve_video_path(storage_path: str) -> str:
    """Robust cross-platform path resolver for local Windows and cloud Linux (Docker/Render)."""
    if not storage_path:
        return ""
    from app.services import object_storage
    if object_storage.is_remote(storage_path):
        return object_storage.local_path(storage_path)
    if os.path.exists(storage_path):
        return os.path.abspath(storage_path)
    normalized = storage_path.replace("\\", "/").lstrip("/")
    candidate_rel = os.path.join(str(_BACKEND_DIR), normalized)
    if os.path.exists(candidate_rel):
        return os.path.abspath(candidate_rel)
    fname = os.path.basename(storage_path)
    candidate_uploads = os.path.join(str(_BACKEND_DIR), "uploads", fname)
    if os.path.exists(candidate_uploads):
        return os.path.abspath(candidate_uploads)
    candidate_clips = os.path.join(str(_BACKEND_DIR), "uploads", "clips", fname)
    if os.path.exists(candidate_clips):
        return os.path.abspath(candidate_clips)
    return candidate_rel


def _resolve_or_extract_video_audio(video: models.Video, video_path: str, db) -> str:
    """Resolve cached/local/R2 source audio, rebuilding it from the video when missing."""
    from app.services import object_storage

    if video.audio_path:
        try:
            resolved = _resolve_video_path(video.audio_path)
            if os.path.isfile(resolved) and os.path.getsize(resolved) > 0:
                return resolved
            logger.warning(
                "Stored audio for video %s is unavailable at %s; extracting it again from the source video",
                video.id,
                video.audio_path,
            )
        except Exception as error:
            logger.warning(
                "Could not fetch stored audio for video %s (%s); rebuilding from the source video",
                video.id,
                error,
            )

    if not os.path.isfile(video_path):
        raise FileNotFoundError(f"Source video is unavailable; cannot rebuild audio for video {video.id}")

    audio_dir = os.path.join(str(_BACKEND_DIR), "uploads", "audio")
    os.makedirs(audio_dir, exist_ok=True)
    audio_path = os.path.join(audio_dir, f"video_{video.id}_source.mp3")
    command = [
        "ffmpeg", "-y", "-nostdin", "-loglevel", "error",
        "-i", video_path, "-vn", "-af", "highpass=f=80,lowpass=f=7500,volume=1.2", "-ac", "1", "-ar", "16000", "-b:a", "64k",
        "-threads", "0", audio_path,
    ]
    try:
        import subprocess
        subprocess.run(command, check=True, capture_output=True, timeout=300)
    except Exception as error:
        try:
            if os.path.exists(audio_path):
                os.remove(audio_path)
        except OSError:
            pass
        raise RuntimeError(f"Could not extract source audio for video {video.id}: {error}") from error

    if not os.path.isfile(audio_path) or os.path.getsize(audio_path) == 0:
        raise RuntimeError(f"FFmpeg produced no source audio for video {video.id}")

    if object_storage.enabled():
        video.audio_path = object_storage.upload_file(
            audio_path, f"audio/video_{video.id}/source-audio.mp3", "audio/mpeg"
        )
    else:
        video.audio_path = _safe_relpath(audio_path, str(_BACKEND_DIR))
    db.commit()
    logger.info("Recovered source audio for video %s at %s", video.id, video.audio_path)
    return audio_path

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
        video_path = _resolve_video_path(video.storage_path)

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
def transcribe_video_task(video_id: int, language: str = None):
    logger.info(f"Starting to transcribe video {video_id} [Language={language}]")

    db = SessionLocal()
    try:
        video = db.query(models.Video).filter(models.Video.id == video_id).first()
        if not video:
            logger.error(f"Video {video_id} not found")
            return

        video_path = _resolve_video_path(video.storage_path)
        if not video.audio_path:
            audio_path = _resolve_or_extract_video_audio(video, video_path, db)
        else:
            audio_path = _resolve_video_path(video.audio_path)
            if not os.path.exists(audio_path):
                audio_path = _resolve_or_extract_video_audio(video, video_path, db)

        if not audio_path or not os.path.exists(audio_path):
            logger.error(f"Video {video_id} has no valid audio path and audio extraction failed")
            video.transcription_status = models.TranscriptionStatus.FAILED
            db.commit()
            return

        video.transcription_status = models.TranscriptionStatus.PROCESSING
        db.commit()

        logger.info(f"Transcribing audio for video {video_id} at {audio_path} [Lang={language}]...")
        from app.services.transcription_service import transcription_service, normalize_whisper_language
        norm_lang = normalize_whisper_language(language)
        transcript = transcription_service.transcribe(audio_path, language=norm_lang)

        # Update database with results
        video.transcript = transcript
        flag_modified(video, "transcript")
        video.transcription_status = models.TranscriptionStatus.COMPLETED

        meta_dict = dict(video.content_analysis or {})
        meta_dict["transcription_meta"] = {
            "language": norm_lang or "auto",
            "provider": transcription_service.last_provider or "unknown",
            "model": transcription_service.last_model or "unknown",
            "word_count": len(transcript),
            "chunked": True if (video.duration and video.duration > 180) else False,
            "version": 3
        }
        video.content_analysis = meta_dict
        flag_modified(video, "content_analysis")

        db.commit()
        sample_w = transcript[0]["text"] if transcript else ""
        logger.info(
            f"[Checkpoint C - DB Transcript Roundtrip] VideoID={video_id} "
            f"Words={len(transcript)} Lang={norm_lang or 'auto'} Status=COMPLETED First='{sample_w[:15]}'"
        )
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
def extract_top5_highlights_task(video_id: int, target_length: float = 30.0):
    """
    Lightweight, low-memory AI highlight extraction task:
    1. Extracts fast 64k mono MP3 audio using FFmpeg (takes ~1s, <20MB RAM)
    2. Transcribes with Groq Whisper API (takes ~3s, 0% server CPU/RAM)
    3. Analyzes content with Groq Llama 3.3 (takes ~1s, 0% server CPU/RAM)
    4. Detects Top 5 highlights with Groq Llama 3.3 (takes ~1s, 0% server CPU/RAM)
    5. Slices 5 fast audio preview MP3s of the original audio for instant browser playback
    6. Saves Top 5 moments with audio preview URLs into video.highlights
    Uses <60MB RAM total (100% safe on 512MB RAM instances).
    """
    import gc
    import subprocess
    import uuid
    from app.services.transcription_service import transcription_service
    from app.services.content_understanding_service import content_understanding_service
    from app.services.highlight_detection_service import highlight_detection_service

    logger.info(f"Starting low-memory top 5 highlight extraction for video {video_id}")
    db = SessionLocal()
    try:
        video = db.query(models.Video).filter(models.Video.id == video_id).first()
        if not video:
            logger.error(f"Video {video_id} not found")
            return

        transcript_is_cached = (
            video.transcription_status == models.TranscriptionStatus.COMPLETED
            and isinstance(video.transcript, list)
            and bool(video.transcript)
        )
        analysis_is_cached = (
            video.analysis_status == models.ContentAnalysisStatus.COMPLETED
            and isinstance(video.content_analysis, dict)
            and bool(video.content_analysis)
        )
        video.status = models.VideoStatus.PROCESSING
        if not transcript_is_cached:
            video.transcription_status = models.TranscriptionStatus.PROCESSING
        db.commit()

        # 1. Resolve video path
        video_path = _resolve_video_path(video.storage_path)

        if not os.path.exists(video_path):
            logger.error(f"Video file not found at {video_path}")
            video.status = models.VideoStatus.FAILED
            db.commit()
            return

        base_name = os.path.splitext(os.path.basename(video_path))[0]
        # Anchor assets directory to uploads/{base_name}
        assets_dir = os.path.join(os.path.dirname(video_path), base_name)
        os.makedirs(assets_dir, exist_ok=True)

        # 2. Detect whether the video actually has an audio stream before trying to extract.
        #    ffmpeg -vn on a video-only file gives "Output file does not contain any stream"
        #    (EINVAL, exit 4294967274 on Windows / 234 on Linux) — guard against this first.
        has_audio = False
        try:
            probe_result = subprocess.run(
                [
                    "ffprobe", "-v", "error",
                    "-select_streams", "a:0",
                    "-show_entries", "stream=codec_type",
                    "-of", "default=noprint_wrappers=1:nokey=1",
                    video_path,
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                timeout=15,
            )
            has_audio = bool(probe_result.stdout.strip())
        except Exception as probe_err:
            logger.warning(f"ffprobe audio check failed for video {video_id}: {probe_err}. Assuming no audio.")

        if not has_audio:
            raise RuntimeError("This video has no audio track. Upload a video with audio to analyze spoken content.")

        # 3. Extract fast 64k mono MP3 audio
        audio_path = os.path.join(assets_dir, f"{base_name}_audio.mp3")
        if has_audio:
            if not os.path.exists(audio_path) or os.path.getsize(audio_path) == 0:
                logger.info(f"Extracting mono MP3 audio from {video_path}...")
                # Memory-capped flags:
                #   -probesize 5M / -analyzeduration 5M  → cap container-analysis I/O
                #   -bufsize 128k                         → tiny decoder output buffer
                #   -threads 1                            → single-threaded, minimal stack
                cmd = [
                    "ffmpeg", "-y",
                    "-probesize", "5M", "-analyzeduration", "5M",
                    "-i", video_path,
                    "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k",
                    "-bufsize", "128k",
                    "-threads", "1",
                    audio_path,
                ]
                try:
                    subprocess.run(
                        cmd, check=True,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.PIPE,
                    )
                except subprocess.CalledProcessError as ffmpeg_err:
                    stderr_txt = (ffmpeg_err.stderr or b"").decode("utf-8", errors="replace")[-2000:]
                    logger.warning(
                        f"FFmpeg audio extraction failed (exit {ffmpeg_err.returncode}) "
                        f"for video {video_id}. stderr tail:\n{stderr_txt}\n"
                        f"Retrying with ultra-low-memory settings..."
                    )
                    cmd_fallback = [
                        "ffmpeg", "-y",
                        "-probesize", "2M", "-analyzeduration", "2M",
                        "-i", video_path,
                        "-vn", "-ac", "1", "-ar", "8000", "-b:a", "32k",
                        "-bufsize", "64k",
                        "-threads", "1",
                        audio_path,
                    ]
                    try:
                        subprocess.run(
                            cmd_fallback, check=True,
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.PIPE,
                        )
                        logger.info(f"Fallback audio extraction succeeded for video {video_id}")
                    except subprocess.CalledProcessError as fallback_err:
                        fb_stderr = (fallback_err.stderr or b"").decode("utf-8", errors="replace")[-2000:]
                        logger.error(
                            f"Fallback ffmpeg also failed (exit {fallback_err.returncode}) "
                            f"for video {video_id}. stderr:\n{fb_stderr}"
                        )
                        raise  # propagate so the task marks the video as FAILED

            from app.services import object_storage
            if object_storage.enabled():
                audio_storage_path = object_storage.upload_file(
                    audio_path, f"audio/video_{video_id}/source-audio.mp3", "audio/mpeg"
                )
                video.audio_path = audio_storage_path
            else:
                video.audio_path = _safe_relpath(audio_path, str(_BACKEND_DIR))
            db.commit()

        # 4. Transcribe (or use empty transcript for audio-less / cached videos)
        if transcript_is_cached:
            transcript = video.transcript
            logger.info("Reusing stored transcript for video %s", video_id)
        elif has_audio and audio_path:
            logger.info("Transcribing source audio for video %s", video_id)
            transcript = transcription_service.transcribe(audio_path)
            if not isinstance(transcript, list) or not transcript:
                raise RuntimeError("Transcription completed without timestamped segments")
            video.transcript = transcript
        else:
            # No audio stream — proceed with empty transcript so highlight detection
            # still runs on video metadata (duration, resolution, etc.)
            logger.info(f"Using empty transcript for audio-less video {video_id}")
            transcript = []
            video.transcript = transcript
        video.transcription_status = models.TranscriptionStatus.COMPLETED
        if not analysis_is_cached:
            video.analysis_status = models.ContentAnalysisStatus.PROCESSING
        db.commit()

        # 4. Content Understanding with Groq Llama 3.3 (0% server RAM/CPU, takes ~1s)
        logger.info(f"Analyzing content with Groq Llama 3.3...")
        metadata = {
            "duration": video.duration or 0,
            "resolution": video.resolution or "1080p",
            "fps": video.fps or 30
        }
        if analysis_is_cached:
            analysis = video.content_analysis
            logger.info("Reusing stored content analysis for video %s", video_id)
        else:
            analysis = content_understanding_service.analyze(transcript, metadata)
            if not isinstance(analysis, dict) or not analysis:
                raise RuntimeError("Content analysis returned no reusable result")
            video.content_analysis = analysis
        video.analysis_status = models.ContentAnalysisStatus.COMPLETED
        video.highlight_status = models.HighlightDetectionStatus.PROCESSING
        db.commit()

        # 5. Detect Top 5 Highlights with Groq Llama 3.3 (0% server RAM/CPU, takes ~1s)
        logger.info(f"Detecting top 5 highlights with Groq Llama 3.3...")
        highlights_data = highlight_detection_service.detect(transcript, analysis, target_length=target_length)
        raw_clips = highlights_data.get("clips", []) if isinstance(highlights_data, dict) else []
        if not isinstance(raw_clips, list):
            raw_clips = []

        # 6. Prepare audio previews directory
        previews_dir = os.path.join(str(_BACKEND_DIR), "uploads", "previews", f"video_{video_id}")
        os.makedirs(previews_dir, exist_ok=True)

        vid_dur = float(video.duration or 0.0)
        requested_duration = max(1.0, float(target_length))
        minimum_speech_duration = max(0.0, requested_duration - 15.0)

        transcript_segments = [
            item for item in transcript
            if isinstance(item, dict) and isinstance(item.get("start"), (int, float))
            and isinstance(item.get("end"), (int, float)) and item["end"] > item["start"]
        ]
        first_speech_time = float(transcript_segments[0]["start"]) if transcript_segments else 0.0

        def fit_requested_duration(start: float, end: float) -> tuple[float, float]:
            """
            Keep the suggested moment's center while honoring the chosen duration.
            CRITICAL: If the highlight starts at or after the first spoken word,
            never drag the start time backwards into the initial silent branding logo/intro!
            """
            available = vid_dur if vid_dur > 0 else max(end, start + requested_duration)
            duration = min(requested_duration, available)
            center = (start + end) / 2.0

            # Guard against dragging the clip back into the initial branding logo/silence
            min_allowed_start = first_speech_time if (transcript_segments and start >= first_speech_time) else 0.0

            ideal_start = center - duration / 2.0
            fitted_start = max(min_allowed_start, min(ideal_start, available - duration))
            fitted_end = min(available, fitted_start + duration)
            return fitted_start, fitted_end

        formatted_clips = []

        def finish_on_complete_speech(start: float, end: float) -> tuple[float, float]:
            """Trim to a detected sentence end when it stays in the selected 15s band."""
            if not transcript_segments or end - start <= minimum_speech_duration + 0.1:
                return start, end

            sentence_ends = [
                float(segment["end"])
                for segment in transcript_segments
                if start < float(segment["end"]) <= end
                and float(segment["end"]) - start > minimum_speech_duration + 0.1
                and str(segment.get("text", "")).rstrip().endswith((".", "!", "?"))
            ]
            if not sentence_ends:
                return start, end

            # Choose the latest complete phrase before the requested cap. If
            # transcription has no usable sentence boundary, keep the full clip.
            return start, max(sentence_ends)

        normalized_clips = []
        for candidate in raw_clips:
            if not isinstance(candidate, dict):
                continue
            try:
                start = max(0.0, float(candidate.get("start_time", 0)))
                end = float(candidate.get("end_time", start + 15))
            except (TypeError, ValueError):
                continue
            if vid_dur > 0:
                end = min(end, vid_dur)
            if transcript_segments and not any(s["end"] > start and s["start"] < end for s in transcript_segments):
                continue
            if end <= start:
                continue
            start, end = fit_requested_duration(start, end)
            if any(abs(float(item["start_time"]) - start) < 1 for item in normalized_clips):
                continue
            normalized_clips.append({**candidate, "start_time": start, "end_time": end})
        raw_clips = normalized_clips
        # If the model returns fewer than five, fill with distinct windows over
        # the timestamped transcript (or evenly spaced windows for silent footage).
        if len(raw_clips) < 5:
            duration_for_windows = vid_dur or (float(transcript_segments[-1]["end"]) if transcript_segments else 0)
            window = min(requested_duration, duration_for_windows) if duration_for_windows > 0 else requested_duration
            start_offset = first_speech_time if transcript_segments else 0.0
            usable_duration = max(window, duration_for_windows - start_offset)
            step = max(1.0, (usable_duration - window) / 4) if usable_duration > window else 0
            for index in range(5):
                st = start_offset + index * step
                en = min(duration_for_windows, st + window) if duration_for_windows else st + window
                if transcript_segments and not any(s["end"] > st and s["start"] < en for s in transcript_segments):
                    continue
                st, en = fit_requested_duration(st, en)
                if not any(abs(float(c.get("start_time", -100)) - st) < 1.0 for c in raw_clips):
                    raw_clips.append({
                        "start_time": st, "end_time": en,
                        "title": f"Highlight Moment {len(raw_clips) + 1}",
                        "reason": "Suggested from the source timeline",
                        "viral_score": max(65, 85 - index * 3),
                        "importance_score": max(65, 88 - index * 2),
                    })

        # Process each clip: ensure max 60s, slice original audio preview snippet
        for idx, c in enumerate(raw_clips[:5]):
            st = max(0.0, float(c.get("start_time", 0.0)))
            en = float(c.get("end_time", st + 45.0))
            if vid_dur > 0 and en > vid_dur:
                en = vid_dur
            st, en = fit_requested_duration(st, en)
            if en <= st:
                en = st + 15.0

            st, en = finish_on_complete_speech(st, en)

            dur = round(en - st, 2)
            st = round(st, 2)
            en = round(en, 2)

            preview_filename = f"preview_clip_{idx + 1}_{int(st * 100)}_{int(en * 100)}.mp3"
            preview_filepath = os.path.join(previews_dir, preview_filename)

            try:
                # Render only the selected source-audio range; keep the MP3 lightweight.
                if not os.path.isfile(preview_filepath) or os.path.getsize(preview_filepath) == 0:
                    subprocess.run([
                        "ffmpeg", "-y", "-ss", str(st),
                        "-i", audio_path, "-t", str(dur), "-c:a", "libmp3lame", "-b:a", "64k",
                        "-threads", "1",
                        preview_filepath
                    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except Exception:
                try:
                    subprocess.run([
                        "ffmpeg", "-y", "-ss", str(st),
                        "-i", audio_path, "-t", str(dur), "-vn", "-b:a", "64k",
                        "-threads", "1",
                        preview_filepath
                    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                except Exception:
                    pass
            if not os.path.isfile(preview_filepath) or os.path.getsize(preview_filepath) == 0:
                raise RuntimeError(f"Could not create source-audio preview for moment {idx + 1}")

            from app.services import object_storage
            if object_storage.enabled():
                preview_storage_path = object_storage.upload_file(
                    preview_filepath, f"previews/video_{video_id}/{preview_filename}", "audio/mpeg"
                )
                # Remove local preview file — it's now in R2
                try:
                    os.remove(preview_filepath)
                except Exception:
                    pass
            else:
                preview_storage_path = _safe_relpath(preview_filepath, str(_BACKEND_DIR))

            formatted_clips.append({
                "id": idx + 1,
                "title": c.get("title", f"Highlight {idx + 1}"),
                "start_time": st,
                "end_time": en,
                "duration": dur,
                "viral_score": int(c.get("viral_score") or (90 - idx * 4)),
                "importance_score": int(c.get("importance_score") or (88 - idx * 3)),
                "reason": c.get("reason", "Engaging hook with great pacing"),
                "audio_path": preview_storage_path
            })

        if len(formatted_clips) != 5:
            raise RuntimeError(
                f"Moment analysis produced {len(formatted_clips)} usable previews; expected 5"
            )
        # Preserve a prior selection when reanalysis is explicitly requested.
        previous_highlights = video.highlights if isinstance(video.highlights, dict) else {}
        video.highlights = {"clips": formatted_clips, "requested_length": float(target_length)}
        if previous_highlights.get("selected_moment_id") is not None:
            video.highlights["selected_moment_id"] = previous_highlights["selected_moment_id"]
        video.highlight_status = models.HighlightDetectionStatus.COMPLETED
        video.status = models.VideoStatus.COMPLETED
        db.commit()
        logger.info(f"Successfully extracted {len(formatted_clips)} highlights with original audio previews for video {video_id}")

    except Exception as e:
        logger.error(f"Error extracting top 5 highlights for video {video_id}: {e}", exc_info=True)
        db.rollback()
        video = db.query(models.Video).filter(models.Video.id == video_id).first()
        if video:
            video.status = models.VideoStatus.FAILED
            video.highlight_status = models.HighlightDetectionStatus.FAILED
            video.transcription_status = (
                models.TranscriptionStatus.COMPLETED if video.transcript
                else models.TranscriptionStatus.FAILED
            )
            video.analysis_status = (
                models.ContentAnalysisStatus.COMPLETED if video.content_analysis
                else models.ContentAnalysisStatus.FAILED
            )
            db.commit()
    finally:
        db.close()
        gc.collect()

@celery_app.task(ignore_result=True)
def generate_smart_crop_task(video_id: int, target_fps: int = 1):
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
        video_path = _resolve_video_path(video.storage_path)

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

    # ── Phase 1: Read all metadata & mark RENDERING in a short-lived DB transaction ──
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
        video_id = video.id
        video_storage_path = video.storage_path
        start_time = float(clip.start_time)
        end_time = float(clip.end_time)
        edit_options = dict(clip.edit_options or {})
        transcript_snapshot = list(edit_options.get("transcript_snapshot") or video.transcript or [])
        crop_metadata = dict(video.crop_metadata) if (video.crop_metadata and isinstance(video.crop_metadata, dict)) else None
        previous_storage_path = clip.storage_path

        video_path = _resolve_video_path(video_storage_path)
        audio_path_resolved = _resolve_or_extract_video_audio(video, video_path, db)

        framing_mode = (edit_options.get("framing_mode") or "fit_blur").lower()
        needs_crop = framing_mode in ["crop", "smart_crop", "fill"]

        has_crop_trajectory = (
            crop_metadata is not None
            and isinstance(crop_metadata, dict)
            and bool(crop_metadata.get("trajectory"))
        )

        if needs_crop and not has_crop_trajectory:
            logger.info(f"Smart crop mode '{framing_mode}' requested for video {video_id}. Generating trajectory...")
            try:
                from app.services.smart_cropping_service import smart_cropping_service
                crop_data = smart_cropping_service.generate_crop_metadata(video_path, target_fps=1)
                video.crop_metadata = crop_data
                video.crop_status = models.CropStatus.COMPLETED
                crop_metadata = crop_data
                has_crop_trajectory = True
                logger.info("Successfully generated crop trajectory on the fly.")
            except Exception as e:
                logger.warning(f"Failed to generate crop metadata on the fly: {e}")
        else:
            logger.info(f"Framing mode is '{framing_mode}'. Skipping heavy crop trajectory calculation.")

        clip.status = models.ClipStatus.RENDERING
        db.commit()
    except Exception as init_err:
        logger.error(f"Failed to initialize render task for clip {clip_id}: {init_err}")
        db.rollback()
        return
    finally:
        # Crucial: Close connection immediately so it does NOT stay idle in transaction
        # during the minutes-long FFmpeg/TTS operations below.
        db.close()

    # ── Phase 2: Heavy rendering, TTS, subtitles, and R2 upload (ZERO open DB connections) ──
    try:

        # Always write clip output to _BACKEND_DIR/uploads/clips/ so the output
        # is guaranteed to be on the same drive as _BACKEND_DIR, avoiding the
        # Windows cross-drive ValueError from os.path.relpath (e.g. source video
        # cached in C:\Temp\... while backend lives on D:\...).
        clips_dir = os.path.join(str(_BACKEND_DIR), "uploads", "clips")
        os.makedirs(clips_dir, exist_ok=True)

        output_filename = f"clip_{uuid.uuid4().hex[:8]}.mp4"
        output_path = os.path.join(clips_dir, output_filename)

        # Compute path relative to backend/ directory → "uploads/clips/<file>.mp4"
        relative_path = _safe_relpath(output_path, str(_BACKEND_DIR))

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
                if start_val >= start_time and end_val <= end_time:
                    absolute_words.append({
                        "start": start_val,
                        "end": end_val,
                        "text": w["text"],
                        "_word_aligned": bool(w.get("_word_aligned")),
                    })
                    shifted_words.append({
                        "start": max(0.0, round(start_val - start_time, 2)),
                        "end": max(0.05, round(end_val - start_time, 2)),
                        "text": w["text"],
                        "_word_aligned": bool(w.get("_word_aligned")),
                    })
        else:
            full_transcript = transcript_snapshot
            part_words = [
                w for w in full_transcript
                if isinstance(w, dict)
                and float(w.get("start", start_time)) < end_time
                and float(w.get("end", start_time)) > start_time
            ]
            for w in part_words:
                w_st = float(w.get("start", start_time))
                w_en = float(w.get("end", start_time))
                absolute_words.append({
                    "start": w_st,
                    "end": w_en,
                    "text": w["text"],
                    "_word_aligned": bool(w.get("_word_aligned")),
                })
                shifted_words.append({
                    "start": max(0.0, round(w_st - start_time, 2)),
                    "end": max(0.05, round(w_en - start_time, 2)),
                    "text": w["text"],
                    "_word_aligned": bool(w.get("_word_aligned")),
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

        if dub_voice and translate_lang != "none":
            try:
                shifted_words = translate_and_distribute_words(orig_shifted_words, translate_lang)
            except Exception as te:
                logger.warning(f"Caption phrase translation for dubbing failed: {te}")
                shifted_words = orig_shifted_words
        elif caption_lang_opt == "none":
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
        if dub_voice and translate_lang != "none":
            logger.info(f"Voice dubbing requested to language: {translate_lang} (Gender: {speaker_gender})")
            from app.services.voice_service import voice_service

            abs_audio_path = audio_path_resolved
            try:
                dubbed_audio_path = f"{variation_base}_dubbed.wav"
                voice_service.dub_voice(
                    original_audio_path=abs_audio_path,
                    transcript_words=absolute_words,
                    target_lang=translate_lang,
                    start_time=start_time,
                    end_time=end_time,
                    output_path=dubbed_audio_path,
                    mix_mode=dub_mix_mode,
                    speaker_gender=speaker_gender,
                    pretranslated_lines=shifted_words
                )
                logger.info("Successfully generated dubbed audio track.")
            except Exception as de:
                logger.error(f"Voice dubbing failed: {de}", exc_info=True)
                raise RuntimeError("Dubbed audio could not be generated; refusing to render with incorrect audio") from de

        # 5. Generate subtitles ASS file
        caption_preset = instructions.get("caption_style", "standard")
        has_subtitles = caption_preset != "none" and len(shifted_words) > 0

        if has_subtitles:
            from app.services.subtitle_service import subtitle_service
            style_config = {
                "caption_style": caption_preset,
                "target_lang": translate_lang if translate_lang != "none" else instructions.get("language", "none"),
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

        # 6. Render clip with chosen framing mode (fit_blur, fit_black, or smart_crop)
        framing_mode = instructions.get("framing_mode") or edit_options.get("framing_mode", "fit_blur")
        instructions["framing_mode"] = framing_mode
        temp_video_source = subbed_path if has_subtitles else cropped_path

        from app.services.clip_rendering_service import clip_rendering_service
        trajectory = crop_metadata.get("trajectory", []) if (crop_metadata and isinstance(crop_metadata, dict)) else []

        if framing_mode in ["fit", "fit_blur", "fit_black"] or has_crop_trajectory:
            clip_rendering_service.render_clip(
                video_path=video_path,
                output_path=temp_video_source,
                start_time=start_time,
                end_time=end_time,
                crop_trajectory=trajectory,
                editing_instructions=instructions,
                subtitle_path=ass_path if has_subtitles else None
            )
        else:
            # Fallback: direct FFmpeg trim
            logger.info(f"No crop trajectory for clip {clip_id}, using direct FFmpeg trim fallback.")
            import subprocess
            duration = end_time - start_time

            ffmpeg_cmd = [
                "ffmpeg", "-y",
                "-loglevel", "error",
                "-ss", str(start_time),
                "-t", str(duration),
                "-i", video_path,
            ]

            if has_subtitles:
                escaped_sub = os.path.abspath(ass_path).replace('\\', '/').replace(':', r'\:')
                ffmpeg_cmd.extend(["-vf", f"subtitles=filename='{escaped_sub}'"])

            from app.services.subtitle_service import subtitle_service
            fast_v_args = subtitle_service._get_fast_video_encoding_args()

            ffmpeg_cmd.extend([
                *fast_v_args,
                "-c:a", "aac", "-b:a", "128k",
                "-movflags", "+faststart",
                temp_video_source
            ])

            result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
            if result.returncode != 0:
                logger.warning(f"Fast encoding failed ({result.stderr[:200]}). Retrying with CPU libx264...")
                retry_cmd = [
                    "ffmpeg", "-y", "-ss", str(start_time), "-t", str(duration),
                    "-i", video_path,
                ]
                if has_subtitles:
                    retry_cmd.extend(["-vf", f"subtitles=filename='{escaped_sub}'"])
                retry_cmd.extend([
                    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "22",
                    "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", temp_video_source
                ])
                retry_res = subprocess.run(retry_cmd, capture_output=True, text=True)
                if retry_res.returncode != 0:
                    if has_subtitles:
                        logger.warning("Retry with subtitles failed. Retrying without subtitles...")
                        nosub_cmd = [
                            "ffmpeg", "-y", "-ss", str(start_time), "-t", str(duration),
                            "-i", video_path, "-c:v", "libx264", "-preset", "ultrafast", "-crf", "22",
                            "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", temp_video_source
                        ]
                        nosub_res = subprocess.run(nosub_cmd, capture_output=True, text=True)
                        if nosub_res.returncode != 0:
                            raise RuntimeError(f"FFmpeg trim failed: {nosub_res.stderr[-500:]}")
                    else:
                        raise RuntimeError(f"FFmpeg trim failed: {retry_res.stderr[-500:]}")

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
                raise RuntimeError("Could not add dubbed speech to the rendered video") from me
            finally:
                if os.path.exists(dubbed_audio_path):
                    try:
                        os.remove(dubbed_audio_path)
                    except Exception:
                        pass

        # 7. Check outro options & music configuration
        template_id = instructions.get("template_id") or edit_options.get("template_id")
        template_storage_path = instructions.get("template_storage_path") or edit_options.get("template_storage_path")
        enable_outro = instructions.get("enable_outro") or edit_options.get("enable_outro", False)
        has_outro = bool(template_id or template_storage_path or enable_outro)

        audio_mode = instructions.get("audio_mode", "original")  # "original", "mix", "replace"
        custom_audio_path = instructions.get("custom_audio_path")
        music_preset = instructions.get("music_preset", instructions.get("music_style", "none"))
        music_track = None
        disable_music = True

        if audio_mode in ("mix", "replace"):
            if custom_audio_path:
                from app.api.api_v1.endpoints.videos import _resolve_path
                resolved_custom = _resolve_path(custom_audio_path)
                from app.services import object_storage
                if object_storage.is_remote(custom_audio_path):
                    try:
                        resolved_custom = object_storage.local_path(custom_audio_path)
                    except Exception as oe:
                        logger.warning(f"Could not resolve remote audio track {custom_audio_path}: {oe}")
                if os.path.exists(resolved_custom):
                    music_track = resolved_custom
                    disable_music = False
                    logger.info(f"Using custom uploaded audio track for clip {clip_id}: {resolved_custom} (mode={audio_mode})")
                else:
                    logger.warning(f"Custom audio file not found: {custom_audio_path} ({resolved_custom})")
            elif music_preset and music_preset != "none":
                from app.services.music_agent import music_agent
                music_track = music_agent.recommend_music({"style": music_preset})
                if music_track and os.path.exists(music_track):
                    disable_music = False

        has_bg_or_uploaded_music = (not disable_music) and (music_track is not None)

        from app.services.music_agent import music_agent
        from app.services.template_service import template_service
        from app.services.cta_overlay_service import cta_overlay_service
        import subprocess

        if has_bg_or_uploaded_music:
            # ─────────────────────────────────────────────────────────────────
            # USER SELECTED BG AUDIO OR UPLOADED AUDIO:
            # The background music / uploaded track extends across the ENTIRE
            # extended video length (clip + outro screen).
            # The outro screen/template appends visuals with silence underneath
            # so the bg music or uploaded audio flows smoothly across the extended length.
            # ─────────────────────────────────────────────────────────────────
            extended_video = temp_video_source
            if has_outro:
                import gc
                gc.collect()
                try:
                    if template_id or template_storage_path:
                        target_tmpl = template_storage_path or template_id
                        logger.info(f"Extending video with R2 template '{target_tmpl}' for clip {clip_id} (bg music will cover extended length)")
                        ok = template_service.append_template_to_video(extended_video, target_tmpl, with_audio=False)
                        if not ok:
                            logger.warning(f"Template append skipped/failed; continuing with original clip {clip_id}")
                    elif enable_outro:
                        like_text = instructions.get("outro_like_text", edit_options.get("outro_like_text", "Like"))
                        comment_text = instructions.get("outro_comment_text", edit_options.get("outro_comment_text", "Comment"))
                        subscribe_text = instructions.get("outro_subscribe_text", edit_options.get("outro_subscribe_text", "Subscribe"))
                        follow_text = instructions.get("outro_follow_text", edit_options.get("outro_follow_text", ""))
                        long_text = instructions.get("outro_custom_text", edit_options.get("outro_custom_text", ""))
                        qr_link = instructions.get("outro_qr_link", edit_options.get("outro_qr_link", ""))
                        quote_text = instructions.get("outro_quote_text", edit_options.get("outro_quote_text", ""))
                        outro_config = instructions.get("outro_config", edit_options.get("outro_config", {}))
                        dur = float(instructions.get("outro_duration", edit_options.get("outro_duration", 3.0)))
                        logger.info(f"Extending video with 9:16 creator outro ({dur}s) for clip {clip_id} (bg music will cover extended length)")
                        ok = cta_overlay_service.append_9_16_outro(
                            video_path=extended_video,
                            like_text=like_text,
                            comment_text=comment_text,
                            subscribe_text=subscribe_text,
                            follow_text=follow_text,
                            long_text=long_text,
                            qr_link=qr_link,
                            quote_text=quote_text,
                            outro_config=outro_config,
                            duration=dur,
                            with_audio=False,
                        )
                        if not ok:
                            logger.warning(f"CTA outro append skipped/failed; continuing with original clip {clip_id}")
                except Exception as oe:
                    logger.warning(f"Error during outro extension on clip {clip_id}: {oe}; proceeding with original clip.")

            # Apply bg music / uploaded audio over the FULL extended video length
            try:
                import gc
                gc.collect()
                vol = instructions.get("music_volume")
                vol_val = float(vol) if vol is not None else (0.18 if (len(shifted_words) > 0 and audio_mode != "replace") else 1.0)
                logger.info(f"Mixing bg/uploaded music track over extended video ({extended_video}) -> {output_path}")
                music_agent.apply_music(
                    video_path=extended_video,
                    music_path=music_track,
                    output_path=output_path,
                    options={
                        "disable_music": False,
                        "remove_original_audio": (audio_mode == "replace"),
                        "has_voice": len(shifted_words) > 0 and audio_mode != "replace",
                        "volume": vol_val
                    }
                )
            except Exception as me:
                logger.error(f"Music mix on extended video failed, copying directly: {me}")
                subprocess.run(["ffmpeg", "-y", "-i", extended_video, "-c", "copy", output_path], capture_output=True)

        else:
            # ─────────────────────────────────────────────────────────────────
            # USER SELECTED ORIGINAL AUDIO OR MUTE:
            # - If audio_mode == 'mute': video audio is completely stripped/muted (-an).
            # - If audio_mode == 'original': original audio is preserved.
            # ─────────────────────────────────────────────────────────────────
            try:
                if audio_mode == "mute":
                    logger.info(f"Audio mode is 'mute'; stripping/muting audio with -an for clip {clip_id}")
                    subprocess.run(["ffmpeg", "-y", "-i", temp_video_source, "-c:v", "copy", "-an", "-movflags", "+faststart", output_path], capture_output=True)
                else:
                    subprocess.run(["ffmpeg", "-y", "-i", temp_video_source, "-c", "copy", output_path], capture_output=True)
            except Exception as ce:
                import shutil
                shutil.copyfile(temp_video_source, output_path)

            if has_outro:
                import gc
                gc.collect()
                try:
                    if template_id or template_storage_path:
                        target_tmpl = template_storage_path or template_id
                        logger.info(f"Appending local template outro '{target_tmpl}' (with_audio={audio_mode != 'mute'}) to clip {clip_id}")
                        ok = template_service.append_template_to_video(output_path, target_tmpl, with_audio=(audio_mode != "mute"))
                        if not ok:
                            logger.warning(f"Template append returned False; keeping output clip {clip_id} intact.")
                    elif enable_outro:
                        like_text = instructions.get("outro_like_text", edit_options.get("outro_like_text", "Like"))
                        comment_text = instructions.get("outro_comment_text", edit_options.get("outro_comment_text", "Comment"))
                        subscribe_text = instructions.get("outro_subscribe_text", edit_options.get("outro_subscribe_text", "Subscribe"))
                        follow_text = instructions.get("outro_follow_text", edit_options.get("outro_follow_text", ""))
                        long_text = instructions.get("outro_custom_text", edit_options.get("outro_custom_text", ""))
                        qr_link = instructions.get("outro_qr_link", edit_options.get("outro_qr_link", ""))
                        quote_text = instructions.get("outro_quote_text", edit_options.get("outro_quote_text", ""))
                        outro_config = instructions.get("outro_config", edit_options.get("outro_config", {}))
                        dur = float(instructions.get("outro_duration", edit_options.get("outro_duration", 3.0)))
                        outro_music_style = instructions.get("outro_music_style", edit_options.get("outro_music_style", "upbeat"))
                        logger.info(f"Appending 9:16 creator outro ({dur}s, style={outro_music_style}, with_audio={audio_mode != 'mute'}) to clip {clip_id}")
                        ok = cta_overlay_service.append_9_16_outro(
                            video_path=output_path,
                            like_text=like_text,
                            comment_text=comment_text,
                            subscribe_text=subscribe_text,
                            follow_text=follow_text,
                            long_text=long_text,
                            qr_link=qr_link,
                            quote_text=quote_text,
                            outro_config=outro_config,
                            duration=dur,
                            music_preset=None if audio_mode == "mute" else outro_music_style,
                            with_audio=(audio_mode != "mute"),
                        )
                        if not ok:
                            logger.warning(f"CTA outro append returned False; keeping output clip {clip_id} intact.")
                except Exception as oe:
                    logger.warning(f"Error during outro appending on clip {clip_id}: {oe}; keeping output clip intact.")

            if audio_mode == "mute" and os.path.exists(output_path):
                # Ensure no audio stream exists on the final output short
                try:
                    tmp_mute = output_path + ".mute.mp4"
                    res = subprocess.run(["ffmpeg", "-y", "-i", output_path, "-c:v", "copy", "-an", "-movflags", "+faststart", tmp_mute], capture_output=True)
                    if res.returncode == 0 and os.path.exists(tmp_mute):
                        import shutil
                        shutil.move(tmp_mute, output_path)
                except Exception as mute_err:
                    logger.warning(f"Secondary mute check non-critical warning on {clip_id}: {mute_err}")

        # Optional: in-video CTA overlay if no outro was chosen
        if not has_outro:
            cta_template = instructions.get("cta_template") or edit_options.get("cta_template", "none")
            cta_text = instructions.get("cta_text") or edit_options.get("cta_text", "")
            cta_placement = instructions.get("cta_placement") or edit_options.get("cta_placement", "outro")

            if cta_template and cta_template != "none":
                try:
                    logger.info(f"Applying creator CTA overlay '{cta_template}' with text '{cta_text}' to clip {clip_id}")
                    cta_overlay_service.apply_cta_overlay(
                        video_path=output_path,
                        template=cta_template,
                        custom_text=cta_text,
                        placement=cta_placement,
                    )
                except Exception as cta_err:
                    logger.error(f"Failed to apply CTA overlay ({cta_template}): {cta_err}", exc_info=True)

        # ── Apply Watermark & Branding Studio at once during initial render ──
        branding_data = edit_options.get("branding") or {}
        wm_path = instructions.get("watermark_path") or edit_options.get("watermark_path") or branding_data.get("watermark_path")
        hdr_path = instructions.get("header_image_path") or edit_options.get("header_image_path") or branding_data.get("header_image_path")
        ftr_path = instructions.get("footer_image_path") or edit_options.get("footer_image_path") or branding_data.get("footer_image_path")

        if wm_path or hdr_path or ftr_path:
            import gc
            gc.collect()
            branded_tmp = os.path.join(clips_dir, f"branded_{clip_id}_{uuid.uuid4().hex[:8]}.mp4")
            try:
                logger.info(f"Applying branding (watermark/header/footer) directly to rendered clip {clip_id}")
                from app.services.watermark_service import watermark_service
                watermark_service.apply_branding_to_video(
                    input_video_path=output_path,
                    output_video_path=branded_tmp,
                    watermark_path=wm_path,
                    watermark_position=instructions.get("watermark_position") or edit_options.get("watermark_position") or branding_data.get("watermark_position", "top-right"),
                    watermark_scale=float(instructions.get("watermark_scale") or edit_options.get("watermark_scale") or branding_data.get("watermark_scale", 0.16)),
                    watermark_opacity=float(instructions.get("watermark_opacity") or edit_options.get("watermark_opacity") or branding_data.get("watermark_opacity", 0.85)),
                    watermark_mode=instructions.get("watermark_mode") or edit_options.get("watermark_mode") or branding_data.get("watermark_mode", "always"),
                    header_image_path=hdr_path,
                    header_height=int(instructions.get("header_height") or edit_options.get("header_height") or branding_data.get("header_height", 160)),
                    footer_image_path=ftr_path,
                    footer_height=int(instructions.get("footer_height") or edit_options.get("footer_height") or branding_data.get("footer_height", 180)),
                    footer_position=instructions.get("footer_position") or edit_options.get("footer_position") or branding_data.get("footer_position", "bottom"),
                )
                if os.path.isfile(branded_tmp) and os.path.getsize(branded_tmp) > 0:
                    import shutil
                    shutil.move(branded_tmp, output_path)
                    logger.info(f"Branding successfully burned into clip {clip_id}")
            except Exception as brand_err:
                logger.error(f"Failed to apply branding to clip {clip_id}: {brand_err}", exc_info=True)
                if os.path.exists(branded_tmp):
                    try:
                        os.remove(branded_tmp)
                    except Exception:
                        pass

        # ── Custom Thumbnail or Fallback Auto-Extracted Frame (Never blank!) ──
        final_thumb_path = instructions.get("thumbnail_path") or edit_options.get("thumbnail_path")
        if not final_thumb_path:
            # Fallback method: automatically extract crisp frame from rendered video so thumbnail is never blank
            try:
                thumb_upload_dir = os.path.join(str(_BACKEND_DIR), "uploads", "thumbnails")
                os.makedirs(thumb_upload_dir, exist_ok=True)
                thumb_filename = f"thumb_{clip_id}_{uuid.uuid4().hex[:8]}.jpg"
                thumb_local_path = os.path.join(thumb_upload_dir, thumb_filename)

                clip_dur = max(0.1, end_time - start_time)
                seek_time = "0.5" if clip_dur >= 1.0 else "0.0"
                thumb_cmd = [
                    "ffmpeg", "-y",
                    "-ss", seek_time,
                    "-i", output_path,
                    "-vframes", "1",
                    "-q:v", "2",
                    thumb_local_path
                ]
                subprocess.run(thumb_cmd, capture_output=True, check=True)

                if os.path.isfile(thumb_local_path) and os.path.getsize(thumb_local_path) > 0:
                    from app.services import object_storage
                    if object_storage.enabled():
                        final_thumb_path = object_storage.upload_file(
                            thumb_local_path, f"thumbnails/{thumb_filename}", "image/jpeg"
                        )
                        try:
                            os.remove(thumb_local_path)
                        except Exception:
                            pass
                    else:
                        final_thumb_path = f"uploads/thumbnails/{thumb_filename}"
                    logger.info(f"Auto-extracted fallback thumbnail for clip {clip_id}: {final_thumb_path}")
            except Exception as th_err:
                logger.warning(f"Failed to extract thumbnail frame for clip {clip_id}: {th_err}")

        # Cleanup intermediate files
        for fpath in [cropped_path, ass_path, subbed_path]:
            if os.path.exists(fpath) and fpath != output_path:
                try:
                    os.remove(fpath)
                except Exception as ex:
                    logger.warning(f"Failed to remove temp file {fpath}: {ex}")

        from app.services import object_storage
        if object_storage.enabled():
            r2_path = object_storage.upload_file(
                output_path, f"clips/{os.path.basename(output_path)}", "video/mp4"
            )
            final_storage_path = r2_path
            try:
                os.remove(output_path)
            except Exception as rm_err:
                logger.warning(f"Could not remove local clip file after R2 upload: {rm_err}")
        else:
            final_storage_path = relative_path

        # ── Phase 3: Save results in a fresh, short-lived DB transaction ──
        db = SessionLocal()
        try:
            clip = db.query(models.Clip).filter(models.Clip.id == clip_id).first()
            if clip:
                clip.storage_path = final_storage_path
                clip.status = models.ClipStatus.COMPLETED
                opts = dict(clip.edit_options or {})
                if final_thumb_path:
                    opts["thumbnail_path"] = final_thumb_path
                clip.edit_options = opts
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(clip, "edit_options")
                if clip.video:
                    clip.video.short_path = final_storage_path
                db.commit()
                logger.info(f"Successfully rendered clip {clip_id} to {final_storage_path} (thumbnail: {final_thumb_path})")
        finally:
            db.close()

        if previous_storage_path and previous_storage_path != final_storage_path:
            try:
                if object_storage.is_remote(previous_storage_path):
                    object_storage.delete(previous_storage_path)
                else:
                    old_path = _resolve_video_path(previous_storage_path)
                    if os.path.isfile(old_path):
                        os.remove(old_path)
            except Exception as cleanup_error:
                logger.warning("Could not remove prior clip output %s: %s", previous_storage_path, cleanup_error)

    except Exception as e:
        logger.error(f"Error rendering clip {clip_id}: {e}", exc_info=True)
        db = SessionLocal()
        try:
            clip = db.query(models.Clip).filter(models.Clip.id == clip_id).first()
            if clip:
                clip.status = models.ClipStatus.FAILED
                db.commit()
        except Exception as db_err:
            logger.warning(f"Could not update status to FAILED for clip {clip_id}: {db_err}")
        finally:
            db.close()
    finally:
        import gc
        gc.collect()

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
    speaker_gender: str = "female",
    audio_theme: str = "auto",
    framing_mode: str = "fit_blur",
    caption_style: str = "pop",
    source_language: str = None,
    retranscribe: bool = False,
    primary_color: str = None,
    highlight_color: str = None
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

        # Build absolute video path with cross-platform fallback
        video_path = _resolve_video_path(video.storage_path)

        if not os.path.exists(video_path):
            logger.error(f"Video file not found at {video_path}")
            from app.models.video import VideoStatus
            video.status = VideoStatus.FAILED
            db.commit()
            return

        logger.info(f"Processing video at absolute path: {video_path}")

        # Clean up existing Master Variation clips for this video to ensure a fresh set of 5
        old_variations = db.query(models.Clip).filter(
            models.Clip.video_id == video_id,
            models.Clip.title.like("%Master Variation%")
        ).all()
        for old_clip in old_variations:
            if old_clip.storage_path:
                try:
                    from app.services import object_storage as _os
                    if _os.is_remote(old_clip.storage_path):
                        _os.delete(old_clip.storage_path)
                    else:
                        old_file = _resolve_video_path(old_clip.storage_path)
                        if os.path.exists(old_file):
                            os.remove(old_file)
                except Exception:
                    pass
            db.delete(old_clip)
        db.commit()

        # Always anchor to _BACKEND_DIR/uploads/clips/ to avoid cross-drive issues on Windows
        clips_dir = os.path.join(str(_BACKEND_DIR), "uploads", "clips")
        os.makedirs(clips_dir, exist_ok=True)

        saved_paths = set()

        def _save_variation_clip(item, current_idx, total_count):
            if not isinstance(item, dict):
                return
            src_path = item.get("path")
            if not src_path or not os.path.exists(src_path) or src_path in saved_paths:
                return

            saved_paths.add(src_path)
            title = item.get("title", f"Master Variation {current_idx}")
            clip_dur = item.get("duration", length)
            start_val = item.get("start_time", 0.0)
            end_val = item.get("end_time", start_val + clip_dur)

            sanitized_title = title.lower().replace(" ", "_").replace("-", "").replace("(", "").replace(")", "")
            output_filename = f"{sanitized_title}_{uuid.uuid4().hex[:8]}.mp4"
            final_path = os.path.join(clips_dir, output_filename)
            shutil.copy2(src_path, final_path)

            from app.services import object_storage
            if object_storage.enabled():
                rel_path = object_storage.upload_file(final_path, f"clips/{output_filename}", "video/mp4")
                # Delete local copy — safely stored in R2
                try:
                    os.remove(final_path)
                except Exception:
                    pass
            else:
                rel_path = _safe_relpath(final_path, str(_BACKEND_DIR))

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
            video.status = models.VideoStatus.PROCESSING
            video.transcription_status = models.TranscriptionStatus.COMPLETED
            video.analysis_status = models.ContentAnalysisStatus.COMPLETED
            video.highlight_status = models.HighlightDetectionStatus.COMPLETED
            video.crop_status = models.CropStatus.COMPLETED
            db.commit()
            logger.info(f"Progressively saved variation {current_idx}/{total_count} ({title}) to DB.")

        def _update_progress(stage: str):
            from app.models import VideoStatus, TranscriptionStatus, ContentAnalysisStatus, HighlightDetectionStatus, CropStatus
            video.status = VideoStatus.PROCESSING
            if stage == "transcribing":
                video.transcription_status = TranscriptionStatus.PROCESSING
            elif stage == "analyzing":
                video.transcription_status = TranscriptionStatus.COMPLETED
                video.analysis_status = ContentAnalysisStatus.PROCESSING
            elif stage == "highlighting":
                video.transcription_status = TranscriptionStatus.COMPLETED
                video.analysis_status = ContentAnalysisStatus.COMPLETED
                video.highlight_status = HighlightDetectionStatus.PROCESSING
            elif stage == "cropping":
                video.transcription_status = TranscriptionStatus.COMPLETED
                video.analysis_status = ContentAnalysisStatus.COMPLETED
                video.highlight_status = HighlightDetectionStatus.COMPLETED
                video.crop_status = CropStatus.PROCESSING
            elif stage == "rendering":
                video.transcription_status = TranscriptionStatus.COMPLETED
                video.analysis_status = ContentAnalysisStatus.COMPLETED
                video.highlight_status = HighlightDetectionStatus.COMPLETED
                video.crop_status = CropStatus.COMPLETED
            db.commit()

        results = master_agent.generate_shorts(
            video_path=video_path,
            length=length,
            platform=platform,
            optional_prompt=optional_prompt,
            audio_theme=audio_theme,
            progress_callback=_update_progress,
            db_video=video,
            translate_language=translate_language,
            dub_voice=dub_voice,
            caption_language=caption_language,
            dub_mix_mode=dub_mix_mode,
            speaker_gender=speaker_gender,
            framing_mode=framing_mode,
            caption_style=caption_style,
            source_language=source_language,
            retranscribe=retranscribe,
            primary_color=primary_color,
            highlight_color=highlight_color,
            on_variation_complete=_save_variation_clip
        )

        # Fallback check to ensure any result not captured by callback is persisted
        for i, item in enumerate(results, 1):
            if isinstance(item, dict) and item.get("path") not in saved_paths:
                _save_variation_clip(item, i, len(results))

        logger.info(f"Successfully generated {len(results)} master variations for video {video_id}")

        # Ensure final video status and pipeline fields are marked completed in DB
        video = db.query(models.Video).filter(models.Video.id == video_id).first()
        if video:
            from app.models import VideoStatus, TranscriptionStatus, ContentAnalysisStatus, HighlightDetectionStatus, CropStatus
            ready_count = db.query(models.Clip).filter(
                models.Clip.video_id == video_id,
                models.Clip.title.like("%Master Variation%"),
                models.Clip.status == models.ClipStatus.COMPLETED,
            ).count()
            video.status = VideoStatus.COMPLETED if ready_count >= 5 else VideoStatus.FAILED
            video.transcription_status = TranscriptionStatus.COMPLETED
            video.analysis_status = ContentAnalysisStatus.COMPLETED
            video.highlight_status = HighlightDetectionStatus.COMPLETED
            video.crop_status = CropStatus.COMPLETED
            db.commit()

    except Exception as e:
        logger.error(f"Error generating master variations for video {video_id}: {e}", exc_info=True)
        db.rollback()
        video = db.query(models.Video).filter(models.Video.id == video_id).first()
        if video:
            from app.models import VideoStatus
            video.status = VideoStatus.FAILED
            db.commit()
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

        # Resolve local and remote (including Cloudflare R2) clip storage paths.
        if clip.storage_path:
            try:
                video_path = _resolve_video_path(clip.storage_path)
            except Exception as storage_error:
                logger.exception("Could not retrieve clip %s for publishing", clip_id)
                publish_error = f"error: Could not retrieve the rendered video: {storage_error}"
                clip.published_urls = {
                    **(clip.published_urls or {}),
                    **{platform: publish_error for platform in platforms},
                }
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(clip, "published_urls")
                db.commit()
                return
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

        # Request credentials can override DB credentials only if non-empty
        req_configs = config.get("platform_configs") or {}
        req_non_empty = {k: v for k, v in req_configs.items() if v}
        platform_configs = {**db_configs, **req_non_empty}

        # Check if branding needs to be applied before publishing
        branding_cfg = config.get("branding_config") or (clip.edit_options or {}).get("branding")
        if branding_cfg and (branding_cfg.get("watermark_path") or branding_cfg.get("header_image_path") or branding_cfg.get("footer_image_path")):
            if not (clip.edit_options or {}).get("branding_burned", False):
                try:
                    import tempfile, uuid
                    from app.services.watermark_service import watermark_service
                    branded_tmp = os.path.join(tempfile.gettempdir(), f"branded_{clip_id}_{uuid.uuid4().hex[:8]}.mp4")
                    watermark_service.apply_branding_to_video(
                        input_video_path=video_path,
                        output_video_path=branded_tmp,
                        watermark_path=branding_cfg.get("watermark_path"),
                        watermark_position=branding_cfg.get("watermark_position", "top-right"),
                        watermark_scale=float(branding_cfg.get("watermark_scale", 0.16)),
                        watermark_opacity=float(branding_cfg.get("watermark_opacity", 0.85)),
                        watermark_mode=branding_cfg.get("watermark_mode", "always"),
                        header_image_path=branding_cfg.get("header_image_path"),
                        header_height=int(branding_cfg.get("header_height", 160)),
                        footer_image_path=branding_cfg.get("footer_image_path"),
                        footer_height=int(branding_cfg.get("footer_height", 180)),
                        footer_position=branding_cfg.get("footer_position", "bottom"),
                    )
                    video_path = branded_tmp
                except Exception as b_err:
                    logger.warning(f"Could not burn branding prior to publishing clip {clip_id}: {b_err}")

        thumb_path = config.get("thumbnail_path") or (clip.edit_options or {}).get("thumbnail_path")

        # Resolve public URL for Meta/Instagram publishing
        from app.services import object_storage
        resolved_public_url = None
        if clip.storage_path and object_storage.is_remote(clip.storage_path):
            try:
                provider, bucket, key = object_storage._parse(clip.storage_path)
                base_url = (platform_configs.get("public_video_url") or settings.PUBLIC_VIDEO_URL or "").strip()
                if base_url:
                    resolved_public_url = f"{base_url.rstrip('/')}/{key.lstrip('/')}"
                else:
                    resolved_public_url = object_storage.url(clip.storage_path)
            except Exception as ex:
                logger.warning(f"Failed to resolve public R2 URL for clip {clip_id}: {ex}")
        elif clip.storage_path:
            base_url = (platform_configs.get("public_video_url") or settings.PUBLIC_VIDEO_URL or "").strip()
            if base_url:
                norm_key = clip.storage_path.replace("\\", "/").lstrip("/")
                resolved_public_url = f"{base_url.rstrip('/')}/{norm_key}"

        published_urls = clip.published_urls or {}
        if not isinstance(published_urls, dict):
            published_urls = dict(published_urls)

        for platform in platforms:
            publish_config = {
                "title": title,
                "description": description,
                "privacy": privacy,
                "thumbnail_path": thumb_path,
                "scheduled_at": config.get("scheduled_at"),
                "youtube_access_token": platform_configs.get("youtube_access_token"),
                "youtube_refresh_token": platform_configs.get("youtube_refresh_token"),
                "facebook_access_token": platform_configs.get("facebook_access_token"),
                "facebook_page_id": platform_configs.get("facebook_page_id"),
                "instagram_access_token": platform_configs.get("instagram_access_token"),
                "instagram_business_id": platform_configs.get("instagram_business_id"),
                "public_video_url": resolved_public_url or platform_configs.get("public_video_url") or settings.PUBLIC_VIDEO_URL
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

        # If this publication was scheduled, update scheduled_publish status in DB
        if clip.edit_options and isinstance(clip.edit_options, dict) and "scheduled_publish" in clip.edit_options:
            from datetime import datetime, timezone
            sched_dict = dict(clip.edit_options.get("scheduled_publish", {}))
            has_success = any(
                isinstance(url, str) and not url.startswith("error:")
                for url in published_urls.values()
            )
            sched_dict["status"] = "completed" if has_success else "failed"
            sched_dict["completed_at"] = datetime.now(timezone.utc).isoformat()
            new_edit_options = dict(clip.edit_options)
            new_edit_options["scheduled_publish"] = sched_dict
            clip.edit_options = new_edit_options
            flag_modified(clip, "edit_options")

        clip.published_urls = published_urls
        flag_modified(clip, "published_urls")
        db.commit()

        logger.info(f"Successfully processed publishing request for clip {clip_id}")
    except Exception as e:
        logger.error(f"Error during social publishing of clip {clip_id}: {e}", exc_info=True)
    finally:
        db.close()


@celery_app.task(ignore_result=True)
def caption_full_video_task(video_id: int, clip_id: int, edit_options: dict = None):
    """
    Analyzes the entire uploaded video, generates animated subtitles for the full duration,
    and burns them onto the video while strictly preserving the original aspect ratio
    (e.g. 16:9 widescreen or original source resolution) with subtitles placed in the lower third.
    """
    import os
    import uuid
    import subprocess
    from sqlalchemy.orm.attributes import flag_modified
    from app.services import object_storage
    from app.services.subtitle_service import subtitle_service
    from app.services.transcription_service import transcription_service

    logger.info(f"Starting full video caption task for video {video_id}, clip {clip_id}")
    edit_options = dict(edit_options or {})

    # Phase 1: Mark clip as RENDERING
    db = SessionLocal()
    try:
        video = db.query(models.Video).filter(models.Video.id == video_id).first()
        clip = db.query(models.Clip).filter(models.Clip.id == clip_id).first()
        if not video or not clip:
            logger.error(f"Cannot caption full video: video {video_id} or clip {clip_id} missing")
            return

        video_path = _resolve_video_path(video.storage_path)
        if not os.path.exists(video_path):
            logger.error(f"Video file missing at {video_path}")
            clip.status = models.ClipStatus.FAILED
            db.commit()
            return

        clip.status = models.ClipStatus.RENDERING
        video.status = models.VideoStatus.PROCESSING
        db.commit()

        # Check if transcript is cached
        from app.services.transcription_service import normalize_whisper_language, detect_video_context_language, is_hallucination_or_noise
        source_lang = edit_options.get("source_language")
        retranscribe = edit_options.get("retranscribe", False)
        norm_source_lang = normalize_whisper_language(source_lang)
        if not norm_source_lang and video:
            context_text = f"{video.original_filename or ''} {(video.content_analysis or {}).get('title', '')}"
            norm_source_lang = detect_video_context_language(context_text)
            if norm_source_lang:
                logger.info(f"Auto-detected language '{norm_source_lang}' from video metadata for full video {video_id}.")

        cached_meta = dict(video.content_analysis or {}).get("transcription_meta", {})
        cached_lang = cached_meta.get("language")
        cached_chunked = cached_meta.get("chunked", False)
        cached_version = cached_meta.get("version", 0)

        transcript_words = list(video.transcript or [])
        cached_is_clean = True

        # If video is > 180s but transcript was generated with older unchunked engine (version < 3)
        if (video.duration and video.duration > 180) and not cached_chunked and cached_version < 3:
            cached_is_clean = False
            logger.info(f"Full video {video_id} duration ({video.duration:.1f}s) > 180s but transcript is unchunked (version {cached_version}). Forcing retranscription for frame-accurate chunked alignment.")

        if cached_is_clean and transcript_words:
            for w in transcript_words[:50]:
                t_str = str(w.get("text", "")).strip()
                if is_hallucination_or_noise(t_str, allow_spoken_literal=bool(w.get("_word_aligned"))) or "\u0bd7\u0bc6" in t_str or any(0x0600 <= ord(c) <= 0x06FF for c in t_str):
                    cached_is_clean = False
                    logger.info(f"Full video {video_id} cached transcript contains hallucination artifacts ('{t_str}'). Forcing retranscription.")
                    break

        transcript_completed = (
            not retranscribe
            and cached_is_clean
            and video.transcription_status == models.TranscriptionStatus.COMPLETED
            and bool(transcript_words)
            and (norm_source_lang is None or cached_lang == norm_source_lang)
        )
    except Exception as init_err:
        logger.error(f"Failed to initialize full video caption task: {init_err}")
        db.rollback()
        return
    finally:
        db.close()

    # Phase 2: Transcribe if not cached
    if not transcript_completed:
        logger.info(f"Full video {video_id} transcript not cached. Transcribing audio [Lang={norm_source_lang}]...")
        db = SessionLocal()
        try:
            video = db.query(models.Video).filter(models.Video.id == video_id).first()
            audio_path = _resolve_or_extract_video_audio(video, video_path, db)
            if not audio_path or not os.path.exists(audio_path):
                raise RuntimeError("Could not extract audio track for full video captioning.")

            transcription_result = transcription_service.transcribe(audio_path, language=norm_source_lang)
            if isinstance(transcription_result, dict):
                transcript_words = transcription_result.get("words", [])
            else:
                transcript_words = list(transcription_result or [])
            video.transcript = transcript_words
            flag_modified(video, "transcript")
            video.transcription_status = models.TranscriptionStatus.COMPLETED

            meta_dict = dict(video.content_analysis or {})
            meta_dict["transcription_meta"] = {
                "language": norm_source_lang or "auto",
                "provider": transcription_service.last_provider or "unknown",
                "model": transcription_service.last_model or "unknown",
                "word_count": len(transcript_words),
                "chunked": True if (video.duration and video.duration > 180) else False,
                "version": 3
            }
            video.content_analysis = meta_dict
            flag_modified(video, "content_analysis")

            db.commit()
            logger.info(f"Full video {video_id} transcribed successfully with {len(transcript_words)} words.")
        except Exception as trans_err:
            logger.error(f"Failed to transcribe full video {video_id}: {trans_err}")
            db.rollback()
            db_err = SessionLocal()
            try:
                c = db_err.query(models.Clip).filter(models.Clip.id == clip_id).first()
                if c:
                    c.status = models.ClipStatus.FAILED
                    db_err.commit()
            finally:
                db_err.close()
            return
        finally:
            db.close()

    if not transcript_words:
        logger.warning(f"No spoken words detected in video {video_id}. Will produce clean copy.")

    # Phase 3: Probe video resolution & prepare output paths
    clips_dir = os.path.join(str(_BACKEND_DIR), "uploads", "clips")
    os.makedirs(clips_dir, exist_ok=True)
    output_filename = f"clip_{uuid.uuid4().hex[:8]}.mp4"
    output_path = os.path.join(clips_dir, output_filename)
    relative_path = _safe_relpath(output_path, str(_BACKEND_DIR))

    temp_id = uuid.uuid4().hex[:8]
    ass_path = os.path.join(clips_dir, f"temp_full_{temp_id}.ass")
    srt_filename = f"full_captions_{clip_id}_{temp_id}.srt"
    srt_path = os.path.join(clips_dir, srt_filename)
    srt_relative_path = _safe_relpath(srt_path, str(_BACKEND_DIR))

    width = 1920
    height = 1080
    scale_filter = ""
    try:
        probe_res = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=width,height",
                "-of", "csv=s=x:p=0",
                video_path
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=10
        )
        if probe_res.stdout.strip():
            w_str, h_str = probe_res.stdout.strip().split("x")
            orig_w = int(w_str)
            orig_h = int(h_str)
            if orig_w > 1920 or orig_h > 1080:
                scale_ratio = min(1920.0 / orig_w, 1080.0 / orig_h)
                width = int(round(orig_w * scale_ratio / 2) * 2)
                height = int(round(orig_h * scale_ratio / 2) * 2)
                scale_filter = f"scale={width}:{height}"
                logger.info(f"Ultra-speed optimization: scaling {orig_w}x{orig_h} to {width}x{height} for cloud deployment rendering.")
            else:
                width = orig_w
                height = orig_h
                logger.info(f"Probed source video resolution: {width}x{height}")
    except Exception as pr_err:
        logger.warning(f"Could not probe video resolution: {pr_err}. Defaulting to 1920x1080.")

    caption_style = str(edit_options.get("caption_style", "pop")).lower()
    captions_enabled = caption_style != "none"
    translate_lang = edit_options.get("translate_language", "none")
    caption_lang = edit_options.get("caption_language", "original")

    # Optional translation
    final_words = transcript_words
    if captions_enabled and translate_lang != "none" and caption_lang == "translated":
        try:
            from app.services.translation_service import translate_and_distribute_words
            final_words = translate_and_distribute_words(transcript_words, translate_lang)
            logger.info(f"Translated full video subtitles to {translate_lang}")
        except Exception as tr_err:
            logger.warning(f"Translation failed for full video, using original: {tr_err}")

    # Phase 4: Validate and clean transcript segments
    cleaned_words, val_stats = subtitle_service.validate_and_clean_transcript(final_words)
    logger.info(
        f"[Full Video Caption] Validation for clip {clip_id}: "
        f"total={val_stats['total_segments']}, accepted={val_stats['accepted_segments']}, "
        f"rejected={val_stats['rejected_segments']}"
    )

    # Generate permanent standalone SRT subtitle file
    srt_stats = subtitle_service.generate_srt(cleaned_words, srt_path) if captions_enabled else {
        "caption_count": 0,
        "first_timestamp": None,
        "last_timestamp": None,
        "file_size": 0,
    }

    # Generate ASS with widescreen lower-third configuration
    # For widescreen (e.g. 1920x1080), bottom margin should be ~70-80px from bottom edge
    font_size = edit_options.get("font_size") or max(36, int(height * 0.05))
    margin_v = max(40, int(height * 0.08))

    effective_target_lang = translate_lang if translate_lang != "none" else (norm_source_lang or "none")
    style_config = {
        "caption_style": caption_style,
        "target_lang": effective_target_lang,
        "primary_color": edit_options.get("primary_color"),
        "highlight_color": edit_options.get("highlight_color"),
        "resolution_x": width,
        "resolution_y": height,
        "margin_v": margin_v,
        "alignment": 2,  # Bottom-Center
        "font_size": font_size,
        "max_words": 6,  # 6-8 words per line on widescreen
    }

    import time
    render_start = time.time()

    try:
        if captions_enabled:
            subtitle_service.generate_ass(cleaned_words, ass_path, style_config)
            # Burn subtitles into video keeping original aspect ratio
            subtitle_service.burn_subtitles(video_path, ass_path, output_path, scale_filter=scale_filter)
        else:
            # Produce a clean full-length video without creating or burning subtitle files.
            video_args = subtitle_service._get_fast_video_encoding_args()
            clean_cmd = ["ffmpeg", "-y", "-i", video_path, "-map", "0:v:0", "-map", "0:a?"]
            if scale_filter:
                clean_cmd.extend(["-vf", scale_filter])
            clean_cmd.extend(["-fpsmax", "30", *video_args, "-c:a", "copy", "-movflags", "+faststart", output_path])
            clean_result = subprocess.run(clean_cmd, capture_output=True)
            if clean_result.returncode != 0 and any("h264_nvenc" in str(arg) for arg in video_args):
                cpu_cmd = ["ffmpeg", "-y", "-i", video_path, "-map", "0:v:0", "-map", "0:a?"]
                if scale_filter:
                    cpu_cmd.extend(["-vf", scale_filter])
                cpu_cmd.extend([
                    "-fpsmax", "30", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "22",
                    "-tune", "fastdecode", "-threads", "0", "-pix_fmt", "yuv420p",
                    "-c:a", "copy", "-movflags", "+faststart", output_path,
                ])
                clean_result = subprocess.run(cpu_cmd, capture_output=True)
            if clean_result.returncode != 0:
                clean_error = clean_result.stderr.decode("utf-8", errors="ignore") if clean_result.stderr else "unknown FFmpeg error"
                raise RuntimeError(f"Failed to render video without captions: {clean_error[-2000:]}")
        render_duration = round(time.time() - render_start, 2)
        output_file_size = os.path.getsize(output_path) if os.path.exists(output_path) else 0
        logger.info(f"Successfully burned full video subtitles to {output_path} in {render_duration}s ({output_file_size} bytes)")

        # Persist SRT file to remote object storage if enabled
        if captions_enabled and object_storage.enabled():
            final_srt_storage = object_storage.upload_file(srt_path, f"clips/{srt_filename}", "text/plain; charset=utf-8")
        elif captions_enabled:
            final_srt_storage = srt_relative_path
        else:
            final_srt_storage = None

        # Update Clip & Video in DB
        db = SessionLocal()
        try:
            c = db.query(models.Clip).filter(models.Clip.id == clip_id).first()
            v = db.query(models.Video).filter(models.Video.id == video_id).first()
            dur = 0.0
            if c:
                # Probe final duration from local file before upload
                try:
                    from app.services.video_service import video_service
                    meta = video_service.get_metadata(output_path)
                    dur = float(meta.get("duration", 0.0))
                    if dur > 0:
                        c.duration = dur
                        c.end_time = dur
                except Exception:
                    pass

                # Upload to Cloudflare R2 and delete local copy
                if object_storage.enabled():
                    final_storage_path = object_storage.upload_file(output_path, f"clips/{output_filename}", "video/mp4")
                    logger.info(f"Uploaded captioned full video to Cloudflare R2: {final_storage_path}")
                    try:
                        if os.path.exists(output_path):
                            os.remove(output_path)
                    except OSError:
                        pass
                else:
                    final_storage_path = relative_path

                c.status = models.ClipStatus.COMPLETED
                c.storage_path = final_storage_path
                c.edit_options = {
                    **edit_options,
                    "resolution": f"{width}x{height}",
                    "captioned_full_video": captions_enabled,
                    "captions_enabled": captions_enabled,
                    "srt_path": final_srt_storage,
                    "caption_count": srt_stats.get("caption_count", 0),
                    "validation_stats": val_stats,
                    "srt_stats": srt_stats,
                    "render_duration_sec": render_duration,
                    "output_file_size": output_file_size,
                }
                flag_modified(c, "edit_options")

            if v:
                v.status = models.VideoStatus.COMPLETED

            db.commit()
            logger.info(
                f"[Observability] clip_id={clip_id} video_id={video_id} "
                f"source_duration={dur}s seg_total={val_stats['total_segments']} "
                f"seg_accepted={val_stats['accepted_segments']} seg_rejected={val_stats['rejected_segments']} "
                f"first_caption_ts={srt_stats['first_timestamp']}s last_caption_ts={srt_stats['last_timestamp']}s "
                f"caption_count={srt_stats['caption_count']} srt_size={srt_stats['file_size']}B "
                f"render_duration={render_duration}s output_size={output_file_size}B"
            )
            logger.info(f"Full video caption task completed successfully for clip {clip_id}!")
        finally:
            db.close()

    except Exception as burn_err:
        logger.error(f"Failed to burn full video subtitles for clip {clip_id}: {burn_err}", exc_info=True)
        db = SessionLocal()
        try:
            c = db.query(models.Clip).filter(models.Clip.id == clip_id).first()
            if c:
                c.status = models.ClipStatus.FAILED
                opts = dict(c.edit_options or {})
                opts["error"] = str(burn_err)
                c.edit_options = opts
                flag_modified(c, "edit_options")
                db.commit()
        finally:
            db.close()
    finally:
        # Cleanup temp ASS file (keep SRT permanent for download/preview)
        if os.path.exists(ass_path):
            try:
                os.remove(ass_path)
            except Exception:
                pass

