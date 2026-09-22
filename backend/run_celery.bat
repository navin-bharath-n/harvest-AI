@echo off
REM ── Run Celery worker standalone ──
REM Use this if AUTO_START_CELERY=false or when running dedicated workers.
cd /d "%~dp0"
if exist "..\.venv\Scripts\python.exe" (
    set "PY=..\.venv\Scripts\python.exe"
) else (
    set "PY=python"
)
%PY% -m celery -A app.core.celery_app worker ^
    --loglevel=info ^
    -Q aishorts-queue ^
    --pool=threads ^
    --concurrency=4 ^
    -n harvest_worker@%%h
