@echo off
REM ── Run Celery worker standalone ──
REM Use this ONLY if you disabled auto-start in main.py lifespan.
REM Normally Celery is launched automatically by FastAPI on startup.
cd /d "%~dp0"
..\.venv\Scripts\python.exe -m celery -A app.core.celery_app worker ^
    --loglevel=info ^
    -Q aishorts-queue ^
    --pool=threads ^
    --concurrency=4 ^
    -n harvest_worker@%%h
