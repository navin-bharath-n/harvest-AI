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
    
    SECRET_KEY: Optional[str] = None
    FRONTEND_ORIGIN: Optional[str] = None
    AUTO_START_CELERY: bool = True
    AUTO_START_OLLAMA: bool = True

    QWEN_API_KEY: Optional[str] = None

    DATABASE_URI: Optional[str] = None

    # Music & Audio APIs
    AUDIUS_API_BASE: str = "https://api.audius.co"
    AUDIUS_APP_NAME: str = "HARVEST_AI"
    JAMENDO_CLIENT_ID: Optional[str] = None
    FREESOUND_API_KEY: Optional[str] = None
    PIXABAY_API_KEY: Optional[str] = None

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
        if self.DATABASE_URI and self.DATABASE_URI.strip():
            return self.DATABASE_URI.strip()
        return _DEFAULT_DB_PATH
    
    model_config = SettingsConfigDict(
        env_file=_os.path.join(_os.path.dirname(__file__), "..", "..", ".env"), 
        case_sensitive=True, 
        extra="ignore"
    )

settings = Settings()
