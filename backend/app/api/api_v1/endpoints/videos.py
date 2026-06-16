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

    # Save file
    file_ext = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Create DB record
    db_video = models.Video(
        original_filename=file.filename,
        storage_path=file_path,
        project_id=project_id,
        status=models.VideoStatus.PENDING
    )
    db.add(db_video)
    db.commit()
    db.refresh(db_video)

    # Trigger Celery task
    process_video_task.apply_async(args=[db_video.id], queue='aishorts-queue')

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
        
    return db_video.clips

@router.post("/{video_id}/master-generate", response_model=schemas.Video)
def generate_master_shorts(
    video_id: int,
    request: schemas.MasterGenerateRequest,
    db: Session = Depends(get_db)
):
    db_video = db.query(models.Video).filter(models.Video.id == video_id).first()
    if not db_video:
        raise HTTPException(status_code=404, detail="Video not found")
        
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
            request.dub_mix_mode
        ], 
        queue='aishorts-queue'
    )
    
    return db_video

@router.get("/{video_id}/variations", response_model=list[schemas.Clip])
def get_master_variations(
    video_id: int, 
    db: Session = Depends(get_db)
):
    # Just returns clips that have "Master Variation" in the title
    db_video = db.query(models.Video).filter(models.Video.id == video_id).first()
    if not db_video:
        raise HTTPException(status_code=404, detail="Video not found")
        
    variations = [clip for clip in db_video.clips if clip.title and "Master Variation" in clip.title]
    return variations

@router.get("/{video_id}/status")
def get_video_status(video_id: int, db: Session = Depends(get_db)):
    """Returns a detailed pipeline status for the frontend progress UI."""
    db_video = db.query(models.Video).filter(models.Video.id == video_id).first()
    if not db_video:
        raise HTTPException(status_code=404, detail="Video not found")

    variations = [c for c in db_video.clips if c.title and "Master Variation" in c.title]
    completed_variations = [c for c in variations if c.status and c.status.value == "completed"]

    # Determine which pipeline stage is active
    stage = "idle"
    stage_label = "Waiting..."
    if db_video.status and db_video.status.value == "processing":
        stage = "processing"; stage_label = "📦 Extracting video metadata..."
    elif db_video.status and db_video.status.value == "completed":
        if db_video.transcription_status and db_video.transcription_status.value == "processing":
            stage = "transcribing"; stage_label = "🎙️ Transcribing audio (Whisper)..."
        elif db_video.analysis_status and db_video.analysis_status.value == "processing":
            stage = "analyzing"; stage_label = "🧠 AI content analysis (Ollama)..."
        elif len(variations) == 0:
            stage = "generating"; stage_label = "🎬 Running Master AI Agent..."
        elif len(completed_variations) < 1:
            stage = "rendering"; stage_label = f"✂️ Rendering variations ({len(completed_variations)}/1 done)..."
        else:
            stage = "done"; stage_label = "✅ Variation ready!"

    return {
        "video_id": video_id,
        "stage": stage,
        "stage_label": stage_label,
        "video_status": db_video.status.value if db_video.status else "pending",
        "transcription_status": db_video.transcription_status.value if db_video.transcription_status else "none",
        "analysis_status": db_video.analysis_status.value if db_video.analysis_status else "none",
        "variations_ready": len(completed_variations),
        "variations_total": 1,
        "is_done": len(completed_variations) >= 1,
    }

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

@router.post("/clips/{clip_id}/publish")
def publish_clip(
    clip_id: int,
    publish_in: schemas.ClipPublishRequest,
    db: Session = Depends(get_db)
):
    db_clip = db.query(models.Clip).filter(models.Clip.id == clip_id).first()
    if not db_clip:
        raise HTTPException(status_code=404, detail="Clip not found")

    from app.tasks.video_tasks import publish_video_task
    task_res = publish_video_task.apply_async(
        args=[db_clip.id, publish_in.dict()],
        queue='aishorts-queue'
    )
    
    return {"message": "Publishing task triggered successfully", "task_id": task_res.id}

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
