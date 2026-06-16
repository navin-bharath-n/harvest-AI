import enum
from sqlalchemy import Column, Integer, String, Enum, ForeignKey, DateTime, Float, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base

class VideoStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class TranscriptionStatus(str, enum.Enum):
    NONE = "none"
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class ContentAnalysisStatus(str, enum.Enum):
    NONE = "none"
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class HighlightDetectionStatus(str, enum.Enum):
    NONE = "none"
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class CropStatus(str, enum.Enum):
    NONE = "none"
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class ClipStatus(str, enum.Enum):
    PENDING = "pending"
    RENDERING = "rendering"
    COMPLETED = "completed"
    FAILED = "failed"

class Video(Base):
    __tablename__ = "videos"

    id = Column(Integer, primary_key=True, index=True)
    original_filename = Column(String, nullable=False)
    storage_path = Column(String, nullable=False)
    status = Column(Enum(VideoStatus), default=VideoStatus.PENDING)
    
    # Metadata fields
    duration = Column(Float, nullable=True)
    resolution = Column(String, nullable=True)
    fps = Column(Float, nullable=True)
    bitrate = Column(String, nullable=True)
    audio_path = Column(String, nullable=True)
    frame_directory = Column(String, nullable=True)
    short_path = Column(String, nullable=True)
    
    # Transcription fields
    transcription_status = Column(Enum(TranscriptionStatus), default=TranscriptionStatus.NONE)
    transcript = Column(JSON, nullable=True)
    
    # Content Understanding fields
    analysis_status = Column(Enum(ContentAnalysisStatus), default=ContentAnalysisStatus.NONE)
    content_analysis = Column(JSON, nullable=True)
    
    # Highlight Detection fields
    highlight_status = Column(Enum(HighlightDetectionStatus), default=HighlightDetectionStatus.NONE)
    highlights = Column(JSON, nullable=True)
    
    # Smart Cropping fields
    crop_status = Column(Enum(CropStatus), default=CropStatus.NONE)
    crop_metadata = Column(JSON, nullable=True)

    project_id = Column(Integer, ForeignKey("projects.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    project = relationship("Project", back_populates="videos")
    clips = relationship("Clip", back_populates="video", cascade="all, delete-orphan")

class Clip(Base):
    __tablename__ = "clips"

    id = Column(Integer, primary_key=True, index=True)
    video_id = Column(Integer, ForeignKey("videos.id"))
    
    title = Column(String, nullable=True)
    start_time = Column(Float, nullable=False)
    end_time = Column(Float, nullable=False)
    duration = Column(Float, nullable=False)
    
    status = Column(Enum(ClipStatus), default=ClipStatus.PENDING)
    storage_path = Column(String, nullable=True) # the final MP4 path
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    edit_options = Column(JSON, nullable=True)
    
    video = relationship("Video", back_populates="clips")
