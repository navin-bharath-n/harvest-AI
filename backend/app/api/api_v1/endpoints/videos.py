from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import shutil
import os
import uuid
import logging
from app.core.database import get_db
from app.api.deps import get_current_user
from app import models, schemas
from app.tasks.video_tasks import process_video_task

import pathlib as _pathlib
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)

# Absolute path to the backend/ directory — used to resolve relative paths consistently
# across local Windows dev and Linux cloud (Docker / Render) deployments.
_BACKEND_DIR = _pathlib.Path(__file__).resolve().parent.parent.parent.parent.parent

def _resolve_path(path_str: str) -> str:
    """Resolve a stored path (may be relative or Windows absolute) to an OS-native absolute path."""
    if not path_str:
        return ""
    if os.path.exists(path_str):
        return os.path.abspath(path_str)
    normalized = path_str.replace("\\", "/").lstrip("/")
    candidate = os.path.join(str(_BACKEND_DIR), normalized)
    if os.path.exists(candidate):
        return os.path.abspath(candidate)
    fname = os.path.basename(path_str)
    for sub in ("uploads", os.path.join("uploads", "clips")):
        c = os.path.join(str(_BACKEND_DIR), sub, fname)
        if os.path.exists(c):
            return os.path.abspath(c)
    return os.path.abspath(candidate)

def _remove_safe(path_str: str):
    """Remove a file or directory, trying multiple path resolution strategies."""
    if not path_str:
        return
    resolved = _resolve_path(path_str)
    try:
        if os.path.isfile(resolved):
            os.remove(resolved)
        elif os.path.isdir(resolved):
            shutil.rmtree(resolved, ignore_errors=True)
    except Exception as e:
        logger.warning(f"Could not remove media {path_str!r}: {e}")

# Redis is required for distributed production workers. If it is unavailable,
# keep the development fallback bounded so concurrent requests cannot start an
# unbounded number of model/FFmpeg jobs inside the API process.
_fallback_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="video-fallback")

router = APIRouter()

def get_user_video(video_id: int, user_id: int, db: Session) -> models.Video:
    video = db.query(models.Video).join(models.Project).filter(
        models.Video.id == video_id,
        models.Project.owner_id == user_id
    ).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return video

def get_user_clip(clip_id: int, user_id: int, db: Session) -> models.Clip:
    clip = db.query(models.Clip).join(models.Video).join(models.Project).filter(
        models.Clip.id == clip_id,
        models.Project.owner_id == user_id
    ).first()
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")
    return clip

def dispatch_task(celery_task, *args, **kwargs):
    """
    Dispatches a task to Celery via Redis broker.
    If Redis/Celery is unavailable, has no active workers, or throws a connection error,
    gracefully executes the task in a background daemon thread so processing succeeds immediately.
    """
    queue = kwargs.pop("queue", "aishorts-queue")
    from app.core.config import settings
    task_fn = getattr(celery_task, "run", celery_task)
    is_localhost_redis = "localhost" in settings.CELERY_BROKER_URL or "127.0.0.1" in settings.CELERY_BROKER_URL
    is_cloud_env = bool(os.environ.get("RAILWAY_ENVIRONMENT") or os.environ.get("RENDER") or os.environ.get("PORT"))

    if is_cloud_env and is_localhost_redis:
        logger.info(
            f"Redis broker is not set on cloud host. Executing {getattr(celery_task, '__name__', str(celery_task))} in background daemon thread."
        )
        _fallback_executor.submit(task_fn, *args, **kwargs)
        return

    # Check if a Celery worker is actually active and responsive
    use_celery = False
    try:
        from app.core.celery_app import celery_app
        workers = celery_app.control.ping(timeout=0.25)
        if workers:
            use_celery = True
    except Exception as ping_err:
        logger.debug(f"Celery worker check failed ({ping_err}). Defaulting to background daemon thread.")
        use_celery = False

    if use_celery:
        try:
            celery_task.apply_async(args=list(args), queue=queue, **kwargs)
            logger.info(f"Dispatched task {getattr(celery_task, '__name__', str(celery_task))} to Celery queue '{queue}'")
            return
        except Exception as e:
            logger.warning(
                f"Celery dispatch failed ({e}). Gracefully falling back to background daemon thread for {getattr(celery_task, '__name__', str(celery_task))}."
            )

    logger.info(f"Executing {getattr(celery_task, '__name__', str(celery_task))} in background daemon thread.")
    _fallback_executor.submit(task_fn, *args, **kwargs)

