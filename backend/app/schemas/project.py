from typing import Optional, List, Any
from pydantic import BaseModel, model_validator, computed_field
from datetime import datetime
from .video import Video

class ProjectBase(BaseModel):
    title: str
    description: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def accept_name_or_title(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "name" in data and not data.get("title"):
                data["title"] = data["name"]
        return data

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

    @computed_field
    @property
    def name(self) -> str:
        return self.title

    class Config:
        from_attributes = True
