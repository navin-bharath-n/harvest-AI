"""
API endpoints for local video templates.
Provides local previews and details for templates in the repository's Templates/ folder.
"""

from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from app.services.template_service import template_service
from app.api import deps
from app.models.user import User

router = APIRouter()


@router.get("/", response_model=List[Dict[str, Any]])
def get_templates(
    current_user: User = Depends(deps.get_current_user_optional),
):
    """
    List all available video outro templates stored in the local Templates/ directory.
    """
    try:
        return template_service.list_templates()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch templates: {str(e)}"
        )


@router.get("/{template_id}", response_model=Dict[str, Any])
def get_template(
    template_id: str,
    current_user: User = Depends(deps.get_current_user_optional),
):
    """
    Get a single template backed by local files.
    """
    template = template_service.get_template(template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template '{template_id}' not found"
        )
    return template


@router.get("/{template_id}/media")
def get_template_media(
    template_id: str,
    current_user: User = Depends(deps.get_current_user_optional),
):
    """Serve a normalized local MP4 preview for a catalogued template."""
    media_path = template_service.get_local_template_video_path(template_id)
    if not media_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Local template media not found")
    return FileResponse(media_path, media_type="video/mp4")


@router.get("/{template_id}/thumbnail")
def get_template_thumbnail(
    template_id: str,
    current_user: User = Depends(deps.get_current_user_optional),
):
    """Serve a locally generated thumbnail for a catalogued template."""
    thumbnail_path = template_service.get_local_template_thumbnail_path(template_id)
    if not thumbnail_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Local template thumbnail not found")
    return FileResponse(thumbnail_path, media_type="image/jpeg")
