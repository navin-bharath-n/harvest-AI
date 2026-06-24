@echo off
REM ── Run FastAPI backend only (Celery auto-starts inside main.py) ──
REM Must be run from e:\Proj\Official\harvest_AI\backend\
cd /d "%~dp0"
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --ssl-keyfile key.pem --ssl-certfile cert.pem
