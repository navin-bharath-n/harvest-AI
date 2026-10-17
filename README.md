# Encore (Harvest AI) — Creator Growth & Video Platform

> *"Every video ends with an encore."*

Encore (formerly Harvest AI) is an all-in-one creator growth platform where creators upload a video once and it is automatically clipped, captioned, titled, fitted with a branded outro and dynamic smart link, turned into multiple social formats, scheduled to every major platform, and measured for real audience growth.

---

## 🔄 The 5-Stage Creator Loop

Unlike traditional single-purpose tools, Encore closes the creator feedback loop:

```
Create ──► Find ──► Publish ──► Connect ──► Learn
  ▲                                           │
  └───────────────────────────────────────────┘
```

1. **Create**:
   - **Upload & Auto-Clip**: Extract 3–5 high-engagement vertical moments (9:16) from long-form video.
   - **Hook Detection**: Insert bold opening hooks in the first 3 seconds.
   - **Subtitles & Safe Zones**: Frame-accurate, multilingual captions burned into platform-safe areas.
   - **Loop Mode**: 1–2s seamless cutback CTA for Shorts, Reels, and TikTok.
   - **8 Niche Outro Templates**: Dedicated outro screens (Cooking, Travel, Tech/AI, Lifestyle, Gaming, Education, Business, Music) with tracked dynamic QR codes, action cards, and next-video links.
2. **Find**:
   - **AI Titles & Descriptions**: Platform-tailored copy in the creator's natural voice.
   - **Hashtags & Keyword Verification**: 3–5 platform-appropriate hashtags with cross-checks across spoken audio, captions, and on-screen text.
   - **Chapters & Thumbnails**: Auto-generated timestamps and click-worthy thumbnail variations.
3. **Publish**:
   - **Platform Picker**: YouTube, YouTube Shorts, Instagram Reels, Facebook Reels, and TikTok (Phase 2 adds LinkedIn, X, Threads, Pinterest).
   - **Safe-Zone Presets**: Margins calibrated per platform (120px left, 200px right, 250px top, 450px bottom).
   - **Platform-Specific CTAs**: Context-aware wording ("Tap on screen", "Link in bio", "Comment LINK").
   - **Clean Exports & Post Kits**: Zero competitor watermarks with copy-ready captions and first comments.
4. **Connect**:
   - **Smart Links**: Deep links directly into native apps with device detection (iOS, Android, TV, Desktop).
   - **Dynamic Tracked QR Codes**: Scan destinations remain editable without re-rendering videos.
   - **Evergreen Links**: Outros always point viewers to the creator's newest video.
5. **Learn**:
   - **Real Growth Attribution**: Trace followers, subscribers, and scans directly back to specific video outros.
   - **Retention Diagnosis**: Pinpoint drop-off points in plain words (e.g., *"slow intro at 0:04 — cut 3 seconds"*).
   - **Automated A/B Testing**: Rotate hooks, titles, and outro styles to maximize conversion.

---

## 🏛️ Plan & Room Architecture ("Quality, Not Quantity")

Each room answers a progressively bigger creator question:

- **Room 01: Think Room ($0 Free Forever)**: *"How did my video do?"* — Pre-publish quality report card (hook, audio, captions, platform risks), 8 niche outros (small badge), 1 smart link & QR code, 15 video-minutes/mo.
- **Room 02: Create Room ($9/mo, billed $108/yr)**: *"Why did it work?"* — 1-tap fixes in your voice, multi-platform clipping and scheduling, unbranded outros, 3 smart links, evergreen link, 120 video-minutes/mo.
- **Room 03: Growth Room ($19/mo, billed $228/yr — Most Popular)**: *"What should I make next?"* — Advice learning from actual follower growth, top-creator playbooks, predicted performance, carousel & post generator, auto A/B testing, verified media kit, 400 video-minutes/mo.
- **Room 04: Control Room ($49/mo, billed $588/yr)**: *"How do I prove results?"* — Follower attribution for sponsors/clients, white-label client reports, 5 brands + 3 seats, Studio mode (calendar + batch editing), 1,000 video-minutes/mo.

