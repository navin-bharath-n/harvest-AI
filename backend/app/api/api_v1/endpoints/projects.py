from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.api.deps import get_current_user
from app import models, schemas

router = APIRouter()

@router.post("/", response_model=schemas.Project)
def create_project(
    project: schemas.ProjectCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    project_data = project.model_dump()
    project_data["owner_id"] = current_user.id
    db_project = models.Project(**project_data)
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project

@router.get("/", response_model=List[schemas.Project])
def read_projects(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    projects = (
        db.query(models.Project)
        .filter(models.Project.owner_id == current_user.id)
        .offset(skip)
        .limit(limit)
        .all()
    )
    return projects

@router.get("/{project_id}", response_model=schemas.Project)
def read_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_project = (
        db.query(models.Project)
        .filter(models.Project.id == project_id, models.Project.owner_id == current_user.id)
        .first()
    )
    if db_project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return db_project

import os
import shutil
import logging
from pathlib import Path

logger = logging.getLogger(__name__)
_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent

def _remove_media_item(path_str: str):
    if not path_str:
        return
    candidates = [
        path_str,
        os.path.join(str(_BACKEND_DIR), path_str.replace("\\", "/").lstrip("/")),
        os.path.join(str(_BACKEND_DIR), "uploads", os.path.basename(path_str)),
        os.path.join(str(_BACKEND_DIR), "uploads", "clips", os.path.basename(path_str)),
    ]
    for c in candidates:
        try:
            if os.path.isfile(c):
                os.remove(c)
                break
            elif os.path.isdir(c):
                shutil.rmtree(c, ignore_errors=True)
                break
        except Exception as e:
            logger.warning(f"Error removing media path {c}: {e}")

@router.delete("/{project_id}")
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_project = (
        db.query(models.Project)
        .filter(models.Project.id == project_id, models.Project.owner_id == current_user.id)
        .first()
    )
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")

    for video in db_project.videos:
        _remove_media_item(video.storage_path)
        _remove_media_item(video.audio_path)
        _remove_media_item(video.frame_directory)
        if video.storage_path:
            base_name = os.path.splitext(os.path.basename(video.storage_path))[0]
            _remove_media_item(os.path.join(str(_BACKEND_DIR), "uploads", base_name))
        for clip in video.clips:
            _remove_media_item(clip.storage_path)

    db.delete(db_project)
    db.commit()
    return {"message": "Project deleted successfully", "project_id": project_id}

