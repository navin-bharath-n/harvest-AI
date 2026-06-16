from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app import models, schemas

router = APIRouter()

@router.post("/", response_model=schemas.Project)
def create_project(project: schemas.ProjectCreate, db: Session = Depends(get_db)):
    db_project = models.Project(**project.model_dump())
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project

@router.get("/", response_model=List[schemas.Project])
def read_projects(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    projects = db.query(models.Project).offset(skip).limit(limit).all()
    return projects

@router.get("/{project_id}", response_model=schemas.Project)
def read_project(project_id: int, db: Session = Depends(get_db)):
    db_project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if db_project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return db_project

import os
import shutil

@router.delete("/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    db_project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    for video in db_project.videos:
        if video.storage_path and os.path.exists(video.storage_path):
            try:
                os.remove(video.storage_path)
            except Exception as e:
                print(f"Error removing storage_path {video.storage_path}: {e}")
        if video.audio_path and os.path.exists(video.audio_path):
            try:
                os.remove(video.audio_path)
            except Exception as e:
                print(f"Error removing audio_path {video.audio_path}: {e}")
        if video.frame_directory and os.path.exists(video.frame_directory):
            try:
                shutil.rmtree(video.frame_directory, ignore_errors=True)
            except Exception as e:
                print(f"Error removing frame_directory {video.frame_directory}: {e}")
        for clip in video.clips:
            if clip.storage_path and os.path.exists(clip.storage_path):
                try:
                    os.remove(clip.storage_path)
                except Exception as e:
                    print(f"Error removing clip storage_path {clip.storage_path}: {e}")
                    
    db.delete(db_project)
    db.commit()
    return {"message": "Project deleted successfully"}
