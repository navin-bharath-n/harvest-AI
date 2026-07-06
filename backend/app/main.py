import sys
import os
import subprocess
import socket
import logging
from contextlib import asynccontextmanager

# Force python to recognize the parent directory so 'import app...' works from anywhere
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.database import engine, Base
from app.api.api_v1.api import api_router
from app.core.config import settings
from app.core.logging import setup_logging
# Import all models so SQLAlchemy can create tables
from app import models
from fastapi.staticfiles import StaticFiles
from starlette.requests import Request
from starlette.responses import JSONResponse
import traceback

# Setup logging
setup_logging()
logger = logging.getLogger(__name__)

def auto_migrate_database(engine):
    from sqlalchemy import inspect, text
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        
        # Import all models to inspect them
        from app.models.user import User
        from app.models.project import Project
        from app.models.video import Video, Clip
        from app.models.social_connection import SocialConnection
        
        model_classes = [User, Project, Video, Clip, SocialConnection]
        
        with engine.begin() as conn:
            for model_cls in model_classes:
                table_name = model_cls.__tablename__
                if table_name not in tables:
                    continue
                
                # Get existing columns in database table
                existing_cols = {col["name"].lower() for col in inspector.get_columns(table_name)}
                
                # Check columns defined in SQLAlchemy model
                for col in model_cls.__table__.columns:
                    col_name = col.name
                    if col_name.lower() not in existing_cols:
                        logger.info(f"Migrating database: adding column '{col_name}' to table '{table_name}'...")
                        
                        # Map SQLAlchemy type to SQLite type
                        from sqlalchemy import Integer, Float, DateTime, JSON, Boolean
                        col_type = col.type
                        if isinstance(col_type, Integer):
                            type_str = "INTEGER"
                        elif isinstance(col_type, Float):
                            type_str = "REAL"
                        elif isinstance(col_type, DateTime):
                            type_str = "TIMESTAMP"
                        elif isinstance(col_type, JSON):
                            type_str = "JSON"
                        elif isinstance(col_type, Boolean):
                            type_str = "BOOLEAN"
                        else:
                            type_str = "TEXT"
                            
                        alter_query = f"ALTER TABLE {table_name} ADD COLUMN {col_name} {type_str}"
                        conn.execute(text(alter_query))
                        logger.info(f"Column '{col_name}' successfully added to table '{table_name}'.")
    except Exception as e:
        logger.warning(f"Auto-database migration failed: {e}", exc_info=True)

def seed_default_user_and_project(engine):
    from sqlalchemy.orm import sessionmaker
    from app.models.user import User
    from app.models.project import Project
    
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        # Check if default user exists
        default_user = db.query(User).filter(User.id == 1).first()
        if not default_user:
            # Check if email is already taken (to avoid unique constraint violation if id is different)
            email_user = db.query(User).filter(User.email == "user1@harvest.ai").first()
            if email_user:
                default_user = email_user
            else:
                logger.info("Seeding default user...")
                default_user = User(
                    id=1,
                    email="user1@harvest.ai",
                    full_name="Default User",
                    hashed_password="fakehashedpassword", # not used since oauth/auth is removed
                    is_active=True
                )
                db.add(default_user)
                db.flush() # get the id if generated or assigned
        
        # Check if default project exists
        default_project = db.query(Project).filter(Project.id == 1).first()
        if not default_project:
            logger.info("Seeding default project...")
            default_project = Project(
                id=1,
                title="Default Project",
                description="Auto-created default project",
                owner_id=default_user.id
            )
            db.add(default_project)
        db.commit()
    except Exception as e:
        logger.warning(f"Failed to seed default database records: {e}", exc_info=True)
        db.rollback()
    finally:
        db.close()

# Create database tables
Base.metadata.create_all(bind=engine)
auto_migrate_database(engine)
seed_default_user_and_project(engine)

# ---------------------------------------------------------------
# Background processes managed by this server
# ---------------------------------------------------------------
_bg_processes = {}

def _is_ollama_running() -> bool:
    """Check if Ollama is already listening on port 11434."""
    try:
        with socket.create_connection(("localhost", 11434), timeout=1):
            return True
    except OSError:
        return False

