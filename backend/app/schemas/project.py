from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime
from .video import Video

class ProjectBase(BaseModel):
    title: str
    description: Optional[str] = None

class ProjectCreate(ProjectBase):
    owner_id: int = 1  # Default to user 1 for single-user local app

class ProjectUpdate(ProjectBase):
    pass

class Project(ProjectBase):
    id: int
    owner_id: int
    created_at: datetime
    updated_at: datetime
    videos: List[Video] = []

    class Config:
        from_attributes = True
