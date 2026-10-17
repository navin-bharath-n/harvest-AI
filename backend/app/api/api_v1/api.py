from fastapi import APIRouter
from .endpoints import health, users, projects, videos, templates, video_check, smart_links, formats

api_router = APIRouter()
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(videos.router, prefix="/videos", tags=["videos"])
api_router.include_router(templates.router, prefix="/templates", tags=["templates"])
api_router.include_router(video_check.router, prefix="/video-check", tags=["video-check"])
api_router.include_router(smart_links.router, prefix="/smart-links", tags=["smart-links"])
api_router.include_router(formats.router, prefix="/formats", tags=["formats"])