# Absolute path so uploads always land in backend/uploads/ regardless of launch CWD
_BACKEND_DIR = _pathlib.Path(__file__).resolve().parent.parent.parent.parent.parent  # backend/
UPLOAD_DIR = str(_BACKEND_DIR / "uploads")

# Maximum allowed video upload size: 2 GB
MAX_UPLOAD_SIZE_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB

@router.post("/", response_model=schemas.Video)
async def upload_video(
    project_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Verify project exists and belongs to current user
    db_project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.owner_id == current_user.id
    ).first()
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

    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)
    resolved_path = os.path.abspath(file_path)
    if not resolved_path.startswith(os.path.abspath(UPLOAD_DIR)):
        raise HTTPException(status_code=400, detail="Invalid file destination")

    # Stream file to disk in 1MB chunks to avoid high memory usage
    bytes_written = 0
    try:
        with open(resolved_path, "wb") as buffer:
            while chunk := await file.read(1024 * 1024):
                bytes_written += len(chunk)
                if bytes_written > MAX_UPLOAD_SIZE_BYTES:
                    buffer.close()
                    if os.path.exists(resolved_path):
                        os.remove(resolved_path)
                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large. Maximum allowed size is {MAX_UPLOAD_SIZE_BYTES // (1024 ** 3)} GB."
                    )
                buffer.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        if os.path.exists(resolved_path):
            os.remove(resolved_path)
        logger.error(f"Failed to save uploaded video: {e}")
        raise HTTPException(status_code=500, detail="Failed to save video upload")

    file_path = resolved_path

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

    # Create DB record in COMPLETED upload state with pending analysis
    db_video = models.Video(
        original_filename=file.filename,
        storage_path=f"uploads/{unique_filename}",
        project_id=project_id,
        duration=duration,
        resolution=resolution,
        fps=fps,
        status=models.VideoStatus.COMPLETED,
        transcription_status=models.TranscriptionStatus.PENDING,
        analysis_status=models.ContentAnalysisStatus.PENDING,
        highlight_status=models.HighlightDetectionStatus.PENDING
    )
    db.add(db_video)
    db.commit()
    db.refresh(db_video)

    return db_video

