import os as _os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

# Compute an absolute path to the DB file anchored to THIS file's location.
# This never changes regardless of which directory uvicorn or celery is run from.
_BACKEND_DIR = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), "..", ".."))
_DEFAULT_DB_PATH = f"sqlite:///{_os.path.join(_BACKEND_DIR, 'aishorts.db').replace(chr(92), '/')}"

class Settings(BaseSettings):
    PROJECT_NAME: str = "AI Shorts Generator"
    API_V1_STR: str = "/api/v1"
    
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"
    
    QWEN_API_KEY: Optional[str] = None

    DATABASE_URI: str = _DEFAULT_DB_PATH

    YOUTUBE_ACCESS_TOKEN: Optional[str] = None
    FACEBOOK_ACCESS_TOKEN: Optional[str] = None
    FACEBOOK_PAGE_ID: Optional[str] = None
    INSTAGRAM_ACCESS_TOKEN: Optional[str] = None
    INSTAGRAM_BUSINESS_ID: Optional[str] = None
    PUBLIC_VIDEO_URL: Optional[str] = None

    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    GOOGLE_REDIRECT_URI: str = "https://localhost:8000/api/v1/users/auth/youtube/callback"
    META_APP_ID: Optional[str] = None
    META_APP_SECRET: Optional[str] = None
    META_REDIRECT_URI: str = "https://localhost:8000/api/v1/users/auth/facebook/callback"
    INSTAGRAM_REDIRECT_URI: str = "https://localhost:8000/api/v1/users/auth/instagram/callback"

    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        return self.DATABASE_URI
    
    model_config = SettingsConfigDict(
        env_file=_os.path.join(_os.path.dirname(__file__), "..", "..", ".env"), 
        case_sensitive=True, 
        extra="ignore"
    )

settings = Settings()
# Trigger settings reload
