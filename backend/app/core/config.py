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
    # Number of independent background jobs a worker may run at once. Keep this
    # conservative because video/ML jobs can use substantial RAM and CPU.
    CELERY_CONCURRENCY: int = 1

    GROQ_API_KEY: Optional[str] = None
    QWEN_API_KEY: Optional[str] = None

    DATABASE_URI: Optional[str] = None
    DATABASE_URL: Optional[str] = None

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

    # Backblaze B2 S3-compatible object storage (optional; local disk when unset).
    # STORAGE_BACKEND=auto keeps legacy behavior; set to r2 to store new uploads in R2.
    STORAGE_BACKEND: str = "auto"
    R2_ACCOUNT_ID: Optional[str] = None
    R2_ENDPOINT_URL: Optional[str] = None
    R2_REGION: str = "auto"
    R2_BUCKET: Optional[str] = None
    R2_ACCESS_KEY_ID: Optional[str] = None
    R2_SECRET_ACCESS_KEY: Optional[str] = None
    STORAGE_PRESIGNED_URL_TTL: int = 3600

    B2_ENDPOINT_URL: Optional[str] = None
    B2_REGION: str = "us-east-005"
    B2_BUCKET: Optional[str] = None
    B2_KEY_ID: Optional[str] = None
    B2_APPLICATION_KEY: Optional[str] = None
    B2_PRESIGNED_URL_TTL: int = 3600

    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    GOOGLE_REDIRECT_URI: str = "https://localhost:8000/api/v1/users/auth/youtube/callback"
    META_APP_ID: Optional[str] = None
    META_APP_SECRET: Optional[str] = None
    META_REDIRECT_URI: str = "https://localhost:8000/api/v1/users/auth/facebook/callback"
    INSTAGRAM_REDIRECT_URI: str = "https://localhost:8000/api/v1/users/auth/instagram/callback"

    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        db_conn = self.DATABASE_URI or self.DATABASE_URL
        if db_conn and db_conn.strip():
            uri = db_conn.strip()
            if uri.startswith("postgres://"):
                uri = uri.replace("postgres://", "postgresql://", 1)
            # Ensure Neon Serverless PostgreSQL has sslmode=require
            if "neon.tech" in uri and "sslmode" not in uri:
                delimiter = "&" if "?" in uri else "?"
                uri = f"{uri}{delimiter}sslmode=require"
            # Auto driver detection: if psycopg is unavailable, fallback to psycopg2 driver
            if uri.startswith("postgresql://") and not uri.startswith("postgresql+"):
                try:
                    import psycopg  # noqa: F401
                except ImportError:
                    try:
                        import psycopg2  # noqa: F401
                        uri = uri.replace("postgresql://", "postgresql+psycopg2://", 1)
                    except ImportError:
                        pass
            return uri
        return _DEFAULT_DB_PATH
    
    model_config = SettingsConfigDict(
        env_file=_os.path.join(_os.path.dirname(__file__), "..", "..", ".env"), 
        case_sensitive=True, 
        extra="ignore"
    )

settings = Settings()
