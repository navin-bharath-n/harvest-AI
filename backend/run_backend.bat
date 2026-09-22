@echo off
REM ── Run Harvest AI Backend ──
cd /d "%~dp0"
if exist "..\.venv\Scripts\python.exe" (
    set "PY=..\.venv\Scripts\python.exe"
) else (
    set "PY=python"
)
%PY% run.py
