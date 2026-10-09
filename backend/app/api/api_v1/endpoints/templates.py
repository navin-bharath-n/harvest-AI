"""
API endpoints for Cloudflare R2 Video Templates.
Provides listing of available templates with signed Cloudflare R2 URLs
and details for previewing and applying to projects.
"""

from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from app.services.template_service import template_service
from app.api import deps
from app.models.user import User

router = APIRouter()


@router.get("/", response_model=List[Dict[str, Any]])
def get_templates(
    current_user: User = Depends(deps.get_current_user_optional),
):
    """
    List all available video outro templates stored in Cloudflare R2.
    Returns signed streaming URLs and thumbnail URLs for browser preview.
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
    Get a single template with signed Cloudflare R2 URLs.
    """
    template = template_service.get_template(template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template '{template_id}' not found"
        )
    return template


@router.post("/sync")
def sync_templates(
    force: bool = False,
    current_user: User = Depends(deps.get_current_user),
):
    """
    Synchronizes local templates to Cloudflare R2 bucket.
    """
    try:
        return template_service.sync_templates_to_r2(force=force)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Template sync failed: {str(e)}"
        )
