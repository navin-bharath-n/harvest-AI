# Harvest AI - AI-Powered Video Shorts Generator

Harvest AI is an advanced, automated pipeline for processing videos, detecting highlight segments, generating dynamic subtitles/captions, applying smart cropping (reframing to portrait mode), and auto-publishing to social media platforms (YouTube, Instagram, Facebook).

---

## Architecture Overview

Harvest AI consists of a robust full-stack architecture:
1. **Frontend (React + Vite)**: A premium interactive dashboard for uploading videos, managing projects, customizing templates, and triggering highlights detection.
2. **Backend (FastAPI)**: An API hosting the logical pipelines, integration points, and REST endpoints.
3. **Database (PostgreSQL / SQLite)**: Relational storage for user accounts, social connection OAuth keys, video processing states, and projects.
4. **Message Queue & Workers (Redis + Celery)**: Handles asynchronous heavy processing (audio transcription, translation, subtitle generation, video editing/rendering, and social publishing).

---

## Technology Stack

- **Frontend**: React, Vite, TailwindCSS (for responsive UI/UX), HTML5 Video API.
- **Backend**: Python 3.10+, FastAPI, SQLAlchemy, Alembic, Pydantic.
- **Background Pipeline**: Celery, Redis.
- **AI & Video Processing**:
  - LLM/Agentic decision framework using Qwen via OpenRouter.
  - Video analysis using YOLO11 (object detection and smart reframing).
  - FFmpeg for video/audio manipulation, subtitle embedding, and rendering.
  - Google Cloud Speech-to-Text for transcription.

---

## Setup & Running Locally

### Prerequisites

1. **Python**: Python 3.10 or 3.11 installed.
2. **Node.js**: Node 18+ installed.
3. **Redis**: Running on `localhost:6379`.
4. **FFmpeg**: Configured in system path (for rendering).

---

### Step 1: Clone and Set Up Environment

1. Set up the Python virtual environment in the root folder:
   ```bash
   python -m venv .venv
   .venv\Scripts\activate      # On Windows
   source .venv/bin/activate    # On Unix/macOS
   ```

2. Install dependencies:
   ```bash
   pip install -r backend/requirements.txt
   ```

3. Create the `.env` file in the `backend/` directory:
   ```bash
   cp backend/.env.example backend/.env
   ```
   Fill in your API keys (e.g., `QWEN_API_KEY`, Meta and Google client secrets, etc.) inside `backend/.env`.

---

### Step 2: Running the Application

You can use the full stack launcher batch file on Windows:
```bash
start.bat
```

Alternatively, run the services manually:

#### Run Redis
Ensure Redis is running:
- **Windows (Service)**: `net start Redis`
- **Linux/WSL**: `redis-server`

#### Run Backend & Celery Worker
Navigate to the `backend` directory:
```bash
cd backend
# Start FastAPI and Celery
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --ssl-keyfile key.pem --ssl-certfile cert.pem
```

#### Run Frontend
Navigate to the `frontend` directory:
```bash
cd frontend
npm install
npm run dev
```

---

## Security & Credentials

All sensitive credentials (such as local database files, logs, generated SSL certificates, and environment files) are secured and ignored using `.gitignore`:
- `*.env` (and specifically `backend/.env`)
- `backend/gcp-key.json`
- `*.pem` (SSL key and certificate)
- Local SQLite database files (`*.db`)
- Logs (`*.log`)
