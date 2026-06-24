@echo off
setlocal

echo.
echo  ==========================================
echo   HarvestAI - Full Stack Launcher
echo  ==========================================
echo.

REM ── Paths ─────────────────────────────────
set ROOT=%~dp0
REM ROOT = e:\Proj\Official\harvest_AI\  (includes trailing backslash)

set VENV_PYTHON=%ROOT%.venv\Scripts\python.exe
set BACKEND_DIR=%ROOT%backend
set FRONTEND_DIR=%ROOT%frontend

REM ── Sanity checks ─────────────────────────
if not exist "%VENV_PYTHON%" (
    echo [ERROR] Python venv not found at: %VENV_PYTHON%
    echo         Run:  python -m venv .venv   then  .venv\Scripts\pip install -r backend\requirements.txt
    pause & exit /b 1
)

REM Check Redis is reachable (port 6379)
powershell -Command "try { $t = New-Object Net.Sockets.TcpClient('localhost',6379); $t.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Redis is NOT running on localhost:6379
    echo         Please start Redis first:
    echo           Option A - WSL:    wsl redis-server
    echo           Option B - Windows installer: net start Redis
    echo.
    pause & exit /b 1
)
echo [OK] Redis is running.

REM ── Launch FastAPI + auto-Celery in Terminal 1 ──────────
echo.
echo [1/2] Starting FastAPI backend  (Celery launches automatically inside it)
echo       URL: https://localhost:8000
echo       API: https://localhost:8000/api/v1
echo.
start "HarvestAI - Backend" cmd /k "cd /d "%BACKEND_DIR%" && "%VENV_PYTHON%" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --ssl-keyfile key.pem --ssl-certfile cert.pem"

REM Give the backend a moment to boot
timeout /t 3 /nobreak >nul

REM ── Launch Frontend in Terminal 2 ──────────────────────
echo [2/2] Starting React frontend
echo       URL: http://localhost:5173
echo.
start "HarvestAI - Frontend" cmd /k "cd /d "%FRONTEND_DIR%" && npm run dev"

echo.
echo  ==========================================
echo   All services launched in separate windows
echo  ==========================================
echo.
echo   Backend   : https://localhost:8000
echo   Frontend  : http://localhost:5173
echo   API Docs  : https://localhost:8000/docs
echo   Celery Log: %BACKEND_DIR%\celery_worker.log
echo.
echo  Close this window or press any key to exit launcher.
pause >nul
