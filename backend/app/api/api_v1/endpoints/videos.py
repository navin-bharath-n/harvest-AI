from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List
import shutil
import os
import uuid
from app.core.database import get_db
from app import models, schemas
from app.tasks.video_tasks import process_video_task

import pathlib as _pathlib

router = APIRouter()

# Absolute path so uploads always land in backend/uploads/ regardless of launch CWD
_BACKEND_DIR = _pathlib.Path(__file__).resolve().parent.parent.parent.parent.parent  # backend/
UPLOAD_DIR = str(_BACKEND_DIR / "uploads")

@router.post("/", response_model=schemas.Video)
def upload_video(
    project_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    # Verify project exists
    db_project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Ensure upload directory exists
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    # Validate file extension
    ALLOWED_EXTENSIONS = {".mp4", ".mkv", ".avi", ".mov", ".webm", ".flv"}
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Please upload a valid video file. Supported formats: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    # Save file
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Quick metadata probe with ffprobe in 0.05s
    duration = None
    resolution = None
    fps = None
    try:
        from pathlib import Path
        from app.services.video_processor import VideoProcessor
        vp = VideoProcessor()
        meta = vp._get_metadata(Path(file_path))
        duration = meta.get("duration")
        resolution = meta.get("resolution")
        fps = meta.get("fps")
    except Exception as e:
        logger.warning(f"Fast ffprobe metadata probe on upload: {e}")

    # Create DB record in COMPLETED (ready to generate) state
    db_video = models.Video(
        original_filename=file.filename,
        storage_path=file_path,
        project_id=project_id,
        duration=duration,
        resolution=resolution,
        fps=fps,
        status=models.VideoStatus.COMPLETED
    )
    db.add(db_video)
    db.commit()
    db.refresh(db_video)

    return db_video

@router.get("/", response_model=List[schemas.Video])
def read_videos(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    videos = db.query(models.Video).offset(skip).limit(limit).all()
    return videos

@router.post("/{video_id}/transcribe", response_model=schemas.Video)
def transcribe_video(video_id: int, db: Session = Depends(get_db)):
    db_video = db.query(models.Video).filter(models.Video.id == video_id).first()
    if not db_video:
        raise HTTPException(status_code=404, detail="Video not found")

    if db_video.status != models.VideoStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Video must be fully processed before transcription")

    if db_video.transcription_status == models.TranscriptionStatus.PROCESSING:
        raise HTTPException(status_code=400, detail="Transcription is already in progress")

    # Set status to pending and trigger task
    db_video.transcription_status = models.TranscriptionStatus.PENDING
    db.commit()
    db.refresh(db_video)

    from app.tasks.video_tasks import transcribe_video_task
    transcribe_video_task.apply_async(args=[db_video.id], queue='aishorts-queue')

    return db_video

@router.post("/{video_id}/analyze", response_model=schemas.Video)
def analyze_video(video_id: int, db: Session = Depends(get_db)):
    db_video = db.query(models.Video).filter(models.Video.id == video_id).first()
    if not db_video:
        raise HTTPException(status_code=404, detail="Video not found")

    if db_video.transcription_status != models.TranscriptionStatus.COMPLETED or not db_video.transcript:
        raise HTTPException(status_code=400, detail="Video must be successfully transcribed before AI analysis")

    if db_video.analysis_status == models.ContentAnalysisStatus.PROCESSING:
        raise HTTPException(status_code=400, detail="AI analysis is already in progress")

    # Set status to pending and trigger task
    db_video.analysis_status = models.ContentAnalysisStatus.PENDING
    db.commit()
    db.refresh(db_video)

    from app.tasks.video_tasks import analyze_content_task
    analyze_content_task.apply_async(args=[db_video.id], queue='aishorts-queue')

    return db_video

@router.post("/{video_id}/detect-highlights", response_model=schemas.Video)
def detect_highlights(video_id: int, db: Session = Depends(get_db)):
    db_video = db.query(models.Video).filter(models.Video.id == video_id).first()
    if not db_video:
        raise HTTPException(status_code=404, detail="Video not found")

    if db_video.analysis_status != models.ContentAnalysisStatus.COMPLETED or not db_video.content_analysis:
        raise HTTPException(status_code=400, detail="Video must have completed content analysis first")

    if db_video.highlight_status == models.HighlightDetectionStatus.PROCESSING:
        raise HTTPException(status_code=400, detail="Highlight detection is already in progress")

    # Set status to pending and trigger task
    db_video.highlight_status = models.HighlightDetectionStatus.PENDING
    db.commit()
    db.refresh(db_video)

    from app.tasks.video_tasks import detect_highlights_task
    detect_highlights_task.apply_async(args=[db_video.id], queue='aishorts-queue')

    return db_video

@router.post("/{video_id}/smart-crop", response_model=schemas.Video)
def generate_smart_crop(
    video_id: int,
    request: schemas.SmartCropRequest,
    db: Session = Depends(get_db)
):
    db_video = db.query(models.Video).filter(models.Video.id == video_id).first()
    if not db_video:
        raise HTTPException(status_code=404, detail="Video not found")

    if db_video.status != models.VideoStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Video must be fully processed first")

    if db_video.crop_status == models.CropStatus.PROCESSING:
        raise HTTPException(status_code=400, detail="Smart cropping is already in progress")

    # Set status to pending and trigger task
    db_video.crop_status = models.CropStatus.PENDING
    db.commit()
    db.refresh(db_video)

    from app.tasks.video_tasks import generate_smart_crop_task
    generate_smart_crop_task.apply_async(args=[db_video.id, request.target_fps], queue='aishorts-queue')

    return db_video

@router.post("/{video_id}/clips", response_model=schemas.Clip)
def render_clip(
    video_id: int,
    clip_in: schemas.ClipCreate,
    db: Session = Depends(get_db)
):
    db_video = db.query(models.Video).filter(models.Video.id == video_id).first()
    if not db_video:
        raise HTTPException(status_code=404, detail="Video not found")

    if clip_in.end_time <= clip_in.start_time:
        raise HTTPException(status_code=400, detail="End time must be greater than start time")

    db_clip = models.Clip(
        video_id=video_id,
        title=clip_in.title,
        start_time=clip_in.start_time,
        end_time=clip_in.end_time,
        duration=clip_in.end_time - clip_in.start_time,
        status=models.ClipStatus.PENDING,
        edit_options=clip_in.edit_options
    )
    db.add(db_clip)
    db.commit()
    db.refresh(db_clip)

    from app.tasks.video_tasks import render_clip_task
    render_clip_task.apply_async(args=[db_clip.id], queue='aishorts-queue')

    return db_clip

@router.get("/{video_id}/clips", response_model=list[schemas.Clip])
def get_clips(
    video_id: int,
    db: Session = Depends(get_db)
):
    db_video = db.query(models.Video).filter(models.Video.id == video_id).first()
    if not db_video:
        raise HTTPException(status_code=404, detail="Video not found")

    return db.query(models.Clip).filter(models.Clip.video_id == video_id).all()

@router.post("/{video_id}/master-generate", response_model=schemas.Video)
def generate_master_shorts(
    video_id: int,
    request: schemas.MasterGenerateRequest,
    db: Session = Depends(get_db)
):
    db_video = db.query(models.Video).filter(models.Video.id == video_id).first()
    if not db_video:
        raise HTTPException(status_code=404, detail="Video not found")

    # Clean up old master variations for this video so we don't accumulate duplicates
    old_clips = db.query(models.Clip).filter(
        models.Clip.video_id == video_id,
        models.Clip.title.like("%Master Variation%")
    ).all()
    _app_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    for oc in old_clips:
        if oc.storage_path:
            full_path = os.path.join(_app_dir, oc.storage_path) if not os.path.isabs(oc.storage_path) else oc.storage_path
            if os.path.exists(full_path):
                try:
                    os.remove(full_path)
                except Exception:
                    pass
        db.delete(oc)

    # Reset status fields in database immediately so progress displays correctly in UI
    db_video.status = models.VideoStatus.PROCESSING
    db_video.transcription_status = models.TranscriptionStatus.NONE
    db_video.analysis_status = models.ContentAnalysisStatus.NONE
    db_video.highlight_status = models.HighlightDetectionStatus.NONE
    db_video.crop_status = models.CropStatus.NONE
    db.commit()
    db.refresh(db_video)

    from app.tasks.video_tasks import generate_master_shorts_task
    generate_master_shorts_task.apply_async(
        args=[
            db_video.id,
            request.length,
            request.platform,
            request.optional_prompt,
            request.translate_language,
            request.dub_voice,
            request.caption_language,
            request.dub_mix_mode,
            request.speaker_gender,
            request.audio_theme,
            request.framing_mode or "fit_blur"
        ],
        queue='aishorts-queue'
    )

    return db_video

@router.get("/{video_id}/variations", response_model=list[schemas.Clip])
def get_master_variations(
    video_id: int,
    db: Session = Depends(get_db)
):
    # Returns clips that have "Master Variation" in the title, deduplicated to the latest 5
    db_video = db.query(models.Video).filter(models.Video.id == video_id).first()
    if not db_video:
        raise HTTPException(status_code=404, detail="Video not found")

    clips = db.query(models.Clip).filter(
        models.Clip.video_id == video_id,
        models.Clip.title.like("%Master Variation%")
    ).order_by(models.Clip.id.desc()).all()

    unique_variations = []
    seen_titles = set()
    for c in clips:
        title_key = c.title or str(c.id)
        if title_key not in seen_titles:
            seen_titles.add(title_key)
            unique_variations.append(c)
        if len(unique_variations) >= 5:
            break

    return list(reversed(unique_variations))

@router.get("/{video_id}/status")
def get_video_status(video_id: int, db: Session = Depends(get_db)):
    """Returns a detailed pipeline status for the frontend progress UI."""
    db_video = db.query(models.Video).filter(models.Video.id == video_id).first()
    if not db_video:
        raise HTTPException(status_code=404, detail="Video not found")

    variations = [c for c in db_video.clips if c.title and "Master Variation" in c.title]
    completed_variations = [c for c in variations if c.status and c.status.value == "completed"]

    TOTAL_VARIATIONS = 5

    # Determine which pipeline stage is active
    stage = "idle"
    stage_label = "Ready"

    transcription_stat = db_video.transcription_status.value if db_video.transcription_status else "none"
    analysis_stat = db_video.analysis_status.value if db_video.analysis_status else "none"
    highlight_stat = db_video.highlight_status.value if db_video.highlight_status else "none"
    crop_stat = db_video.crop_status.value if db_video.crop_status else "none"

    # If any variations are ready, all initial steps are completed
    if len(completed_variations) > 0:
        transcription_stat = "completed"
        analysis_stat = "completed"
        highlight_stat = "completed"
        crop_stat = "completed"

    if db_video.status and db_video.status.value == "processing":
        if len(completed_variations) >= TOTAL_VARIATIONS:
            stage = "done"
            stage_label = "All 5 variations ready."
        elif len(completed_variations) > 0:
            stage = "rendering"
            stage_label = f"Rendering variations ({len(completed_variations)}/{TOTAL_VARIATIONS} ready)..."
        elif crop_stat == "processing":
            stage = "cropping"
            stage_label = "Computing 9:16 dynamic framing..."
        elif highlight_stat == "processing":
            stage = "highlighting"
            stage_label = "Detecting viral highlights..."
        elif analysis_stat == "processing":
            stage = "analyzing"
            stage_label = "Running AI content analysis..."
        elif transcription_stat == "processing":
            from app.services.transcription_service import transcription_service
            engine = "Google STT" if (transcription_service.use_google and not transcription_service._google_quota_exhausted) else "Local Whisper"
            stage = "transcribing"
            stage_label = f"Transcribing audio with {engine}..."
        else:
            stage = "rendering"
            stage_label = "Rendering animated variations..."
    elif db_video.status and db_video.status.value == "completed":
        if len(completed_variations) >= TOTAL_VARIATIONS:
            stage = "done"
            stage_label = "All 5 variations ready."
        elif len(completed_variations) > 0:
            stage = "rendering"
            stage_label = f"Rendering variations ({len(completed_variations)}/{TOTAL_VARIATIONS} ready)..."
        else:
            stage = "idle"
            stage_label = "Ready to generate"

    is_finished = len(completed_variations) >= TOTAL_VARIATIONS
    return {
        "video_id": video_id,
        "original_filename": db_video.original_filename or f"Video {video_id}",
        "stage": stage,
        "stage_label": stage_label,
        "video_status": db_video.status.value if db_video.status else "pending",
        "transcription_status": transcription_stat,
        "analysis_status": analysis_stat,
        "highlight_status": highlight_stat,
        "crop_status": crop_stat,
        "variations_ready": len(completed_variations),
        "variations_total": TOTAL_VARIATIONS,
        "is_done": is_finished,
        "is_complete": is_finished,
    }

@router.post("/cancel-all")
def cancel_all_generations(db: Session = Depends(get_db)):
    """Cancels all active video generation tasks across the whole system."""
    try:
        from app.services.master_agent import cancel_all_video_jobs
        cancel_all_video_jobs()
    except Exception as e:
        logger.warning(f"Error registering cancel all: {e}")

    # Revoke all Celery tasks across all workers and queues
    try:
        from app.core.celery_app import celery_app
        i = celery_app.control.inspect()
        if i:
            for fetcher in [i.active, i.reserved, i.scheduled]:
                try:
                    tasks_dict = fetcher() if fetcher else None
                    if tasks_dict:
                        for worker, tasks in tasks_dict.items():
                            for t in tasks:
                                celery_app.control.revoke(t['id'], terminate=True, signal='SIGKILL')
                                logger.info(f"Revoked Celery task {t['id']}")
                except Exception as e:
                    logger.warning(f"Error inspecting/revoking tasks: {e}")
    except Exception as e:
        logger.warning(f"Error revoking all Celery tasks: {e}")

    # Mark all currently processing or pending videos as FAILED
    active_videos = db.query(models.Video).filter(
        models.Video.status.in_([models.VideoStatus.PROCESSING, models.VideoStatus.PENDING])
    ).all()

    for v in active_videos:
        v.status = models.VideoStatus.FAILED
        v.transcription_status = models.TranscriptionStatus.NONE
        v.analysis_status = models.ContentAnalysisStatus.NONE
        v.highlight_status = models.HighlightDetectionStatus.NONE
        v.crop_status = models.CropStatus.NONE

    db.commit()
    return {"success": True, "cancelled_count": len(active_videos), "message": "All active generations cancelled."}


@router.post("/{video_id}/cancel-generation")
def cancel_generation(video_id: int, db: Session = Depends(get_db)):
    """Cancels active video generation and revokes background Celery tasks."""
    db_video = db.query(models.Video).filter(models.Video.id == video_id).first()
    if not db_video:
        raise HTTPException(status_code=404, detail="Video not found")

    try:
        from app.services.master_agent import cancel_video_job
        cancel_video_job(video_id)
    except Exception as e:
        logger.warning(f"Error registering cancel for video {video_id}: {e}")

    try:
        from app.core.celery_app import celery_app
        i = celery_app.control.inspect()
        if i:
            for fetcher in [i.active, i.reserved, i.scheduled]:
                try:
                    tasks_dict = fetcher() if fetcher else None
                    if tasks_dict:
                        for worker, tasks in tasks_dict.items():
                            for t in tasks:
                                if t.get('args') and len(t['args']) > 0 and t['args'][0] == video_id:
                                    celery_app.control.revoke(t['id'], terminate=True, signal='SIGKILL')
                                    logger.info(f"Revoked Celery task {t['id']} for video {video_id}")
                except Exception as e:
                    logger.warning(f"Error inspecting/revoking tasks: {e}")
    except Exception as e:
        logger.warning(f"Error revoking Celery tasks for video {video_id}: {e}")

    db_video.status = models.VideoStatus.FAILED
    db_video.transcription_status = models.TranscriptionStatus.NONE
    db_video.analysis_status = models.ContentAnalysisStatus.NONE
    db_video.highlight_status = models.HighlightDetectionStatus.NONE
    db_video.crop_status = models.CropStatus.NONE
    db.commit()
    db.refresh(db_video)

    return {"success": True, "message": "Video generation cancelled successfully."}

@router.put("/clips/{clip_id}", response_model=schemas.Clip)
def update_clip(
    clip_id: int,
    clip_in: schemas.ClipCreate,
    db: Session = Depends(get_db)
):
    db_clip = db.query(models.Clip).filter(models.Clip.id == clip_id).first()
    if not db_clip:
        raise HTTPException(status_code=404, detail="Clip not found")

    db_clip.title = clip_in.title
    db_clip.start_time = clip_in.start_time
    db_clip.end_time = clip_in.end_time
    db_clip.duration = clip_in.end_time - clip_in.start_time
    db_clip.status = models.ClipStatus.PENDING
    db_clip.edit_options = clip_in.edit_options

    db.commit()
    db.refresh(db_clip)

    from app.tasks.video_tasks import render_clip_task
    render_clip_task.apply_async(args=[db_clip.id], queue='aishorts-queue')

    return db_clip


@router.delete("/{video_id}")
def delete_video(video_id: int, db: Session = Depends(get_db)):
    db_video = db.query(models.Video).filter(models.Video.id == video_id).first()
    if not db_video:
        raise HTTPException(status_code=404, detail="Video not found")

    if db_video.storage_path and os.path.exists(db_video.storage_path):
        try:
            os.remove(db_video.storage_path)
        except Exception as e:
            print(f"Error removing storage_path {db_video.storage_path}: {e}")
    if db_video.audio_path and os.path.exists(db_video.audio_path):
        try:
            os.remove(db_video.audio_path)
        except Exception as e:
            print(f"Error removing audio_path {db_video.audio_path}: {e}")
    if db_video.frame_directory and os.path.exists(db_video.frame_directory):
        try:
            shutil.rmtree(db_video.frame_directory, ignore_errors=True)
        except Exception as e:
            print(f"Error removing frame_directory {db_video.frame_directory}: {e}")

    for clip in db_video.clips:
        if clip.storage_path and os.path.exists(clip.storage_path):
            try:
                os.remove(clip.storage_path)
            except Exception as e:
                print(f"Error removing clip storage_path {clip.storage_path}: {e}")

    db.delete(db_video)
    db.commit()
    return {"message": "Video deleted successfully"}

from pydantic import BaseModel

class TranslateTranscriptRequest(BaseModel):
    words: list[dict]
    target_lang: str

@router.post("/translate-transcript")
def translate_transcript(request: TranslateTranscriptRequest):
    from app.services.translation_service import translate_and_distribute_words
    try:
        translated = translate_and_distribute_words(request.words, request.target_lang)
        return translated
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/clips/{clip_id}", response_model=schemas.Clip)
def read_clip(
    clip_id: int,
    db: Session = Depends(get_db)
):
    db_clip = db.query(models.Clip).filter(models.Clip.id == clip_id).first()
    if not db_clip:
        raise HTTPException(status_code=404, detail="Clip not found")
    return db_clip

@router.post("/clips/{clip_id}/publish")
def publish_clip(
    clip_id: int,
    request: schemas.ClipPublishRequest,
    db: Session = Depends(get_db)
):
    db_clip = db.query(models.Clip).filter(models.Clip.id == clip_id).first()
    if not db_clip:
        raise HTTPException(status_code=404, detail="Clip not found")

    # Clear stale publishing statuses for the requested platforms in the database
    published_urls = db_clip.published_urls or {}
    if not isinstance(published_urls, dict):
        published_urls = dict(published_urls)
    else:
        published_urls = published_urls.copy()

    for platform in request.platforms:
        published_urls.pop(platform, None)

    db_clip.published_urls = published_urls
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(db_clip, "published_urls")
    db.commit()
    db.refresh(db_clip)

    from app.tasks.video_tasks import publish_video_task
    publish_video_task.apply_async(
        args=[db_clip.id, request.dict()],
        queue='aishorts-queue'
    )
    return {"message": "Publishing task triggered", "task_id": db_clip.id}