---

## 🛠️ Full-Stack Architecture & Tech Stack

- **Frontend**: React 18, Vite, Lucide Icons, Axios, TailwindCSS / Custom Design System.
- **Backend**: FastAPI (Python 3.10+), SQLAlchemy, Pydantic, Alembic.
- **Task Queue & Caching**: Redis 7+, Celery worker with thread pool.
- **Database**: PostgreSQL (Production / Neon) & SQLite (Local Development).
- **Video & Audio Processing**:
  - **FFmpeg**: Video concatenation, scaling, filtergraphs, and outro rendering.
  - **Whisper & Cloud STT**: Frame-accurate multilingual speech-to-text transcription.
  - **Pillow & Qrcode**: Dynamic QR codes and custom CTA image synthesis.
- **AI Models & Agents**:
  - OpenRouter / Qwen LLM for content understanding, highlights, social metadata, and script generation.

---

## 🚀 Setup & Running Locally

### Prerequisites

1. **Python**: Python 3.10 to 3.12 installed.
2. **Node.js**: Node 18+ installed.
3. **Redis**: Running on `localhost:6379`.
4. **FFmpeg**: Installed and accessible in your system `PATH`.

---

### Step 1: Environment & Virtual Environment Setup

1. **Create and activate the Python virtual environment** in the project root:
   ```bash
   # In the repository root:
   python -m venv .venv

   # Activate virtual environment:
   .\.venv\Scripts\activate       # On Windows (PowerShell / Command Prompt)
   source .venv/bin/activate     # On macOS / Linux
   ```

2. **Install Backend Dependencies**:
   ```bash
   pip install -r backend/requirements.txt
   ```

3. **Install Frontend Dependencies**:
   ```bash
   cd frontend
   npm install
   cd ..
   ```

4. **Configure Environment Variables**:
   ```bash
   cp backend/.env.example backend/.env
   ```
   Edit `backend/.env` with your API keys (OpenRouter/Qwen, database URL, OAuth client secrets, etc.).

---

### Step 2: Running the Application

#### Option A: One-Click Full Stack Launcher (Windows)

Run the included launcher batch script:
```cmd
start.bat
```
This automatically verifies Redis, launches the FastAPI backend (with Celery worker) in Terminal 1, and boots the Vite React frontend in Terminal 2.

---

#### Option B: Manual Service Launch

##### 1. Start Redis
- **Windows (Service)**: `net start Redis`
- **WSL / Linux / macOS**: `redis-server`

##### 2. Start the Backend API & Background Worker
Navigate to the `backend` directory:
```bash
cd backend

# Start FastAPI server (Celery worker auto-launches in background when AUTO_START_CELERY=true):
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --ssl-keyfile key.pem --ssl-certfile cert.pem
```

> **Note on Celery:** When `AUTO_START_CELERY=true` in `backend/.env`, the backend server launches the Celery background worker automatically. If you wish to run a dedicated worker manually in a separate shell:
> ```bash
> ..\.venv\Scripts\celery.exe -A app.core.celery_app worker -Q aishorts-queue --loglevel=info --pool=threads
> ```

##### 3. Start the Frontend
In a new terminal, navigate to the `frontend` directory:
```bash
cd frontend
npm run dev
```

---

### 🌐 Service Endpoints

- **Frontend App**: [https://localhost:5173](https://localhost:5173)
- **Backend API**: [https://localhost:8000/api/v1](https://localhost:8000/api/v1)
- **Interactive API Docs (Swagger UI)**: [https://localhost:8000/docs](https://localhost:8000/docs)
- **Alternative Docs (ReDoc)**: [https://localhost:8000/redoc](https://localhost:8000/redoc)

---

## 🔒 Security & Credentials

All sensitive credentials and temporary artifacts are ignored via `.gitignore`:
- `*.env` (and specifically `backend/.env`)
- `backend/gcp-key.json`
- `*.pem` (SSL key and certificate)
- Local SQLite database files (`*.db`)
- Video upload artifacts and cache logs (`*.log`, `uploads/`)