def _start_ollama():
    """Start the Ollama server if it is not already running."""
    if settings.QWEN_API_KEY and settings.QWEN_API_KEY != "your_openrouter_api_key_here":
        logger.info("QWEN_API_KEY is configured. Skipping local Ollama startup.")
        return

    if _is_ollama_running():
        logger.info("Ollama is already running on port 11434.")
        return

    # Try to find ollama.exe in the standard install location
    ollama_candidates = [
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "Ollama", "ollama.exe"),
        "ollama",  # In PATH (works after terminal restart)
    ]

    ollama_exe = None
    for candidate in ollama_candidates:
        if os.path.exists(candidate):
            ollama_exe = candidate
            break

    if not ollama_exe:
        logger.warning("Ollama executable not found. Please start the Ollama app manually.")
        return

    logger.info(f"Starting Ollama server: {ollama_exe} serve")
    proc = subprocess.Popen(
        [ollama_exe, "serve"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
    )
    _bg_processes["ollama"] = proc
    logger.info(f"Ollama started (PID {proc.pid}). Waiting for it to be ready...")

    # Wait up to 10 seconds for Ollama to be ready
    import time
    for _ in range(20):
        time.sleep(0.5)
        if _is_ollama_running():
            logger.info("Ollama is ready and accepting connections.")
            return
    logger.warning("Ollama did not respond in time. AI features may fail.")

def _start_celery():
    """Start the Celery worker in the background."""
    backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    logger.info("Starting Celery worker...")
    
    # Open log file for celery
    celery_log = open(os.path.join(backend_dir, "celery_worker.log"), "a")
    
    proc = subprocess.Popen(
        [
            sys.executable, "-m", "celery",
            "-A", "app.core.celery_app", "worker",
            "-Q", "aishorts-queue",
            "--loglevel=info",
            "--pool=threads",
            "--concurrency=4",
        ],
        cwd=backend_dir,
        env={**os.environ, "PYTHONPATH": backend_dir},
        stdout=celery_log,
        stderr=subprocess.STDOUT,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
    )
    # Store the file object so it doesn't get garbage collected
    proc._log_file = celery_log
    _bg_processes["celery"] = proc
    logger.info(f"Celery worker started (PID {proc.pid}).")

def _stop_bg_processes():
    """Gracefully terminate all background processes."""
    for name, proc in _bg_processes.items():
        if proc and proc.poll() is None:
            logger.info(f"Stopping {name} (PID {proc.pid})...")
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
            logger.info(f"   {name} stopped.")

# ---------------------------------------------------------------
# Lifespan: runs on startup and shutdown
# ---------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- STARTUP ---
    logger.info("=" * 50)
    logger.info("Harvest AI Server Starting...")
    logger.info("=" * 50)
    _start_ollama()
    _start_celery()
    logger.info("=" * 50)
    logger.info("All services started. API is ready!")
    logger.info("=" * 50)
    yield
    # --- SHUTDOWN ---
    logger.info("Server shutting down. Cleaning up background services...")
    _stop_bg_processes()
    logger.info("Shutdown complete.")


# ---------------------------------------------------------------
# App Definition
# ---------------------------------------------------------------
app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

# ---------------------------------------------------------------
# CORS MUST be added FIRST so it wraps ALL responses including
# 500 errors. If registered after other middleware, error responses
# lose their CORS headers and the browser blocks them.
# ---------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Absolute uploads directory (backend/uploads/ - parent of app/)
_UPLOADS_DIR = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "uploads"))
os.makedirs(_UPLOADS_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=_UPLOADS_DIR), name="uploads")

@app.middleware("http")
async def disable_cache_control_middleware(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

@app.middleware("http")
async def catch_exceptions_middleware(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as e:
        with open("error.log", "a") as f:
            f.write(traceback.format_exc())
            f.write("\n\n")
        return JSONResponse(
            status_code=500,
            content={"detail": str(e)},
        )

app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/")
def root():
    return {"message": f"Welcome to {settings.PROJECT_NAME} API"}