@router.post("/{video_id}/extract-highlights", response_model=schemas.Video)
def extract_highlights(
    video_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_video = get_user_video(video_id, current_user.id, db)

    db_video.status = models.VideoStatus.PROCESSING
    db_video.transcription_status = models.TranscriptionStatus.PROCESSING
    db_video.analysis_status = models.ContentAnalysisStatus.PENDING
    db_video.highlight_status = models.HighlightDetectionStatus.PENDING
    db.commit()
    db.refresh(db_video)

    from app.tasks.video_tasks import extract_top5_highlights_task
    dispatch_task(extract_top5_highlights_task, db_video.id)
    return db_video

@router.get("/", response_model=List[schemas.Video])
def read_videos(
    skip: int = 0,
    limit: int = 100,
    project_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    query = db.query(models.Video).join(models.Project).filter(models.Project.owner_id == current_user.id)
    if project_id:
        query = query.filter(models.Video.project_id == project_id)
    videos = query.offset(skip).limit(limit).all()
    return videos

@router.get("/{video_id}", response_model=schemas.Video)
def read_single_video(
    video_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Retrieve a single video by ID without downloading the entire video collection."""
    db_video = get_user_video(video_id, current_user.id, db)
    return db_video

@router.post("/{video_id}/transcribe", response_model=schemas.Video)
def transcribe_video(
    video_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_video = get_user_video(video_id, current_user.id, db)

    if db_video.status != models.VideoStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Video must be fully processed before transcription")

    if db_video.transcription_status == models.TranscriptionStatus.PROCESSING:
        raise HTTPException(status_code=400, detail="Transcription is already in progress")

    # Set status to pending and trigger task
    db_video.transcription_status = models.TranscriptionStatus.PENDING
    db.commit()
    db.refresh(db_video)

    from app.tasks.video_tasks import transcribe_video_task
    dispatch_task(transcribe_video_task, db_video.id)

    return db_video

@router.post("/{video_id}/analyze", response_model=schemas.Video)
def analyze_video(
    video_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_video = get_user_video(video_id, current_user.id, db)

    if db_video.transcription_status != models.TranscriptionStatus.COMPLETED or not db_video.transcript:
        raise HTTPException(status_code=400, detail="Video must be successfully transcribed before AI analysis")

    if db_video.analysis_status == models.ContentAnalysisStatus.PROCESSING:
        raise HTTPException(status_code=400, detail="AI analysis is already in progress")

    # Set status to pending and trigger task
    db_video.analysis_status = models.ContentAnalysisStatus.PENDING
    db.commit()
    db.refresh(db_video)

    from app.tasks.video_tasks import analyze_content_task
    dispatch_task(analyze_content_task, db_video.id)

    return db_video

@router.post("/{video_id}/detect-highlights", response_model=schemas.Video)
def detect_highlights(
    video_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_video = get_user_video(video_id, current_user.id, db)

    if db_video.analysis_status != models.ContentAnalysisStatus.COMPLETED or not db_video.content_analysis:
        raise HTTPException(status_code=400, detail="Video must have completed content analysis first")

    if db_video.highlight_status == models.HighlightDetectionStatus.PROCESSING:
        raise HTTPException(status_code=400, detail="Highlight detection is already in progress")

    # Set status to pending and trigger task
    db_video.highlight_status = models.HighlightDetectionStatus.PENDING
    db.commit()
    db.refresh(db_video)

    from app.tasks.video_tasks import detect_highlights_task
    dispatch_task(detect_highlights_task, db_video.id)

    return db_video

@router.post("/{video_id}/smart-crop", response_model=schemas.Video)
def generate_smart_crop(
    video_id: int,
    request: schemas.SmartCropRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_video = get_user_video(video_id, current_user.id, db)

    if db_video.status != models.VideoStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Video must be fully processed first")

    if db_video.crop_status == models.CropStatus.PROCESSING:
        raise HTTPException(status_code=400, detail="Smart cropping is already in progress")

    # Set status to pending and trigger task
    db_video.crop_status = models.CropStatus.PENDING
    db.commit()
    db.refresh(db_video)

    from app.tasks.video_tasks import generate_smart_crop_task
    dispatch_task(generate_smart_crop_task, db_video.id, request.target_fps)

    return db_video

@router.post("/{video_id}/clips", response_model=schemas.Clip)
def render_clip(
    video_id: int,
    clip_in: schemas.ClipCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_video = get_user_video(video_id, current_user.id, db)

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
    dispatch_task(render_clip_task, db_clip.id)

    return db_clip

@router.get("/{video_id}/clips", response_model=list[schemas.Clip])
def get_clips(
    video_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_video = get_user_video(video_id, current_user.id, db)
    clips = db.query(models.Clip).filter(models.Clip.video_id == video_id).all()
    # Annotate each clip with whether its media file physically exists on this server
    for c in clips:
        if c.storage_path:
            resolved = _resolve_path(c.storage_path)
            c.file_exists = os.path.isfile(resolved)
        else:
            c.file_exists = False
    return clips

@router.post("/{video_id}/master-generate", response_model=schemas.Video)
def generate_master_shorts(
    video_id: int,
    request: schemas.MasterGenerateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_video = get_user_video(video_id, current_user.id, db)
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
    dispatch_task(
        generate_master_shorts_task,
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
        request.framing_mode or "fit_blur",
        queue='aishorts-queue'
    )

    return db_video

@router.get("/{video_id}/variations", response_model=list[schemas.Clip])
def get_master_variations(
    video_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Returns clips that have "Master Variation" in the title, deduplicated to the latest 5
    db_video = get_user_video(video_id, current_user.id, db)

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
            # Annotate file_exists
            if c.storage_path:
                c.file_exists = os.path.isfile(_resolve_path(c.storage_path))
            else:
                c.file_exists = False
            unique_variations.append(c)
        if len(unique_variations) >= 5:
            break

    return list(reversed(unique_variations))

@router.get("/{video_id}/status")
def get_video_status(
    video_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Returns a detailed pipeline status for the frontend progress UI."""
    db_video = get_user_video(video_id, current_user.id, db)

    variations = [c for c in db_video.clips if c.title and "Master Variation" in c.title]
    completed_variations = [c for c in variations if c.status and c.status.value == "completed"]

    TOTAL_VARIATIONS = 5

    # Check if the source video file physically exists on the server disk
    video_file_missing = False
    if db_video.storage_path:
        actual_path = db_video.storage_path if os.path.isabs(db_video.storage_path) else os.path.join(UPLOAD_DIR, os.path.basename(db_video.storage_path))
        if not os.path.exists(actual_path):
            video_file_missing = True

    if video_file_missing and db_video.status and db_video.status.value in ["processing", "pending"]:
        db_video.status = models.VideoStatus.FAILED
        db.commit()
        return {
            "video_id": video_id,
            "original_filename": db_video.original_filename or f"Video {video_id}",
            "stage": "failed",
            "stage_label": "Source video file is missing on the server disk. Please re-upload.",
            "video_status": "failed",
            "transcription_status": "failed",
            "analysis_status": "failed",
            "highlight_status": "failed",
            "crop_status": "failed",
            "variations_ready": 0,
            "variations_total": TOTAL_VARIATIONS,
            "is_done": False,
            "is_complete": False,
            "file_missing": True
        }

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
            from app.core.config import settings
            has_groq = bool((settings.GROQ_API_KEY or os.environ.get("GROQ_API_KEY", "")).strip())
            if has_groq:
                engine = "Groq Cloud Whisper"
            elif transcription_service.use_google and not transcription_service._google_quota_exhausted:
                engine = "Google STT"
            else:
                engine = "Local Whisper"
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
def cancel_all_generations(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Cancels all active video generation tasks for the current user."""
    try:
        from app.services.master_agent import cancel_all_video_jobs
        cancel_all_video_jobs()
    except Exception as e:
        logger.warning(f"Error registering cancel all: {e}")

    active_videos = db.query(models.Video).join(models.Project).filter(
        models.Project.owner_id == current_user.id,
        models.Video.status.in_([models.VideoStatus.PROCESSING, models.VideoStatus.PENDING])
    ).all()

    # Revoke all Celery tasks across all workers and queues for these videos
    try:
        from app.core.celery_app import celery_app
        i = celery_app.control.inspect()
        if i:
            user_video_ids = {v.id for v in active_videos}
            for fetcher in [i.active, i.reserved, i.scheduled]:
                try:
                    tasks_dict = fetcher() if fetcher else None
                    if tasks_dict:
                        for worker, tasks in tasks_dict.items():
                            for t in tasks:
                                if t.get('args') and len(t['args']) > 0 and t['args'][0] in user_video_ids:
                                    celery_app.control.revoke(t['id'], terminate=True, signal='SIGKILL')
                                    logger.info(f"Revoked Celery task {t['id']}")
                except Exception as e:
                    logger.warning(f"Error inspecting/revoking tasks: {e}")
    except Exception as e:
        logger.warning(f"Error revoking all Celery tasks: {e}")

    # Mark currently processing or pending videos as FAILED
    for v in active_videos:
        v.status = models.VideoStatus.FAILED
        v.transcription_status = models.TranscriptionStatus.NONE
        v.analysis_status = models.ContentAnalysisStatus.NONE
        v.highlight_status = models.HighlightDetectionStatus.NONE
        v.crop_status = models.CropStatus.NONE

    db.commit()
    return {"success": True, "cancelled_count": len(active_videos), "message": "All active generations cancelled."}


@router.post("/{video_id}/cancel-generation")
def cancel_generation(
    video_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Cancels active video generation and revokes background Celery tasks."""
    db_video = get_user_video(video_id, current_user.id, db)

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
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_clip = get_user_clip(clip_id, current_user.id, db)

    db_clip.title = clip_in.title
    db_clip.start_time = clip_in.start_time
    db_clip.end_time = clip_in.end_time
    db_clip.duration = clip_in.end_time - clip_in.start_time
    db_clip.status = models.ClipStatus.PENDING
    db_clip.edit_options = clip_in.edit_options

    db.commit()
    db.refresh(db_clip)

    from app.tasks.video_tasks import render_clip_task
    dispatch_task(render_clip_task, db_clip.id)

    return db_clip


@router.delete("/clips/{clip_id}")
def delete_clip(
    clip_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Delete a single generated clip / variation and its media file."""
    db_clip = get_user_clip(clip_id, current_user.id, db)
    if db_clip.storage_path:
        try:
            resolved = _resolve_path(db_clip.storage_path)
            if os.path.isfile(resolved):
                os.remove(resolved)
        except Exception as e:
            logger.warning(f"Could not remove clip file {db_clip.storage_path}: {e}")
    db.delete(db_clip)
    db.commit()
    return {"message": "Clip deleted successfully", "clip_id": clip_id}


@router.delete("/{video_id}")
def delete_video(
    video_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_video = get_user_video(video_id, current_user.id, db)

    _remove_safe(db_video.storage_path)
    _remove_safe(db_video.audio_path)
    if db_video.storage_path:
        base_name = os.path.splitext(os.path.basename(db_video.storage_path))[0]
        _remove_safe(os.path.join(str(_BACKEND_DIR), "uploads", base_name))
    if db_video.frame_directory:
        try:
            shutil.rmtree(_resolve_path(db_video.frame_directory), ignore_errors=True)
        except Exception:
            pass
    for clip in db_video.clips:
        _remove_safe(clip.storage_path)

    db.delete(db_video)
    db.commit()
    return {"message": "Video deleted successfully", "video_id": video_id}

from pydantic import BaseModel
import threading

class TranslateTranscriptRequest(BaseModel):
    words: list[dict]
    target_lang: str

_TRANSCRIPT_TRANSLATION_CACHE = {}
_TRANSLATION_PROGRESS_LOCK = threading.Lock()
_TRANSLATION_PROGRESS_EVENTS = {}

@router.post("/translate-transcript")
def translate_transcript(
    request: TranslateTranscriptRequest,
    current_user: models.User = Depends(get_current_user)
):
    if not request.words:
        return []
    target = (request.target_lang or "").strip().lower()
    if target in ["", "none", "original"]:
        return request.words

    # Cache key based on target language, word count, and sample word content
    first_w = request.words[0].get("text", "") if len(request.words) > 0 else ""
    last_w = request.words[-1].get("text", "") if len(request.words) > 0 else ""
    cache_key = f"{target}_{len(request.words)}_{first_w}_{last_w}"

    with _TRANSLATION_PROGRESS_LOCK:
        if cache_key in _TRANSCRIPT_TRANSLATION_CACHE:
            return _TRANSCRIPT_TRANSLATION_CACHE[cache_key]
        if cache_key in _TRANSLATION_PROGRESS_EVENTS:
            event = _TRANSLATION_PROGRESS_EVENTS[cache_key]
            wait_for_existing = True
        else:
            event = threading.Event()
            _TRANSLATION_PROGRESS_EVENTS[cache_key] = event
            wait_for_existing = False

    if wait_for_existing:
        event.wait(timeout=30)
        return _TRANSCRIPT_TRANSLATION_CACHE.get(cache_key, request.words)

    from app.services.translation_service import translate_and_distribute_words
    try:
        translated = translate_and_distribute_words(request.words, request.target_lang)
        if translated:
            _TRANSCRIPT_TRANSLATION_CACHE[cache_key] = translated
        return translated or request.words
    except Exception as e:
        logger.error(f"Error in translate_transcript: {e}", exc_info=True)
        return request.words
    finally:
        with _TRANSLATION_PROGRESS_LOCK:
            event.set()
            _TRANSLATION_PROGRESS_EVENTS.pop(cache_key, None)

@router.get("/clips/{clip_id}", response_model=schemas.Clip)
def read_clip(
    clip_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_clip = get_user_clip(clip_id, current_user.id, db)
    return db_clip

@router.post("/clips/{clip_id}/publish")
def publish_clip(
    clip_id: int,
    request: schemas.ClipPublishRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_clip = get_user_clip(clip_id, current_user.id, db)

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
    dispatch_task(publish_video_task, db_clip.id, request.dict())
    return {"message": "Publishing task triggered", "task_id": db_clip.id}
