import os
import glob

# Add Winget FFmpeg path to PATH dynamically if not present
try:
    winget_packages_dir = os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Packages")
    if os.path.exists(winget_packages_dir):
        matches = glob.glob(os.path.join(winget_packages_dir, "Gyan.FFmpeg_*"))
        for match in matches:
            bin_paths = glob.glob(os.path.join(match, "*", "bin"))
            if bin_paths and os.path.exists(bin_paths[0]):
                ffmpeg_bin = bin_paths[0]
                if ffmpeg_bin not in os.environ["PATH"]:
                    os.environ["PATH"] = ffmpeg_bin + os.pathsep + os.environ["PATH"]
except Exception:
    pass

from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "worker",
    broker=settings.CELERY_BROKER_URL,
    include=["app.tasks.video_tasks"]
)

celery_app.conf.task_default_queue = 'aishorts-queue'
celery_app.conf.task_routes = {
    "app.tasks.video_tasks.*": "aishorts-queue"
}
