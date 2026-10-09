from typing import Literal, Optional
from pydantic import BaseModel, Field
from datetime import datetime
from app.models.video import VideoStatus, TranscriptionStatus, ContentAnalysisStatus, HighlightDetectionStatus, CropStatus

class VideoBase(BaseModel):
    original_filename: str

class VideoCreate(VideoBase):
    storage_path: str
    project_id: int

class VideoUpdate(BaseModel):
    status: Optional[VideoStatus] = None

class VideoImportUrlRequest(BaseModel):
    project_id: int
    url: str
    auto_analyze: bool = False
    length: float = Field(default=30.0, ge=10.0, le=60.0, description="Target maximum duration for suggested moments if auto_analyze is true")

class SmartCropRequest(BaseModel):
    target_fps: int = 1

class MasterGenerateRequest(BaseModel):
    length: float = Field(default=60.0, ge=10.0, le=60.0, description="Target duration for Shorts (max 60s / 1 min)")
    platform: str = "youtube"
    optional_prompt: str = ""
    audio_theme: Optional[str] = "auto"
    translate_language: Optional[str] = "none"
    dub_voice: Optional[bool] = False
    caption_language: Optional[str] = "translated"
    dub_mix_mode: Optional[str] = "replace"
    speaker_gender: Optional[str] = "female"
    framing_mode: Optional[str] = "fit_blur"
    caption_style: Optional[str] = "pop"

class ClipBrandingRequest(BaseModel):
    watermark_path: Optional[str] = None
    watermark_position: Optional[str] = "top-right"
    watermark_scale: Optional[float] = 0.16
    watermark_opacity: Optional[float] = 0.85
    watermark_mode: Optional[str] = "always"
    header_image_path: Optional[str] = None
    header_height: Optional[int] = 160
    footer_image_path: Optional[str] = None
    footer_height: Optional[int] = 180
    footer_position: Optional[str] = "bottom"
    thumbnail_path: Optional[str] = None
    template_id: Optional[str] = None
    template_storage_path: Optional[str] = None
    enable_outro: Optional[bool] = False
    outro_like_text: Optional[str] = "Like"
    outro_comment_text: Optional[str] = "Comment"
    outro_subscribe_text: Optional[str] = "Subscribe"
    outro_follow_text: Optional[str] = ""
    outro_custom_text: Optional[str] = ""
    outro_duration: Optional[float] = 3.0
    outro_music_style: Optional[str] = "upbeat"

class ClipPublishRequest(BaseModel):
    platforms: list[str]
    title: Optional[str] = None
    description: Optional[str] = None
    privacy: Optional[str] = "public"
    platform_configs: Optional[dict] = None
    thumbnail_path: Optional[str] = None
    branding_config: Optional[dict] = None


class ClipCreate(BaseModel):
    title: Optional[str] = None
    start_time: float
    end_time: float
    edit_options: Optional[dict] = None

class SelectMomentRequest(BaseModel):
    moment_id: int = Field(ge=0, le=4)
    caption_style: Literal["pop", "karaoke", "minimalist", "boxed", "neon", "standard", "none"] = "pop"
    translate_language: str = Field(default="none", min_length=2, max_length=64)
    caption_language: Literal["original", "translated", "none"] = "original"
    dub_voice: bool = False
    speaker_gender: Literal["female", "male"] = "female"
    audio_mode: Literal["original", "mix", "replace"] = "original"
    custom_audio_path: Optional[str] = None
    music_preset: Optional[str] = "none"
    music_volume: Optional[float] = 0.18
    cta_template: Optional[Literal["youtube", "instagram", "tiktok", "minimal", "none"]] = "none"
    cta_text: Optional[str] = ""
    cta_placement: Optional[Literal["outro", "overlay"]] = "outro"
    enable_outro: Optional[bool] = False
    outro_like_text: Optional[str] = "Like"
    outro_comment_text: Optional[str] = "Comment"
    outro_subscribe_text: Optional[str] = "Subscribe"
    outro_follow_text: Optional[str] = ""
    outro_custom_text: Optional[str] = ""
    outro_duration: Optional[float] = 3.0
    outro_music_style: Optional[str] = "upbeat"
    template_id: Optional[str] = None
    template_storage_path: Optional[str] = None
    watermark_path: Optional[str] = None
    watermark_position: Optional[str] = "header"
    watermark_scale: Optional[float] = 0.20
    watermark_opacity: Optional[float] = 0.90
    watermark_mode: Optional[str] = "interval_2s"
    header_image_path: Optional[str] = None
    header_height: Optional[int] = 160
    footer_image_path: Optional[str] = None
    footer_height: Optional[int] = 180
    thumbnail_path: Optional[str] = None

class HighlightAnalysisRequest(BaseModel):
    length: float = Field(default=30.0, ge=10.0, le=60.0, description="Target maximum duration for suggested moments")

class CaptionStyleUpdate(BaseModel):
    caption_style: Literal["pop", "karaoke", "minimalist", "boxed", "neon", "standard", "none"]

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
    published_urls: Optional[dict] = None
    file_exists: Optional[bool] = True
    
    class Config:
        from_attributes = True

class Video(VideoBase):
    id: int
    storage_path: str
    status: Optional[VideoStatus] = None
    
    # Metadata fields
    duration: Optional[float] = None
    resolution: Optional[str] = None
    fps: Optional[float] = None
    bitrate: Optional[str] = None
    audio_path: Optional[str] = None
    frame_directory: Optional[str] = None
    short_path: Optional[str] = None
    
    # Transcription fields
    transcription_status: Optional[TranscriptionStatus] = None
    transcript: Optional[list] = None
    
    # Content Understanding fields
    analysis_status: Optional[ContentAnalysisStatus] = None
    content_analysis: Optional[dict] = None
    
    # Highlight Detection fields
    highlight_status: Optional[HighlightDetectionStatus] = None
    highlights: Optional[dict] = None
    
    # Smart Cropping fields
    crop_status: Optional[CropStatus] = None
    crop_metadata: Optional[dict] = None

    project_id: int
    clips: list[Clip] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
