from typing import Optional
from pydantic import BaseModel
from datetime import datetime
from app.models.video import VideoStatus, TranscriptionStatus, ContentAnalysisStatus, HighlightDetectionStatus, CropStatus

class VideoBase(BaseModel):
    original_filename: str

class VideoCreate(VideoBase):
    storage_path: str
    project_id: int

class VideoUpdate(BaseModel):
    status: Optional[VideoStatus] = None

class SmartCropRequest(BaseModel):
    target_fps: int = 5

class MasterGenerateRequest(BaseModel):
    length: float = 60.0
    platform: str = "youtube"
    optional_prompt: str = ""
    translate_language: Optional[str] = "none"
    dub_voice: Optional[bool] = False
    caption_language: Optional[str] = "translated"
    dub_mix_mode: Optional[str] = "replace"

class ClipPublishRequest(BaseModel):
    platforms: list[str]
    title: Optional[str] = None
    description: Optional[str] = None
    privacy: Optional[str] = "public"
    platform_configs: Optional[dict] = None

class ClipCreate(BaseModel):
    title: Optional[str] = None
    start_time: float
    end_time: float
    edit_options: Optional[dict] = None

class Clip(BaseModel):
    id: int
    video_id: int
    title: Optional[str] = None
    start_time: float
    end_time: float
    duration: float
    status: str
    storage_path: Optional[str] = None
    created_at: Optional[datetime] = None
    edit_options: Optional[dict] = None
    
    class Config:
        from_attributes = True

class Video(VideoBase):
    id: int
    storage_path: str
    status: VideoStatus
    
    # Metadata fields
    duration: Optional[float] = None
    resolution: Optional[str] = None
    fps: Optional[float] = None
    bitrate: Optional[str] = None
    audio_path: Optional[str] = None
    frame_directory: Optional[str] = None
    short_path: Optional[str] = None
    
    # Transcription fields
    transcription_status: TranscriptionStatus
    transcript: Optional[list] = None
    
    # Content Understanding fields
    analysis_status: ContentAnalysisStatus
    content_analysis: Optional[dict] = None
    
    # Highlight Detection fields
    highlight_status: HighlightDetectionStatus
    highlights: Optional[dict] = None
    
    # Smart Cropping fields
    crop_status: CropStatus
    crop_metadata: Optional[dict] = None

    project_id: int
    clips: list[Clip] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
