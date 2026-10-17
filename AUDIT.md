# Harvest AI — Production Readiness Audit & Fix Guide

| | |
|---|---|
| **Original audited commit** | `86202be` on `main` (2026-09-22) |
| **Reassessment snapshot** | `ecba3d8` on `main` (2026-10-17) |
| **Scope** | Original review: FastAPI backend, Celery pipeline, React frontend, Docker/nginx. Reassessment: current auth/config/deployment surfaces, known security regressions, and post-audit feature scope |
| **Target** | Public internet launch with heavy traffic: low latency, high throughput |
| **Review lenses** | OWASP Top 10 / ASVS, trust-boundary review, Karpathy guidelines (simple, surgical, verifiable), Matt Pocock skills (root-cause debugging, deep modules), Ponytail (delete before you add) |

---

## 0. Read this first

This document contains the original review and a reassessment of the repository snapshot listed above. **It is not a current deployment approval.** The step-by-step remediation recipe was authored against `86202be`; do not apply its replacements mechanically to later commits. First reconcile every proposed edit with the current source, then run the relevant verification commands and complete Part D. The reassessment found a tracked YouTube browser-cookie file that requires credential revocation; treat this as an active incident until its owner confirms the session has been invalidated.

### 0.1 Rules

1. **Do the steps in order.** Later steps import files that earlier steps create.
2. **Copy code exactly.** If a step says "replace the whole file", delete everything in the file and paste the new content.
3. **"Find → Replace" blocks**: the original blocks were checked against commit `86202be`. Before applying any block to a newer commit, inspect the surrounding current code and adapt the change to preserve later features. If the behavior or surrounding code differs, do not paste blindly.
4. **Run each step's Verify command before moving on.** If it fails, fix it before continuing.
5. Unless a step says otherwise, run commands from the `backend/` folder with the virtualenv active.
6. Make **one commit per step**: `git commit -m "fix(step-N): <title>"`. Work on a dedicated branch; use `git switch -c <branch-name>`, or `git switch <branch-name>` if it already exists.

### 0.2 What "done" means

The app is ready to go live only when **every box in [Part D — Go-live checklist](#part-d--go-live-checklist) is ticked against the actual release commit**, the credential incident in SEC-23 is resolved, and all deployment and end-to-end checks pass. Part E covers scale-out work for after launch; it does not replace the launch blockers in Parts B–D.

### 0.3 How the original guide was tested (historical)

The checks below describe the original recipe applied to a clean copy of `86202be`; they do **not** establish that the recipe applies to `ecba3d8` or that the current checkout is production-ready.

Every code change in Part C was applied mechanically, exactly as written, to a clean copy of commit `86202be`, and then checked:

| Check | Result |
|---|---|
| Every "Find" block matches the real code exactly once | ✓ |
| Backend Steps 1–15 + 18: `pytest` (24 security and job tests) | ✓ all pass |
| `ruff check --select E9,F63,F7,F82` (syntax errors, undefined names) | ✓ clean |
| Step 15: `alembic revision --autogenerate` → `upgrade head` → `alembic check` | ✓ clean |
| Frontend Step 16: `npm audit --omit=dev --audit-level=high` | ✓ 0 high or critical |
| Frontend Step 16: `npm run lint` / `npm run build` | ✓ 0 errors / builds, with per-page chunks |
| Step 17 compose file and Step 18 CI file parse; only nginx publishes ports | ✓ |

**Not executed during the review**, so you must verify these yourself:
- Step 14.6 (switching about 35 ffmpeg calls to `run_ffmpeg`) is a by-hand edit. Its grep must come back empty, and a real end-to-end generation must work: upload, generate, play, publish.
- Step 17 (Docker, nginx, TLS) was not run, because Docker wasn't available in the review environment. Run every Verify command in Step 17.
- The OAuth flows need real Google/Meta apps. Connect each platform once on staging.

**Reassessment limits (2026-10-17):** the current code was spot-checked for the previously reported auth, project ownership, default-user, JWT fallback, static media, database/Redis exposure, publishing fallbacks, and for changes added since `86202be`. This is not a line-by-line re-audit of all 113 changed paths or a rerun of the historical test matrix. The newer template, branding, outro/QR, scheduling, metadata-suggestion, object-storage, and frontend Studio flows still need a focused security and regression review before launch.

### 0.4 Decisions already made for you (don't re-decide these)

| Decision | Choice | Why |
|---|---|---|
| Existing data | Production starts with a **fresh database**. A local development DB may be reset only by explicit choice after a backup. | The app has never been deployed. Migrating fake/seeded data isn't worth the risk. |
| Auth token transport | Bearer token in `localStorage` + strict CSP + 12 h expiry | Smallest change that is safe. Cookies are a Part E upgrade. |
| Media access | **Signed, expiring URLs** (`/api/v1/media/...?...&sig=`) | `<video src>` can't send an `Authorization` header, so signed URLs are the standard answer. Instagram's servers can fetch the same URLs. |
| Background queues | 3 queues: `pipeline` (heavy AI), `render` (ffmpeg re-renders), `io` (publishing, maintenance) | A long AI job must never block a publish. |
| Cross-process state | Redis (rate limits, OAuth state, quotas, cancellation) | It's already in the stack. |
| Removed features | The step-by-step buttons for transcribe, analyze, highlights and smart crop | They never worked (BUG-07); the Master Generator replaced them. |

### 0.5 Reassessment against the current checkout

The original findings are not all still accurate as written. In the current snapshot, `get_current_user` rejects missing/invalid tokens and project creation derives `owner_id` from the authenticated user. These are improvements, but they do not clear the broader API or release.

The following original findings remain visibly present in the current source and must stay open until their fixes are implemented and verified:

| Finding | Current evidence |
|---|---|
| SEC-03 — seeded default account | `backend/app/main.py` still creates `user1@harvest.ai` with password `admin123` and id 1. |
| SEC-07 — JWT fallback key | `backend/app/core/security.py` still returns a hard-coded fallback key when the configured key is absent or too short. |
| SEC-08 — exposed data services | `backend/docker-compose.yml` publishes Postgres on 5432 and Redis on 6379 without Redis authentication. |
| SEC-12 — public media | `backend/app/main.py` still mounts the uploads directory with `StaticFiles` at `/uploads`. |
| SEC-05 — operator token fallback | The publishing endpoint still counts configured operator tokens as connected accounts; inspect the full task/service path before removing all fallbacks. |
| SEC-15 / OPS-02 — deployment surface | The checked-in compose setup still bind-mounts source and publishes the API directly; the original production-only deployment recipe has not been applied here. |

**New finding:**

| ID | Sev | Problem and impact | Where | Required action |
|---|---|---|---|---|
| SEC-23 | 🔴 | `backend/cookies.txt` is tracked in Git and contains 19 Netscape-format cookies for `.youtube.com`, including session-cookie names. The latest recorded expiry is 2027-11-13. Treat these as exposed credentials; anyone with repository access may be able to use the associated YouTube session. | `backend/cookies.txt` | Revoke the YouTube session/cookies immediately; remove the file from the working tree and repository history, rotate any related credentials, and add cookie files to `.gitignore`. Verify the old cookie values no longer authenticate. |

The historical decision that local development databases are recreated is **not authorization to delete a database automatically**. Step 0 preserves existing data unless the developer explicitly chooses to reset it after making a backup.

---

## Part A — Executive summary

**Historical verdict (86202be): do not deploy yet.** At that snapshot, the blocker was security, including broad missing authentication. At the current reassessment snapshot, some of those auth and ownership issues have been addressed; the remaining confirmed blockers and the unreviewed newer feature scope are listed in §0.5. The following bullets describe the original snapshot:

- read and delete every user's projects and videos,
- read every stored YouTube/Facebook/Instagram token,
- publish to the company's social accounts,
- stop every job on the server with one request.

| Area | Status | Headline |
|---|---|---|
| Security | 🔴 | Only `GET /users/me` checks the caller, and it falls back to user 1 when there is no token. Tokens are leaked. Seeded `admin123` account. Hard-coded JWT secret fallback. DB and Redis are on public ports. XSS in the OAuth callback. All media is public. |
| Bugs | 🟠 | Videos stuck in `PROCESSING` forever. Cancel never reaches the worker and SIGKILLs other users' tasks. Failures reported as success. MKV/WebM gives 5 identical clips. Clip end before start. |
| Concurrency | 🟠 | No Celery acks or time limits, so crashed jobs are lost. Double-click runs two pipelines on the same files. Double-click publishes twice. A shared tracker is used across videos and threads. Race in the music cache. |
| Performance | 🟠 | YOLO + FaceMesh run on the whole video even when the result is thrown away. A 1-fps frame dump on every run is never used. No timeouts on ffmpeg or LLM calls. The frontend polls 1.2–1.5 req/s per tab and downloads **every video in the system** each time. |
| Scalability | 🟠 | Media on local disk (one host only). Schema migrations and process spawning at import. One queue for everything. No quotas. |
| Code quality | 🟡 | No tests, no CI. The Alembic baseline can't build the DB. ~1,000-line god functions. Path logic duplicated 6× with two different base folders. Lots of dead code. |

**Verified OK:**
- No `shell=True`/`os.system`.
- No SQL injection.
- Upload filenames are replaced with UUIDs.
- Celery uses JSON (no pickle).
- The JWT algorithm is pinned.
- Original review found no secrets in history at `86202be`; this is no longer true in the current history because of SEC-23.
- No `dangerouslySetInnerHTML`.

---

## Part B — Findings register

Severity:
- 🔴 **Critical**: exploitable now, or data loss.
- 🟠 **High**: breaks or gets abused under real traffic.
- 🟡 **Medium**
- ⚪ **Low**

"Fixed in" points to the step in Part C that fixes it.

### B.1 Security

| ID | Sev | Problem and impact | Where | Fixed in |
|---|---|---|---|---|
| SEC-01 | 🔴 | No auth or ownership check on any video, project or connection endpoint. `for i in 1..N: curl -X DELETE /api/v1/projects/$i` wipes every customer. | `endpoints/videos.py`, `projects.py`, `users.py:75-200` | Steps 7, 8, 9, 10 |
| SEC-02 | 🔴 | `get_current_user` returns **user 1** when no token is sent. | `api/deps.py:49-53` | Step 7 |
| SEC-03 | 🔴 | User `user1@harvest.ai` / `admin123` is seeded at import. The explicit `id=1` also breaks the Postgres sequence, so the first real signup returns 500. | `main.py:116-127` | Step 11 |
| SEC-04 | 🔴 | `GET /users/{id}/connections` (no auth) returns OAuth tokens, plus the operator's own `.env` tokens injected into **every** user. The frontend sends them back. | `users.py:75-132`, `schemas/social_connection.py:10`, `SocialPublishingPanel.jsx:61,198-207` | Steps 6, 10, 16 |
| SEC-05 | 🔴 | Publishing falls back to `settings.YOUTUBE_ACCESS_TOKEN` etc. Any anonymous clip gets posted to the **company's** channels. An orphan clip uses user 1's credentials. | `social_publish_service.py:55,114-116,163-167,304,382-383,450-452`, `video_tasks.py:888` | Steps 13, 14 |
| SEC-06 | 🔴 | `POST /videos/cancel-all` (no auth) SIGKILLs every Celery task and fails every user's video: a one-request outage. | `videos.py:411-451` | Step 9 (now cancels only *your* jobs) |
| SEC-07 | 🔴 | When `SECRET_KEY` is missing, JWTs are signed with a public hard-coded string, so anyone can forge any user's token. | `core/security.py:15-22`, `docker-compose.yml:47` | Steps 2, 3 |
| SEC-08 | 🔴 | Postgres (`postgres/postgres`) and Redis (no password) are published on `5432`/`6379`. Docker bypasses `ufw`. Open Redis lets anyone enqueue publish tasks. | `docker-compose.yml:9-13,22-23,36-37` | Step 17 |
| SEC-09 | 🔴 | The client chooses `owner_id` on project creation (mass assignment). | `schemas/project.py:11`, `projects.py:11`, `client.js:67-80` | Steps 6, 8, 16 |
| SEC-10 | 🟠 | OAuth `state` is just the user id, so an attacker can link their channel to a victim or the reverse (login CSRF). | `users.py:202-298` | Step 10 |
| SEC-11 | 🟠 | Reflected XSS: `?error=</script><script>…` lands inside `<script>` because `json.dumps` doesn't escape `</`. It steals the JWT from `localStorage`. `postMessage` target falls back to `"*"`. | `users.py:26,270-287,459-474` | Step 10 |
| SEC-12 | 🟠 | All uploads and clips are public under `/uploads` with `Cache-Control: public, 30d`. Paths are leaked in API responses. | `main.py:345-347`, `nginx.conf:55-60`, `schemas/video.py:62-72` | Steps 4, 6, 7, 17 |
| SEC-13 | 🟠 | No rate limits or quotas: login brute force, a disk filled with 2 GB uploads, unlimited LLM/STT bills. | whole app | Steps 9, 10, 17 |
| SEC-14 | 🟠 | Only the file *extension* is checked. ffmpeg picks the demuxer from *content*, so a playlist disguised as `.mp4` can read local files or internal URLs (SSRF). | `videos.py:40-42,87` | Steps 4, 9, 14 |
| SEC-15 | 🟠 | The container runs as root. `COPY . .` bakes `.env`, keys, DB and uploads into the image. Production bind-mounts the source tree. | `Dockerfile`, `docker-compose.yml` | Step 17 |
| SEC-16 | 🟠 | OAuth tokens are stored in plaintext JSON. | `models/social_connection.py:15` | Steps 3, 6 |
| SEC-17 | 🟡 | No HSTS, CSP or other security headers. `/docs` and `openapi.json` are public. | `nginx.conf`, `main.py:310-314` | Steps 11, 17 |
| SEC-18 | 🟡 | `python-jose` is unmaintained (CVE-2024-33663/33664). `passlib` + bcrypt 5 breaks logins silently. 7-day tokens. No password policy. | `requirements.txt:15-16`, `security.py:13`, `schemas/user.py` | Steps 1, 3, 6 |
| SEC-19 | 🟡 | Tokens and transcripts are written to logs. Tokens are passed as Celery args (plaintext in Redis). Errors go to a local `error.log`. | `video_tasks.py:862,919`, `transcription_service.py:142-145,235-244`, `main.py:350-377` | Steps 11, 13, 14 |
| SEC-20 | 🟡 | ASS subtitle header injection (`font_name` with a newline) and render DoS (`{\blur999}`) from user `edit_options`. | `subtitle_service.py:162-225` | Step 14 |
| SEC-21 | ⚪ | Login returns 400 (should be 401). `detail=str(e)` leaks internals. Absolute server paths in responses. The client invents a fake video when a request fails. | `users.py`, `videos.py:567`, `client.js:90-94` | Steps 9, 10, 16 |
| SEC-22 | 🟡 | `npm audit`: axios (prototype pollution, header injection), react-router-dom (open redirect), form-data (CRLF): 3 high, 2 moderate. | `frontend/package.json` | Step 16 |
| SEC-23 | 🔴 | `backend/cookies.txt` is tracked and contains 19 `.youtube.com` cookies, including session-cookie names, with a latest recorded expiry of 2027-11-13. Repository readers may be able to use the associated YouTube session. | `backend/cookies.txt` | Revoke the session, remove the file and its values from Git history, ignore cookie artifacts, and verify the old values no longer authenticate. |

### B.2 Bugs

| ID | Sev | Problem and impact | Where | Fixed in |
|---|---|---|---|---|
| BUG-01 | 🔴 | Videos stuck in `PROCESSING` forever. A missing file `return`s without setting a status. A worker crash loses the message (early ack). | `video_tasks.py:725-727`, `celery_app.py` | Steps 12, 13 |
| BUG-02 | 🟠 | Cancel matches `args[0] == video_id`, but render/publish tasks take a **clip** id. Cancelling video 12 SIGKILLs someone's clip-12 job. | `videos.py:467-479` | Steps 5, 9 |
| BUG-03 | 🟠 | Failures reported as success: an unchecked ffmpeg fallback marks a missing file COMPLETED. A video is COMPLETED even when all 5 variations failed. | `video_tasks.py:655,837-847`, `music_agent.py:344` | Steps 13, 14 |
| BUG-04 | 🟠 | MKV/WebM: ffprobe reads only `stream=duration` (absent in Matroska), so duration is 0 and you get 5 identical clips. | `video_processor.py:61` | Steps 4, 14 |
| BUG-05 | 🟠 | Clip end can be **before** start (the fallback includes words before `best_start`). The variation silently disappears. | `master_agent.py:296,314-316` | Step 14 |
| BUG-06 | 🟠 | 5 wasted LLM calls per run. LLM guesses (`translate_language: "en"`) override the user's settings and break the karaoke timing. | `master_agent.py:438-450` | Step 14 |
| BUG-07 | 🟠 | Transcribe → analyze → highlights can never run: `audio_path` is only set by a task nothing dispatches. | `video_tasks.py:13-294`, `videos.py:115-205` | Steps 9, 13, 16 (removed) |
| BUG-08 | 🟡 | One dub segment failing kills the whole dub (`match_pacing` returns without writing output). | `voice_service.py:311-313` | Step 14 |
| BUG-09 | 🟡 | Google STT `recognize` is limited to about 1 min of audio. Every real video fails, pays for the call, then falls back to Whisper. | `transcription_service.py:220` | Step 14 |
| BUG-10 | 🟡 | Clip files are never deleted (a path relative to `app/` is checked against the CWD). | `videos.py:544`, `projects.py:41-62` | Steps 4, 8, 9 |
| BUG-11 | 🟡 | The status endpoint stays "rendering 3/5" forever if only 3 variations succeed, so the UI polls forever. | `videos.py:385-393` | Step 9 |
| BUG-12 | 🟡 | ffmpeg `Popen` with `stderr=PIPE` is read only after the loop. If ffmpeg logs more than about 64 KB, both processes deadlock. | `clip_rendering_service.py:163,246` | Step 14 |

### B.3 Concurrency and deadlocks

| ID | Sev | Problem and impact | Where | Fixed in |
|---|---|---|---|---|
| CONC-01 | 🟠 | No `acks_late`, prefetch limit, time limits, `reject_on_worker_lost` or `max_tasks_per_child`. Hung jobs hold slots forever. Prefetch hoards jobs. | `celery_app.py` | Step 12 |
| CONC-02 | 🟠 | Double-click runs two pipelines that write the same files (`<stem>_audio.wav`) and delete each other's clips. | `videos.py:249-302`, `video_processor.py:30-44` | Steps 9, 13 |
| CONC-03 | 🟠 | Publishing isn't idempotent: a double-click or retry posts twice. A crash leaves "pending" forever. | `videos.py:579-610`, `video_tasks.py:860-947` | Steps 9, 13 |
| CONC-04 | 🟠 | Cancellation flag lives in the API process's memory. The worker never sees it. | `master_agent.py:9-36` | Steps 5, 14 |
| CONC-05 | 🟠 | One DeepSort tracker and `mar_history` shared across all videos and threads: wrong crops, memory leak, and non-thread-safe YOLO. | `smart_cropping_service.py:51,67,174-179` | Step 14 |
| CONC-06 | 🟡 | Default pool (5+10) vs ~40 threadpool handlers, so `QueuePool timeout` under load. Silent SQLite in production gives "database is locked". | `core/database.py` | Steps 2, 3 |
| CONC-07 | 🟡 | Music cache temp file name shared across workers, so the rename race gives a corrupt MP3. | `music_agent.py:182,196-198` | Step 14 |
| CONC-08 | 🟡 | `async def upload_video` does blocking file writes, DB calls and ffprobe on the event loop. One upload freezes every request on that worker. | `videos.py:26-108` | Step 9 |

### B.4 Performance and bottlenecks

| ID | Sev | Problem and impact | Where | Fixed in |
|---|---|---|---|---|
| PERF-01 | 🟠 | YOLO + DeepSort + FaceMesh run on the **whole video** even when the framing mode (default `fit_blur`) ignores the result. Skipped frames are fully decoded anyway. | `master_agent.py:355-358`, `video_tasks.py:316-333`, `smart_cropping_service.py:117-123` | Steps 13, 14 |
| PERF-02 | 🟠 | Every run dumps 1 fps JPEGs of the whole video plus a 15 s re-encode. Nothing reads them. | `video_processor.py:37-44` | Step 14 |
| PERF-03 | 🟠 | No timeout on any of 39 ffmpeg calls or the 7 OpenAI clients (SDK default 600 s × 3). A hung call pins a worker forever. | services, tasks | Steps 4, 14 |
| PERF-04 | 🟡 | The WAV is loaded fully into memory at the source rate, twice per job (about 1.4 GB for a 1 h video). | `master_agent.py:53`, `audio_analyzer.py:19` | Part E |
| PERF-05 | 🟠 | Disk fills up: `copy2` instead of move, intermediates cleaned only on success, the old clip never deleted on re-render, frames never deleted. | `video_tasks.py:346,657-665,768`, `master_agent.py:419` | Steps 13, 14 |
| PERF-06 | 🟠 | One queue for everything. Instagram publish sleeps up to 200 s inside a worker slot. | `celery_app.py:28-31` | Step 12 |
| PERF-07 | 🟠 | Prefork default concurrency = CPU count, and each child loads Whisper large-v3 + YOLO, so GPU/RAM runs out. | `docker-compose.yml:56` | Step 17 |
| PERF-08 | 🟠 | No per-user limits or back-pressure on expensive endpoints. | `videos.py` | Step 9 |
| PERF-09 | 🟡 | The status poll loads all clips in Python and imports torch/whisper into the API process. | `videos.py:338-377` | Step 9 |
| PERF-10 | 🟡 | Translation scrapes the unofficial Google endpoint, one request per line. TTS is one round trip per line, in sequence. | `translation_service.py`, `voice_service.py` | Part E |
| FE-PERF-1 | 🟠 | Duplicate `setInterval` pollers at 2–2.5 s with no backoff, about 1,200 req/s at 1,000 users. Requests pile up when the API is slow. | `GenerationContext.jsx:121`, `MasterGeneratorPage.jsx:271`, `VideoProcessingPage.jsx:161`, `ProjectDetailPage.jsx:81`, `DashboardPage.jsx:57` | Step 16 |
| FE-PERF-2 | 🟠 | `getVideos().find(id)` downloads **every** video (with transcripts) on every poll. | 6 places | Steps 9, 16 |
| FE-PERF-3 | 🟠 | VideoProcessingPage changes `<video src>` every 2 s (restart + re-download) and re-calls the LLM translation every 2 s. | `VideoProcessingPage.jsx:87,105,165,174` | Step 16 |
| FE-PERF-4 | 🟡 | three.js is shipped on every route; no code splitting; an unused `@react-three/postprocessing`. | `App.jsx`, `LandingPage.jsx` | Step 16 |

### B.5 Architecture and operations

| ID | Sev | Problem and impact | Where | Fixed in |
|---|---|---|---|---|
| ARCH-01 | 🟠 | All media on local disk under **two** different base folders (`backend/uploads`, `backend/app/uploads`). You can't run a second server. | `videos.py:19`, `video_processor.py:11`, `video_tasks.py:31,719` | Step 4 (one root); Part E (object storage) |
| ARCH-02 | 🟠 | At import: `create_all`, a home-made `ALTER TABLE` migrator, seeding, spawning Celery + Ollama with Windows paths. Races with more than one worker. | `main.py:6-297`, `celery_app.py:4-16` | Steps 11, 12 |
| ARCH-03 | 🟠 | The initial Alembic revision is empty, so `alembic upgrade head` fails on a fresh DB. Several tables/columns have no migration. | `alembic/versions/*` | Step 15 |
| DB-01 | 🟡 | Missing indexes on `projects.owner_id`, `videos.project_id`, `videos.status`, `clips.video_id`, `social_connections.user_id`. | models | Steps 6, 15 |
| OPS-01 | 🟠 | `/health` always says OK (even with the DB down). No Redis check. No Sentry. Errors written to a local file. | `health.py`, `main.py` | Steps 7, 11 |
| OPS-02 | 🟡 | nginx: placeholder domain, `Connection: upgrade` on every request, 2 GB request buffering. uvicorn is single-process without `--proxy-headers` (all IPs look like 127.0.0.1). | `nginx.conf`, compose | Step 17 |
| QA-01 | 🟠 | Zero tests. No CI. No linting for Python. | repo | Step 18 |

### B.6 Code quality (what to delete or simplify)

| ID | Sev | Item | Fixed in |
|---|---|---|---|
| QUAL-01 | 🟡 | `render_clip_task` (~385 lines) and `generate_shorts` (~550 lines) duplicate the same words → translate → dub → ASS → render → mux → music flow. | Part E (extract `render_short`) |
| QUAL-02 | 🟡 | Path resolution copy-pasted 6× with two anchors. | Step 4 (`storage.py`) |
| QUAL-03 | 🟡 | 7 copies of the OpenAI client setup; translation and dub-mux blocks duplicated; 5 identical status enums; frontend `LANGUAGES`, `StatusChip` and media-URL logic duplicated. | Steps 14, 16; Part E |
| QUAL-04 | ⚪ | Dead code: the granular tasks/endpoints, frame dump, cancellation registry, `HtmlOverlay.jsx`, `Scene.jsx`, `ProjectNode.jsx`, `src/stories/*`, `generate_certs.py`, `.bat` launchers, the broken Colab notebook. | Steps 11, 13, 14, 16 |

---

## Part C — Fix guide (do these in order)

### Step 0 — Prerequisites and local setup

**Install:**
- Python 3.11
- Node 20 LTS
- Docker + Docker Compose v2
- ffmpeg 6+ (`ffmpeg -version`)
- Redis 7 and PostgreSQL 16, either local or via Docker:
  ```bash
  docker run -d --name harvest-redis -p 127.0.0.1:6379:6379 redis:7-alpine
  docker run -d --name harvest-pg -p 127.0.0.1:5432:5432 \
    -e POSTGRES_USER=harvest -e POSTGRES_PASSWORD=harvest_dev -e POSTGRES_DB=harvest postgres:16-alpine
  ```

**Create or switch to the working branch:**
```bash
git switch -c production-hardening
```
If that branch already exists, use `git switch production-hardening` or choose a new branch name. Do not delete `backend/aishorts.db` as part of setup. If a clean local database is intentionally needed, stop the app, make a backup, confirm the target is the development database, and move the file aside instead of deleting it.

**Add to the repo-root `.gitignore`** (append at the end):
```gitignore
# scratch space for workers, secrets, test artefacts
scratch/
**/scratch/
backend/.env
backend/.env.*
!backend/.env.example
deploy/.env
backend/tests/.tmp/
```

---

### Step 1 — Dependencies

**1.1** Replace the whole of `backend/requirements.txt`:

```text
# Harvest AI backend — runtime dependencies
fastapi>=0.115.0,<1.0.0
uvicorn[standard]>=0.30.0,<1.0.0
pydantic>=2.6.0,<3.0.0
pydantic-settings>=2.2.0,<3.0.0
SQLAlchemy>=2.0.30,<3.0.0
alembic>=1.13.0,<2.0.0
psycopg2-binary>=2.9.9,<3.0.0
celery>=5.4.0,<6.0.0
redis>=5.0.0,<6.0.0
python-multipart>=0.0.9
PyJWT>=2.8.0,<3.0.0
bcrypt>=4.1.0,<5.0.0
cryptography>=42.0.0
email-validator>=2.0.0
sentry-sdk[fastapi,celery]>=2.0.0,<3.0.0
requests>=2.31.0
openai>=1.12.0,<2.0.0

# AI / media
ultralytics>=8.1.0,<9.0.0
mediapipe==0.10.14
deep-sort-realtime>=1.3.2,<2.0.0
scipy>=1.11.0,<2.0.0
faster-whisper>=1.0.0,<2.0.0
opencv-python-headless>=4.8.0,<5.0.0
gTTS>=2.3.2
edge-tts>=7.0.0
google-cloud-speech>=2.21.0
deep-translator>=1.11.4
```

What changed: `passlib` and `python-jose` are removed (SEC-18). `PyJWT`, `bcrypt`, `cryptography` and `sentry-sdk` are added. FastAPI ≥0.115 is required for HTTP Range support in `FileResponse` (video seeking).

**1.2** Create `backend/requirements-dev.txt`:

```text
-r requirements.txt
pytest>=8.0
httpx>=0.27
fakeredis>=2.23
ruff>=0.5
pip-audit>=2.7
```

**1.3** Install:
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
```

**Verify:** `python -c "import jwt, bcrypt, cryptography, fakeredis; print('ok')"` prints `ok`.

---

### Step 2 — Configuration and secrets (fixes SEC-07, CONC-06, part of SEC-05)

**2.1** Replace the whole of `backend/app/core/config.py`:

```python
import os as _os
from typing import Literal, Optional

from cryptography.fernet import Fernet
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), "..", ".."))


class Settings(BaseSettings):
    # ---- Runtime ----
    ENV: Literal["development", "test", "production"] = "development"
    PROJECT_NAME: str = "Harvest AI"
    API_V1_STR: str = "/api/v1"
    LOG_LEVEL: str = "INFO"
    SENTRY_DSN: Optional[str] = None

    # ---- Security (SECRET_KEY and TOKEN_ENC_KEY are REQUIRED; there are no defaults on purpose) ----
    SECRET_KEY: str
    TOKEN_ENC_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 720
    FRONTEND_ORIGIN: str = "http://localhost:5173"
    # Public base URL of this API as browsers and Instagram's servers reach it (used in signed media links)
    PUBLIC_API_URL: str = "http://localhost:8000"

    # ---- Data stores ----
    DATABASE_URI: str = "sqlite:///" + _os.path.join(_BACKEND_DIR, "aishorts.db").replace("\\", "/")
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 10
    REDIS_URL: str = "redis://localhost:6379/0"

    # ---- Media ----
    MEDIA_ROOT: str = _os.path.join(_BACKEND_DIR, "uploads")
    SCRATCH_DIR: str = _os.path.join(_BACKEND_DIR, "scratch")
    MAX_UPLOAD_BYTES: int = 2 * 1024 ** 3
    MAX_VIDEO_DURATION_SECONDS: int = 3 * 3600
    MEDIA_URL_TTL_SECONDS: int = 3600
    USE_X_ACCEL_REDIRECT: bool = False  # True in production: nginx streams files from /_protected/

    # ---- Abuse limits and quotas ----
    LOGIN_ATTEMPTS_PER_15_MIN: int = 10
    MAX_UPLOADS_PER_DAY: int = 30
    MAX_RENDERS_PER_HOUR: int = 60
    MAX_PUBLISHES_PER_HOUR: int = 20
    MAX_TRANSLATIONS_PER_HOUR: int = 120
    MAX_ACTIVE_JOBS_PER_USER: int = 2
    MAX_PIPELINE_QUEUE_DEPTH: int = 200
    DAILY_VIDEO_MINUTES_PER_USER: int = 120

    # ---- Worker time limits (seconds) ----
    PIPELINE_TIME_LIMIT_SECONDS: int = 2 * 3600
    RENDER_TIME_LIMIT_SECONDS: int = 30 * 60
    PUBLISH_TIME_LIMIT_SECONDS: int = 15 * 60

    # ---- AI and third-party APIs ----
    QWEN_API_KEY: Optional[str] = None
    AUDIUS_API_BASE: str = "https://api.audius.co"
    AUDIUS_APP_NAME: str = "HARVEST_AI"
    JAMENDO_CLIENT_ID: Optional[str] = None
    FREESOUND_API_KEY: Optional[str] = None
    PIXABAY_API_KEY: Optional[str] = None

    # ---- Social OAuth apps (each user connects their OWN accounts; there are no operator tokens) ----
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/v1/users/auth/youtube/callback"
    META_APP_ID: Optional[str] = None
    META_APP_SECRET: Optional[str] = None
    META_REDIRECT_URI: str = "http://localhost:8000/api/v1/users/auth/facebook/callback"
    INSTAGRAM_REDIRECT_URI: str = "http://localhost:8000/api/v1/users/auth/instagram/callback"

    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:  # used by alembic/env.py
        return self.DATABASE_URI

    @model_validator(mode="after")
    def _validate(self) -> "Settings":
        if len(self.SECRET_KEY) < 32:
            raise ValueError(
                "SECRET_KEY must be at least 32 characters. Generate one with: "
                "python -c \"import secrets; print(secrets.token_urlsafe(48))\""
            )
        try:
            Fernet(self.TOKEN_ENC_KEY.encode())
        except Exception as exc:
            raise ValueError(
                "TOKEN_ENC_KEY must be a Fernet key. Generate one with: "
                "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            ) from exc
        if self.ENV == "production":
            if self.DATABASE_URI.startswith("sqlite"):
                raise ValueError("SQLite is not allowed in production. Set DATABASE_URI to PostgreSQL.")
            for name in ("FRONTEND_ORIGIN", "PUBLIC_API_URL"):
                if not getattr(self, name).startswith("https://"):
                    raise ValueError(f"{name} must start with https:// in production.")
        return self

    model_config = SettingsConfigDict(
        env_file=_os.path.join(_BACKEND_DIR, ".env"),
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
```

**2.2** Replace the whole of `backend/.env.example`:

```bash
# ======================================================================
# Harvest AI backend configuration. Copy to backend/.env and fill in.
# NEVER commit backend/.env.
# ======================================================================

# ---- Runtime ----
ENV=development
LOG_LEVEL=INFO
# SENTRY_DSN=https://<key>@<org>.ingest.sentry.io/<project>

# ---- Security (REQUIRED) ----
# python -c "import secrets; print(secrets.token_urlsafe(48))"
SECRET_KEY=
# python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
TOKEN_ENC_KEY=
ACCESS_TOKEN_EXPIRE_MINUTES=720
FRONTEND_ORIGIN=http://localhost:5173
PUBLIC_API_URL=http://localhost:8000

# ---- Data stores ----
DATABASE_URI=postgresql://harvest:harvest_dev@localhost:5432/harvest
REDIS_URL=redis://localhost:6379/0

# ---- Media (defaults: backend/uploads and backend/scratch) ----
# MEDIA_ROOT=/var/lib/harvest/media
# SCRATCH_DIR=/var/lib/harvest/scratch
USE_X_ACCEL_REDIRECT=false

# ---- AI / third-party ----
QWEN_API_KEY=
JAMENDO_CLIENT_ID=
FREESOUND_API_KEY=
PIXABAY_API_KEY=
# Path to a Google service-account JSON (optional, enables Google STT for short clips)
# GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/gcp-key.json

# ---- Social OAuth apps ----
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/users/auth/youtube/callback
META_APP_ID=
META_APP_SECRET=
META_REDIRECT_URI=http://localhost:8000/api/v1/users/auth/facebook/callback
INSTAGRAM_REDIRECT_URI=http://localhost:8000/api/v1/users/auth/instagram/callback
```

> Do **not** leave a variable present but empty when it has a default (e.g. `MEDIA_ROOT=`). An empty value overrides the default with `""`. Comment the line out instead.

**2.3** Create your local `backend/.env`:
```bash
cp .env.example .env
python -c "import secrets; print('SECRET_KEY=' + secrets.token_urlsafe(48))" >> .env
python -c "from cryptography.fernet import Fernet; print('TOKEN_ENC_KEY=' + Fernet.generate_key().decode())" >> .env
```
Then delete the two empty `SECRET_KEY=` / `TOKEN_ENC_KEY=` lines near the top of `.env`; the generated ones are at the bottom.

**Verify:**
- `python -c "from app.core.config import settings; print(settings.ENV, len(settings.SECRET_KEY))"` prints `development 64`.
- `SECRET_KEY=short python -c "from app.core.config import settings"` **fails** with `SECRET_KEY must be at least 32 characters`.

---

### Step 3 — Core infrastructure: database, Redis, passwords and tokens, encryption (fixes SEC-07, SEC-16, SEC-18, CONC-06)

**3.1** Replace the whole of `backend/app/core/database.py`:

```python
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import settings

DATABASE_URL = settings.DATABASE_URI

if DATABASE_URL.startswith("sqlite"):
    # Local development / tests only (production refuses SQLite in config.py)
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False, "timeout": 30})
else:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
        pool_timeout=10,
        pool_recycle=1800,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI dependency: one session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def session_scope():
    """Short-lived session for background code: commits on success, rolls back on error."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
```

**Pool sizing rule:** `(number of API processes × (DB_POOL_SIZE + DB_MAX_OVERFLOW)) + number of worker processes` must stay below Postgres `max_connections` (default 100). The Step 17 compose file sets `DB_POOL_SIZE=5`, `DB_MAX_OVERFLOW=10`: 4 API processes × 15 = 60, plus about 12 worker processes = ~72. If you add processes, lower `DB_POOL_SIZE` or put PgBouncer in front (Part E).

**3.2** Create `backend/app/core/redis_client.py`:

```python
"""One shared Redis client for rate limits, quotas, OAuth state and job control."""
from typing import Optional

import redis

from app.core.config import settings

_client: Optional[redis.Redis] = None


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.Redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_timeout=5,
            socket_connect_timeout=5,
            health_check_interval=30,
        )
    return _client


def hit_rate_limit(key: str, limit: int, window_seconds: int) -> bool:
    """Fixed-window counter. Returns True when this call goes OVER `limit` within the window."""
    r = get_redis()
    count = r.incr(key)
    if count == 1:
        r.expire(key, window_seconds)
    return count > limit
```

**3.3** Replace the whole of `backend/app/core/security.py`:

```python
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Any, Optional

import bcrypt
import jwt

from app.core.config import settings

ALGORITHM = "HS256"


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


@lru_cache(maxsize=1)
def _dummy_hash() -> bytes:
    return bcrypt.hashpw(b"timing-equaliser", bcrypt.gensalt())


def verify_password(plain_password: str, hashed_password: Optional[str]) -> bool:
    """Constant-ish time: also runs bcrypt when the user does not exist, so attackers can't time-probe emails."""
    if not hashed_password:
        bcrypt.checkpw(plain_password.encode("utf-8"), _dummy_hash())
        return False
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(subject: Any, expires_delta: Optional[timedelta] = None) -> str:
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    payload = {"sub": str(subject), "iat": now, "exp": expire, "type": "access"}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[str]:
    """Returns the user id (as a string) or None if the token is invalid, expired or not an access token."""
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[ALGORITHM], options={"require": ["exp", "sub"]}
        )
    except jwt.PyJWTError:
        return None
    if payload.get("type") != "access":
        return None
    return payload.get("sub")
```

**3.4** Create `backend/app/core/crypto.py`:

```python
"""Column type that encrypts JSON at rest (used for OAuth tokens)."""
import json

from cryptography.fernet import Fernet
from sqlalchemy.types import Text, TypeDecorator

from app.core.config import settings

_fernet = Fernet(settings.TOKEN_ENC_KEY.encode())


class EncryptedJSON(TypeDecorator):
    """Stores any JSON-serialisable value encrypted with Fernet (AES-128-CBC + HMAC-SHA256)."""

    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return _fernet.encrypt(json.dumps(value).encode("utf-8")).decode("ascii")

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return json.loads(_fernet.decrypt(value.encode("ascii")))
```

> **Key rotation (when needed):** switch `_fernet` to `MultiFernet([Fernet(new), Fernet(old)])`, re-save every `SocialConnection` row, then drop the old key. **If `TOKEN_ENC_KEY` is lost, every user must reconnect their social accounts.** Store it in your secret manager next to `SECRET_KEY`.

**Verify:**
```bash
python -c "from app.core import security as s; t=s.create_access_token(5); print(s.decode_access_token(t)); h=s.get_password_hash('pw123456'); print(s.verify_password('pw123456', h), s.verify_password('x', h), s.verify_password('x', None))"
```
Expected output: `5` then `True False False`.

---

### Step 4 — Media helpers: one storage root, one ffmpeg entry point (fixes SEC-12, SEC-14, PERF-03, BUG-04, BUG-10, QUAL-02)

**4.1** Create `backend/app/services/ffmpeg.py`:

```python
"""The ONLY place the app starts ffmpeg/ffprobe.

Every call gets:
  * a timeout (a hung ffmpeg can never pin a worker forever), and
  * -protocol_whitelist file,pipe before every input, so a malicious upload
    (e.g. an HLS/concat playlist renamed to .mp4) cannot make ffmpeg read
    other local files or fetch internal URLs.
"""
import json
import logging
import os
import subprocess
from fractions import Fraction
from typing import Optional, Sequence

logger = logging.getLogger(__name__)

PROTOCOL_WHITELIST = "file,pipe"
DEFAULT_TIMEOUT = 30 * 60


def _exe(cmd: Sequence) -> str:
    return os.path.basename(str(cmd[0])).lower()


def _harden(cmd: Sequence) -> list:
    cmd = [str(c) for c in cmd]
    if _exe(cmd).startswith("ffprobe"):
        return [cmd[0], "-protocol_whitelist", PROTOCOL_WHITELIST, *cmd[1:]]
    hardened = [cmd[0]]
    for arg in cmd[1:]:
        if arg == "-i":
            hardened += ["-protocol_whitelist", PROTOCOL_WHITELIST]
        hardened.append(arg)
    return hardened


def _check_binary(cmd: Sequence) -> None:
    if not (_exe(cmd).startswith("ffmpeg") or _exe(cmd).startswith("ffprobe")):
        raise ValueError(f"run_ffmpeg only runs ffmpeg/ffprobe, got {cmd[0]!r}")


def run_ffmpeg(cmd: Sequence, *, timeout: float = DEFAULT_TIMEOUT, check: bool = True,
               text: bool = False, input=None) -> subprocess.CompletedProcess:
    """Drop-in replacement for subprocess.run(cmd, capture_output=True, ...)."""
    _check_binary(cmd)
    return subprocess.run(_harden(cmd), capture_output=True, text=text, check=check,
                          timeout=timeout, input=input)


def popen_ffmpeg(cmd: Sequence, **kwargs) -> subprocess.Popen:
    """Drop-in replacement for subprocess.Popen(cmd, ...). Caller must wait(timeout=...)."""
    _check_binary(cmd)
    return subprocess.Popen(_harden(cmd), **kwargs)


def timeout_for(duration_seconds: Optional[float], factor: float = 3.0, minimum: int = 300) -> int:
    """Timeout scaled to media length: at least `minimum`, else `factor` x duration."""
    return max(minimum, int((duration_seconds or 0) * factor))


def probe_media(path) -> dict:
    """Reads container + video stream info. Raises ValueError if the file has no video stream."""
    result = run_ffmpeg(
        ["ffprobe", "-v", "error", "-print_format", "json",
         "-show_entries",
         "format=format_name,duration,bit_rate:stream=codec_type,width,height,avg_frame_rate,r_frame_rate,duration",
         str(path)],
        timeout=120, text=True,
    )
    data = json.loads(result.stdout or "{}")
    fmt = data.get("format") or {}
    streams = data.get("streams") or []
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    if video is None:
        raise ValueError("File has no video stream")
    # Matroska/WebM store duration on the container, not the stream (BUG-04)
    duration = _positive_float(fmt.get("duration")) or _positive_float(video.get("duration"))
    fps = _rate(video.get("avg_frame_rate")) or _rate(video.get("r_frame_rate"))
    return {
        "format_name": fmt.get("format_name", ""),
        "duration": duration,
        "resolution": f"{video.get('width')}x{video.get('height')}",
        "fps": round(fps, 2) if fps else None,
        "bitrate": fmt.get("bit_rate"),
        "has_audio": any(s.get("codec_type") == "audio" for s in streams),
    }


def _positive_float(value) -> Optional[float]:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _rate(value) -> Optional[float]:
    try:
        number = float(Fraction(value))
    except (TypeError, ValueError, ZeroDivisionError):
        return None
    return number if number > 0 else None
```

**4.2** Create `backend/app/services/storage.py`:

```python
"""All media path handling.

Paths stored in the database are RELATIVE to MEDIA_ROOT, e.g.
    originals/<user_id>/<uuid>.mp4
    clips/<video_id>/<name>.mp4
Never store absolute paths, and never build media paths anywhere else.
"""
import hashlib
import hmac
import logging
import shutil
import time
from pathlib import Path
from typing import Optional
from urllib.parse import quote

from app.core.config import settings

logger = logging.getLogger(__name__)

MEDIA_ROOT = Path(settings.MEDIA_ROOT).resolve()


def ensure_dirs() -> None:
    MEDIA_ROOT.mkdir(parents=True, exist_ok=True)
    Path(settings.SCRATCH_DIR).mkdir(parents=True, exist_ok=True)


def abs_path(stored) -> Path:
    """Absolute path for a stored (relative) path. Raises ValueError if it escapes MEDIA_ROOT."""
    p = Path(str(stored))
    full = (p if p.is_absolute() else MEDIA_ROOT / p).resolve()
    if not full.is_relative_to(MEDIA_ROOT):
        raise ValueError(f"Path is outside MEDIA_ROOT: {stored}")
    return full


def rel_path(path) -> str:
    """The value to store in the database for an absolute path inside MEDIA_ROOT."""
    return abs_path(path).relative_to(MEDIA_ROOT).as_posix()


def new_path(relative: str) -> Path:
    """Absolute path for a new file at `relative`, creating parent folders."""
    target = abs_path(relative)
    target.parent.mkdir(parents=True, exist_ok=True)
    return target


def delete(stored: Optional[str]) -> None:
    """Deletes a stored file or folder. Never raises."""
    if not stored:
        return
    try:
        target = abs_path(stored)
    except ValueError:
        logger.warning("Refusing to delete path outside MEDIA_ROOT: %s", stored)
        return
    try:
        if target.is_dir():
            shutil.rmtree(target, ignore_errors=True)
        else:
            target.unlink(missing_ok=True)
    except OSError:
        logger.warning("Could not delete %s", target, exc_info=True)


def delete_video_files(video) -> None:
    """Deletes every file that belongs to a video (original, clips, derived assets)."""
    for clip in video.clips:
        delete(clip.storage_path)
    for stored in (video.storage_path, video.audio_path, video.frame_directory, video.short_path):
        delete(stored)
    delete(f"clips/{video.id}")


# ---------- Signed, expiring media URLs ----------

def _signature(rel: str, exp: int) -> str:
    message = f"media:{rel}:{exp}".encode("utf-8")
    return hmac.new(settings.SECRET_KEY.encode("utf-8"), message, hashlib.sha256).hexdigest()


def signed_url(stored: Optional[str], ttl: Optional[int] = None) -> Optional[str]:
    """Absolute URL that lets the holder GET this one file until it expires.

    The expiry is rounded up to a TTL "bucket", so the URL stays IDENTICAL across
    repeated API calls. Browsers then keep the video buffered instead of reloading
    it on every poll. A link is valid for between 1x and 2x the TTL.
    """
    if not stored:
        return None
    try:
        rel = rel_path(stored)
    except ValueError:
        return None
    ttl = ttl or settings.MEDIA_URL_TTL_SECONDS
    exp = (int(time.time()) // ttl + 2) * ttl
    return (f"{settings.PUBLIC_API_URL.rstrip('/')}{settings.API_V1_STR}/media/"
            f"{quote(rel)}?exp={exp}&sig={_signature(rel, exp)}")


def verify_signature(rel: str, exp: int, sig: str) -> bool:
    if exp < time.time():
        return False
    return hmac.compare_digest(_signature(rel, exp), sig)
```

**Verify:**
```bash
python -c "
from app.services import storage, ffmpeg
print(ffmpeg._harden(['ffmpeg','-y','-i','a.mp4','-i','b.wav','out.mp4']))
u = storage.signed_url('clips/1/x.mp4'); print(u)
import urllib.parse as up; q = dict(up.parse_qsl(up.urlparse(u).query))
print(storage.verify_signature('clips/1/x.mp4', int(q['exp']), q['sig']), storage.verify_signature('clips/1/y.mp4', int(q['exp']), q['sig']))
try: storage.abs_path('../../etc/passwd')
except ValueError as e: print('blocked')
"
```
Expected:
- the command list has `-protocol_whitelist file,pipe` before **both** `-i` flags,
- then a URL,
- then `True False`,
- then `blocked`.

---

### Step 5 — Job control across processes (fixes CONC-04, BUG-02)

Create `backend/app/services/job_control.py`:

```python
"""Cross-process control of the video pipeline, backed by Redis.

* The API records which Celery task id currently owns a video ("job" key).
* Cancel = a Redis flag that the worker checks between pipeline stages.
* A worker whose task id is no longer the job owner was superseded by a newer
  generation (e.g. cancel then regenerate) and must stop without touching the video.
* Each task id counts its delivery attempts, so a video that keeps crashing the
  worker (out-of-memory, etc.) is failed instead of being retried forever.
"""
import logging
from typing import Dict, Optional

import redis

from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)

TTL_SECONDS = 24 * 3600
MAX_ATTEMPTS = 2

_running: Dict[int, str] = {}  # worker-process-local: video_id -> task id running here


def _job_key(video_id) -> str:
    return f"job:video:{int(video_id)}"


def _cancel_key(video_id) -> str:
    return f"cancel:video:{int(video_id)}"


def _started_key(task_id) -> str:
    return f"job:started:{task_id}"


def _attempts_key(task_id) -> str:
    return f"job:attempts:{task_id}"


# ---------- Called by the API ----------

def start_job(video_id: int, task_id: str) -> None:
    pipe = get_redis().pipeline()
    pipe.set(_job_key(video_id), task_id, ex=TTL_SECONDS)
    pipe.delete(_cancel_key(video_id))
    pipe.execute()


def current_task_id(video_id: int) -> Optional[str]:
    return get_redis().get(_job_key(video_id))


def request_cancel(video_id: int) -> None:
    get_redis().set(_cancel_key(video_id), "1", ex=TTL_SECONDS)


# ---------- Called by workers ----------

def count_attempt(task_id: str) -> int:
    """Increments and returns how many times this task id has been started."""
    r = get_redis()
    attempts = r.incr(_attempts_key(task_id))
    r.expire(_attempts_key(task_id), TTL_SECONDS)
    return attempts


def bind_worker(video_id: int, task_id: str) -> int:
    """Marks this process as running `task_id` for `video_id`. Returns the attempt number."""
    _running[int(video_id)] = task_id
    get_redis().set(_started_key(task_id), "1", ex=TTL_SECONDS)
    return count_attempt(task_id)


def unbind_worker(video_id: int) -> None:
    _running.pop(int(video_id), None)


def is_cancel_requested(video_id) -> bool:
    try:
        return get_redis().exists(_cancel_key(video_id)) == 1
    except redis.RedisError:
        logger.warning("Redis unavailable while checking cancel flag for video %s", video_id)
        return False


def is_superseded(video_id) -> bool:
    mine = _running.get(int(video_id))
    if mine is None:
        return False
    try:
        return get_redis().get(_job_key(video_id)) != mine
    except redis.RedisError:
        logger.warning("Redis unavailable while checking job owner for video %s", video_id)
        return False


def is_video_cancelled(video_id) -> bool:
    """True if the running pipeline for this video must stop now (used by master_agent)."""
    if video_id is None:
        return False
    return is_cancel_requested(video_id) or is_superseded(video_id)
```

**Verify:** `python -c "from app.services import job_control; job_control.start_job(1,'t1'); job_control.bind_worker(1,'t1'); print(job_control.is_video_cancelled(1)); job_control.start_job(1,'t2'); print(job_control.is_video_cancelled(1))"` prints `False` then `True`. This needs Redis running.

---

### Step 6 — Models and schemas (fixes SEC-04, SEC-09, SEC-12, SEC-16, SEC-18, DB-01)

**6.1** Replace the whole of `backend/app/models/social_connection.py`:

```python
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.crypto import EncryptedJSON
from app.core.database import Base


class SocialConnection(Base):
    __tablename__ = "social_connections"
    __table_args__ = (UniqueConstraint("user_id", "platform", name="uq_social_connections_user_platform"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    platform = Column(String(20), nullable=False)  # "youtube" | "facebook" | "instagram"
    account_name = Column(String(255), nullable=True)
    account_handle = Column(String(255), nullable=True)
    account_avatar = Column(String(1024), nullable=True)
    credentials = Column(EncryptedJSON, nullable=True)  # tokens: encrypted at rest, NEVER returned by the API
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="social_connections")
```

**6.2** In `backend/app/models/project.py`:

- Find:
  ```python
      title = Column(String, index=True, nullable=False)
      description = Column(String)
      owner_id = Column(Integer, ForeignKey("users.id"))
  ```
- Replace:
  ```python
      title = Column(String(120), nullable=False)
      description = Column(String(2000))
      owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
  ```

**6.3** In `backend/app/models/video.py`, make four edits:

1. Find `    status = Column(Enum(VideoStatus), default=VideoStatus.PENDING)` (inside `class Video`).
   Replace with `    status = Column(Enum(VideoStatus), default=VideoStatus.PENDING, index=True)`.
2. Find `    project_id = Column(Integer, ForeignKey("projects.id"))`.
   Replace with `    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)`.
3. Find `    video_id = Column(Integer, ForeignKey("videos.id"))`.
   Replace with `    video_id = Column(Integer, ForeignKey("videos.id", ondelete="CASCADE"), nullable=False, index=True)`.
4. Inside `class Clip`, find:
   ```python
       created_at = Column(DateTime(timezone=True), server_default=func.now())
       edit_options = Column(JSON, nullable=True)
   ```
   Replace with:
   ```python
       created_at = Column(DateTime(timezone=True), server_default=func.now())
       updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
       edit_options = Column(JSON, nullable=True)
   ```

**6.4** In `backend/app/models/user.py`:
- Find `    full_name = Column(String, index=True)`.
- Replace with `    full_name = Column(String(100))`.

**6.5** Replace the whole of `backend/app/schemas/user.py`:

```python
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = Field(default=None, max_length=100)


class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=72)

    @field_validator("password")
    @classmethod
    def _bcrypt_limit(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password is too long (maximum 72 bytes).")
        return value


class User(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    is_active: bool = True
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: User


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)
```

**6.6** Replace the whole of `backend/app/schemas/social_connection.py`:

```python
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class SocialConnection(BaseModel):
    """Public view of a connected account. Credentials are deliberately NOT part of this schema."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    platform: str
    account_name: Optional[str] = None
    account_handle: Optional[str] = None
    account_avatar: Optional[str] = None
    created_at: datetime
```

**6.7** Replace the whole of `backend/app/schemas/video.py`:

```python
import json
from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator

from app.models.video import (
    ContentAnalysisStatus,
    CropStatus,
    HighlightDetectionStatus,
    TranscriptionStatus,
    VideoStatus,
)
from app.services import storage

Platform = Literal["youtube", "facebook", "instagram"]
FramingMode = Literal["fit_blur", "fit_black", "fit", "smart_crop", "crop", "fill"]
LANGUAGE_PATTERN = r"^(none|[a-z]{2,3}(-[a-z]+)?)$"
MAX_EDIT_OPTIONS_BYTES = 1_000_000


# ------------------------------------------------------------------ requests

class MasterGenerateRequest(BaseModel):
    length: float = Field(60.0, ge=5, le=300)
    platform: Platform = "youtube"
    optional_prompt: str = Field("", max_length=500)
    audio_theme: Literal["auto", "upbeat", "cinematic", "lofi", "gaming", "hiphop",
                         "suspenseful", "ambient", "rock", "none"] = "auto"
    translate_language: str = Field("none", max_length=16, pattern=LANGUAGE_PATTERN)
    dub_voice: bool = False
    caption_language: Literal["original", "translated", "english", "none"] = "translated"
    dub_mix_mode: Literal["replace", "mix"] = "replace"
    speaker_gender: Literal["female", "male", "mixed"] = "female"
    framing_mode: FramingMode = "fit_blur"


class ClipCreate(BaseModel):
    title: Optional[str] = Field(None, max_length=120)
    start_time: float = Field(ge=0)
    end_time: float = Field(gt=0)
    edit_options: Optional[dict] = None

    @model_validator(mode="after")
    def _check(self) -> "ClipCreate":
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be greater than start_time")
        if self.end_time - self.start_time > 600:
            raise ValueError("A clip can be at most 10 minutes long")
        if self.edit_options is not None and len(json.dumps(self.edit_options)) > MAX_EDIT_OPTIONS_BYTES:
            raise ValueError("edit_options is too large")
        return self


class ClipPublishRequest(BaseModel):
    platforms: List[Platform] = Field(min_length=1, max_length=3)
    title: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field(None, max_length=5000)
    privacy: Literal["public", "unlisted", "private"] = "public"
    force: bool = False  # True = publish again even if this platform already has a URL


class TranslateTranscriptRequest(BaseModel):
    words: List[dict] = Field(max_length=20000)
    target_lang: str = Field(max_length=16, pattern=LANGUAGE_PATTERN)


# ------------------------------------------------------------------ responses

class ClipSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: Optional[str] = None
    status: str
    storage_path: Optional[str] = Field(default=None, exclude=True)  # read from ORM, never sent

    @computed_field
    @property
    def media_url(self) -> Optional[str]:
        return storage.signed_url(self.storage_path)


class Clip(ClipSummary):
    video_id: int
    start_time: float
    end_time: float
    duration: float
    created_at: Optional[datetime] = None
    edit_options: Optional[dict] = None
    published_urls: Optional[dict] = None


class _VideoBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    original_filename: str
    status: Optional[VideoStatus] = None
    duration: Optional[float] = None
    resolution: Optional[str] = None
    fps: Optional[float] = None
    transcription_status: Optional[TranscriptionStatus] = None
    analysis_status: Optional[ContentAnalysisStatus] = None
    highlight_status: Optional[HighlightDetectionStatus] = None
    crop_status: Optional[CropStatus] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    storage_path: Optional[str] = Field(default=None, exclude=True)

    @computed_field
    @property
    def media_url(self) -> Optional[str]:
        return storage.signed_url(self.storage_path)


class VideoSummary(_VideoBase):
    """Lightweight shape for lists (no transcript / analysis / crop data)."""

    clips: List[ClipSummary] = []


class Video(_VideoBase):
    """Full shape for a single video."""

    bitrate: Optional[str] = None
    transcript: Optional[list] = None
    content_analysis: Optional[dict] = None
    highlights: Optional[dict] = None
    crop_metadata: Optional[dict] = None
    clips: List[Clip] = []
```

**6.8** Replace the whole of `backend/app/schemas/project.py`:

```python
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from .video import VideoSummary


class ProjectBase(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=2000)


class ProjectCreate(ProjectBase):
    """owner_id is NOT accepted from clients; the server sets it from the logged-in user."""


class Project(ProjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    videos: List[VideoSummary] = []
```

**6.9** Replace the whole of `backend/app/schemas/__init__.py`:

```python
from .project import Project, ProjectCreate
from .social_connection import SocialConnection
from .user import LoginRequest, Token, User, UserCreate
from .video import (
    Clip,
    ClipCreate,
    ClipPublishRequest,
    ClipSummary,
    MasterGenerateRequest,
    TranslateTranscriptRequest,
    Video,
    VideoSummary,
)
```

**Verify:** `python -c "import app.models, app.schemas; print('ok')"` prints `ok`.

---

### Step 7 — Authentication dependency, router wiring, health, media endpoint (fixes SEC-01, SEC-02, SEC-12, OPS-01)

**7.1** Replace the whole of `backend/app/api/deps.py`:

```python
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app import models
from app.core import security
from app.core.config import settings
from app.core.database import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/users/login", auto_error=False)


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    db: Session = Depends(get_db),
    token: Optional[str] = Depends(oauth2_scheme),
) -> models.User:
    """The logged-in user. Missing or invalid token => 401. There is NO fallback user."""
    if not token:
        raise _unauthorized()
    subject = security.decode_access_token(token)
    if not subject or not subject.isdigit():
        raise _unauthorized()
    user = db.get(models.User, int(subject))
    if user is None or not user.is_active:
        raise _unauthorized()
    return user


# Ownership helpers: return 404 (not 403) so we never confirm that someone else's id exists.

def get_owned_project(
    project_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> models.Project:
    project = (
        db.query(models.Project)
        .filter(models.Project.id == project_id, models.Project.owner_id == user.id)
        .first()
    )
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def get_owned_video(
    video_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> models.Video:
    video = (
        db.query(models.Video)
        .join(models.Project, models.Video.project_id == models.Project.id)
        .filter(models.Video.id == video_id, models.Project.owner_id == user.id)
        .first()
    )
    if video is None:
        raise HTTPException(status_code=404, detail="Video not found")
    return video


def get_owned_clip(
    clip_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> models.Clip:
    clip = (
        db.query(models.Clip)
        .join(models.Video, models.Clip.video_id == models.Video.id)
        .join(models.Project, models.Video.project_id == models.Project.id)
        .filter(models.Clip.id == clip_id, models.Project.owner_id == user.id)
        .first()
    )
    if clip is None:
        raise HTTPException(status_code=404, detail="Clip not found")
    return clip
```

**7.2** Replace the whole of `backend/app/api/api_v1/api.py`:

```python
from fastapi import APIRouter, Depends

from app.api.deps import get_current_user

from .endpoints import health, media, projects, users, videos

# Every route in these routers requires a valid token.
requires_auth = [Depends(get_current_user)]

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])                     # public: /healthz, /readyz
api_router.include_router(media.router, prefix="/media", tags=["media"])      # public, but every URL is signed
api_router.include_router(users.router, prefix="/users", tags=["users"])      # per-route auth (login/register/OAuth callback are public)
api_router.include_router(projects.router, prefix="/projects", tags=["projects"], dependencies=requires_auth)
api_router.include_router(videos.router, prefix="/videos", tags=["videos"], dependencies=requires_auth)
```

**7.3** Replace the whole of `backend/app/api/api_v1/endpoints/health.py`:

```python
import logging

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.redis_client import get_redis

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/healthz")
def liveness():
    """The process is up. Used by the container/orchestrator to restart a dead process."""
    return {"status": "ok"}


@router.get("/readyz")
def readiness(db: Session = Depends(get_db)):
    """Dependencies are reachable. Used by the load balancer: 503 takes this instance out of rotation."""
    checks = {}
    try:
        db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        logger.exception("Readiness: database check failed")
        checks["database"] = "error"
    try:
        get_redis().ping()
        checks["redis"] = "ok"
    except Exception:
        logger.exception("Readiness: redis check failed")
        checks["redis"] = "error"
    if any(value != "ok" for value in checks.values()):
        return JSONResponse(status_code=503, content={"status": "error", **checks})
    return {"status": "ok", **checks}
```

**7.4** Create `backend/app/api/api_v1/endpoints/media.py`:

```python
import mimetypes
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import FileResponse

from app.core.config import settings
from app.services import storage

router = APIRouter()


@router.get("/{rel_path:path}")
def get_media(rel_path: str, exp: int = Query(...), sig: str = Query(..., max_length=128)):
    """Serves one media file to whoever holds a valid signed URL (see storage.signed_url)."""
    if not storage.verify_signature(rel_path, exp, sig):
        raise HTTPException(status_code=403, detail="This link has expired or is invalid.")
    try:
        target = storage.abs_path(rel_path)
    except ValueError:
        raise HTTPException(status_code=404, detail="Not found")
    if not target.is_file():
        raise HTTPException(status_code=404, detail="Not found")

    headers = {"Cache-Control": "private, max-age=3600"}
    media_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
    if settings.USE_X_ACCEL_REDIRECT:
        # Production: nginx streams the bytes (with Range support) from its internal /_protected/ location.
        headers["X-Accel-Redirect"] = f"/_protected/{quote(storage.rel_path(target))}"
        return Response(headers=headers, media_type=media_type)
    return FileResponse(target, headers=headers, media_type=media_type)
```

---

### Step 8 — Projects endpoints (fixes SEC-01, SEC-09, BUG-10)

Replace the whole of `backend/app/api/api_v1/endpoints/projects.py`:

```python
from typing import List

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session, selectinload

from app import models, schemas
from app.api.deps import get_current_user, get_owned_project
from app.core.database import get_db
from app.services import job_control, storage

router = APIRouter()


@router.post("/", response_model=schemas.Project, status_code=201)
def create_project(
    project_in: schemas.ProjectCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    project = models.Project(**project_in.model_dump(), owner_id=user.id)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/", response_model=List[schemas.Project])
def read_projects(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    return (
        db.query(models.Project)
        .options(selectinload(models.Project.videos).selectinload(models.Video.clips))
        .filter(models.Project.owner_id == user.id)
        .order_by(models.Project.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.get("/{project_id}", response_model=schemas.Project)
def read_project(project: models.Project = Depends(get_owned_project)):
    return project


@router.delete("/{project_id}", status_code=204)
def delete_project(
    project: models.Project = Depends(get_owned_project),
    db: Session = Depends(get_db),
):
    for video in project.videos:
        if video.status == models.VideoStatus.PROCESSING:
            job_control.request_cancel(video.id)
        storage.delete_video_files(video)
    db.delete(project)
    db.commit()
    return Response(status_code=204)
```

---

### Step 9 — Video endpoints (fixes SEC-01, SEC-06, SEC-13, SEC-14, SEC-21, BUG-02, BUG-07, BUG-11, CONC-02, CONC-03, CONC-08, PERF-08, PERF-09)

Replace the whole of `backend/app/api/api_v1/endpoints/videos.py`.

Removed on purpose:
- `/transcribe`, `/analyze`, `/detect-highlights` and `/smart-crop`. They never worked (BUG-07).
- The system-wide `cancel-all`. `POST /videos/cancel-all` now cancels **only the caller's** jobs.

```python
import logging
import math
import uuid
from datetime import date
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.orm.attributes import flag_modified

from app import models, schemas
from app.api.deps import get_current_user, get_owned_clip, get_owned_video
from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.database import get_db
from app.core.redis_client import get_redis, hit_rate_limit
from app.services import job_control, storage
from app.services.ffmpeg import probe_media
from app.tasks.video_tasks import generate_master_shorts_task, publish_video_task, render_clip_task

logger = logging.getLogger(__name__)
router = APIRouter()

ALLOWED_EXTENSIONS = {".mp4", ".mkv", ".avi", ".mov", ".webm", ".flv"}
# ffprobe container names we accept. Checked against the file CONTENT, not its name (SEC-14).
ALLOWED_CONTAINERS = {"mov,mp4,m4a,3gp,3g2,mj2", "matroska,webm", "avi", "flv"}
CHUNK_SIZE = 1024 * 1024
VARIATION_TITLE = "Master Variation"
TOTAL_VARIATIONS = 5
PIPELINE_QUEUE = "pipeline"


# ------------------------------------------------------------------ helpers

def _reset_stage_fields(video: models.Video) -> None:
    video.transcription_status = models.TranscriptionStatus.NONE
    video.analysis_status = models.ContentAnalysisStatus.NONE
    video.highlight_status = models.HighlightDetectionStatus.NONE
    video.crop_status = models.CropStatus.NONE


def _enqueue(task, args: list, task_id: Optional[str] = None) -> None:
    """Sends a task to the broker, or raises 503 if the broker is unreachable."""
    try:
        task.apply_async(args=args, task_id=task_id)
    except Exception:
        logger.exception("Could not enqueue %s", task.name)
        raise HTTPException(503, "The processing service is temporarily unavailable. Please try again shortly.")


def _usage_key(user_id: int) -> str:
    return f"usage:minutes:{user_id}:{date.today().isoformat()}"


def _check_generation_quota(db: Session, user: models.User, video: models.Video) -> int:
    """Raises 429/503 if this user or the system is over its limits. Returns the minutes this job costs."""
    active = (
        db.query(func.count(models.Video.id))
        .join(models.Project, models.Video.project_id == models.Project.id)
        .filter(models.Project.owner_id == user.id, models.Video.status == models.VideoStatus.PROCESSING)
        .scalar()
    )
    if active >= settings.MAX_ACTIVE_JOBS_PER_USER:
        raise HTTPException(
            429, f"You can run {settings.MAX_ACTIVE_JOBS_PER_USER} generations at a time. Wait for one to finish."
        )
    r = get_redis()
    if r.llen(PIPELINE_QUEUE) >= settings.MAX_PIPELINE_QUEUE_DEPTH:
        raise HTTPException(
            503, "We are at capacity right now. Please try again in a few minutes.", headers={"Retry-After": "120"}
        )
    minutes = max(1, math.ceil((video.duration or 0) / 60))
    used = int(r.get(_usage_key(user.id)) or 0)
    if used + minutes > settings.DAILY_VIDEO_MINUTES_PER_USER:
        raise HTTPException(429, "You have reached today's processing limit. It resets at midnight UTC.")
    return minutes


def _charge_minutes(user_id: int, minutes: int) -> None:
    r = get_redis()
    key = _usage_key(user_id)
    r.incrby(key, minutes)
    r.expire(key, 2 * 86400)


def _cancel(video: models.Video) -> None:
    """Stops this video's pipeline wherever it runs. The caller commits."""
    job_control.request_cancel(video.id)
    task_id = job_control.current_task_id(video.id)
    if task_id:
        try:
            celery_app.control.revoke(task_id)  # drops it if not started; a running task stops at its next checkpoint
        except Exception:
            logger.warning("Could not broadcast revoke for task %s", task_id, exc_info=True)
    video.status = models.VideoStatus.FAILED
    _reset_stage_fields(video)


# ------------------------------------------------------------------ upload and read

@router.post("/", response_model=schemas.Video, status_code=201)
def upload_video(
    project_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    # Plain `def` (not async): FastAPI runs it in a worker thread, so blocking I/O never freezes the event loop.
    project = (
        db.query(models.Project)
        .filter(models.Project.id == project_id, models.Project.owner_id == user.id)
        .first()
    )
    if project is None:
        raise HTTPException(404, "Project not found")
    if hit_rate_limit(f"rl:upload:{user.id}", settings.MAX_UPLOADS_PER_DAY, 86400):
        raise HTTPException(429, "Daily upload limit reached. Please try again tomorrow.")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file type. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}")

    rel = f"originals/{user.id}/{uuid.uuid4().hex}{ext}"
    dest = storage.new_path(rel)
    try:
        written = 0
        with open(dest, "wb") as out:
            while chunk := file.file.read(CHUNK_SIZE):
                written += len(chunk)
                if written > settings.MAX_UPLOAD_BYTES:
                    raise HTTPException(413, f"File too large. Maximum is {settings.MAX_UPLOAD_BYTES // 1024 ** 3} GB.")
                out.write(chunk)
        try:
            meta = probe_media(dest)
        except Exception:
            raise HTTPException(400, "This file could not be read as a video.")
        if meta["format_name"] not in ALLOWED_CONTAINERS:
            raise HTTPException(400, "Unsupported video format.")
        if not meta["duration"]:
            raise HTTPException(400, "Could not determine the video length.")
        if meta["duration"] > settings.MAX_VIDEO_DURATION_SECONDS:
            raise HTTPException(400, f"Videos can be at most {settings.MAX_VIDEO_DURATION_SECONDS // 3600} hours long.")
    except BaseException:
        dest.unlink(missing_ok=True)
        raise

    video = models.Video(
        original_filename=(file.filename or "video")[:255],
        storage_path=rel,
        project_id=project.id,
        duration=meta["duration"],
        resolution=meta["resolution"],
        fps=meta["fps"],
        bitrate=meta["bitrate"],
        status=models.VideoStatus.COMPLETED,  # "uploaded and ready to generate"
    )
    db.add(video)
    db.commit()
    db.refresh(video)
    return video


@router.get("/", response_model=List[schemas.VideoSummary])
def read_videos(
    project_id: Optional[int] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    query = (
        db.query(models.Video)
        .join(models.Project, models.Video.project_id == models.Project.id)
        .options(selectinload(models.Video.clips))
        .filter(models.Project.owner_id == user.id)
    )
    if project_id is not None:
        query = query.filter(models.Video.project_id == project_id)
    return query.order_by(models.Video.id.desc()).offset(skip).limit(limit).all()


@router.get("/{video_id}", response_model=schemas.Video)
def read_video(video: models.Video = Depends(get_owned_video)):
    return video


@router.delete("/{video_id}", status_code=204)
def delete_video(video: models.Video = Depends(get_owned_video), db: Session = Depends(get_db)):
    if video.status == models.VideoStatus.PROCESSING:
        _cancel(video)
    storage.delete_video_files(video)
    db.delete(video)
    db.commit()
    return Response(status_code=204)


# ------------------------------------------------------------------ master generation

@router.post("/{video_id}/master-generate", response_model=schemas.Video, status_code=202)
def generate_master_shorts(
    request: schemas.MasterGenerateRequest,
    video: models.Video = Depends(get_owned_video),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if video.status == models.VideoStatus.PROCESSING:
        raise HTTPException(409, "A generation is already running for this video.")
    minutes = _check_generation_quota(db, user, video)

    # Atomic claim: only one request can move this video into PROCESSING (CONC-02).
    claimed = (
        db.query(models.Video)
        .filter(models.Video.id == video.id, models.Video.status != models.VideoStatus.PROCESSING)
        .update(
            {
                models.Video.status: models.VideoStatus.PROCESSING,
                models.Video.transcription_status: models.TranscriptionStatus.NONE,
                models.Video.analysis_status: models.ContentAnalysisStatus.NONE,
                models.Video.highlight_status: models.HighlightDetectionStatus.NONE,
                models.Video.crop_status: models.CropStatus.NONE,
            },
            synchronize_session=False,
        )
    )
    db.commit()
    if not claimed:
        raise HTTPException(409, "A generation is already running for this video.")

    task_id = uuid.uuid4().hex
    job_control.start_job(video.id, task_id)
    try:
        _enqueue(
            generate_master_shorts_task,
            [
                video.id, request.length, request.platform, request.optional_prompt,
                request.translate_language, request.dub_voice, request.caption_language,
                request.dub_mix_mode, request.speaker_gender, request.audio_theme, request.framing_mode,
            ],
            task_id=task_id,
        )
    except HTTPException:
        db.query(models.Video).filter(models.Video.id == video.id).update(
            {models.Video.status: models.VideoStatus.FAILED}, synchronize_session=False
        )
        db.commit()
        raise
    _charge_minutes(user.id, minutes)
    db.refresh(video)
    return video


@router.get("/{video_id}/variations", response_model=List[schemas.Clip])
def get_master_variations(video: models.Video = Depends(get_owned_video), db: Session = Depends(get_db)):
    clips = (
        db.query(models.Clip)
        .filter(models.Clip.video_id == video.id, models.Clip.title.like(f"%{VARIATION_TITLE}%"))
        .order_by(models.Clip.id.desc())
        .all()
    )
    unique, seen = [], set()
    for clip in clips:
        key = clip.title or str(clip.id)
        if key not in seen:
            seen.add(key)
            unique.append(clip)
        if len(unique) >= TOTAL_VARIATIONS:
            break
    return list(reversed(unique))


@router.get("/{video_id}/status")
def get_video_status(video: models.Video = Depends(get_owned_video), db: Session = Depends(get_db)):
    """Cheap progress read for the UI: one indexed COUNT, no ML imports (PERF-09)."""
    ready = (
        db.query(func.count(models.Clip.id))
        .filter(
            models.Clip.video_id == video.id,
            models.Clip.title.like(f"%{VARIATION_TITLE}%"),
            models.Clip.status == models.ClipStatus.COMPLETED,
        )
        .scalar()
    )

    def value(enum_value, default="none"):
        return enum_value.value if enum_value else default

    video_status = value(video.status, "pending")
    transcription = value(video.transcription_status)
    analysis = value(video.analysis_status)
    highlight = value(video.highlight_status)
    crop = value(video.crop_status)
    if ready > 0:
        transcription = analysis = highlight = crop = "completed"

    # Done = all 5 ready, OR the job finished with at least one variation (BUG-11)
    is_done = ready >= TOTAL_VARIATIONS or (video_status == "completed" and ready > 0)

    if video_status == "failed":
        stage, label = "failed", "Generation failed or was cancelled."
    elif is_done:
        stage, label = "done", f"{ready} variation{'s' if ready != 1 else ''} ready."
    elif video_status == "processing":
        if ready > 0:
            stage, label = "rendering", f"Rendering variations ({ready}/{TOTAL_VARIATIONS} ready)..."
        elif crop == "processing":
            stage, label = "cropping", "Computing 9:16 dynamic framing..."
        elif highlight == "processing":
            stage, label = "highlighting", "Detecting viral highlights..."
        elif analysis == "processing":
            stage, label = "analyzing", "Running AI content analysis..."
        elif transcription == "processing":
            stage, label = "transcribing", "Transcribing audio..."
        else:
            stage, label = "rendering", "Rendering animated variations..."
    else:
        stage, label = "idle", "Ready to generate"

    return {
        "video_id": video.id,
        "original_filename": video.original_filename or f"Video {video.id}",
        "stage": stage,
        "stage_label": label,
        "video_status": video_status,
        "transcription_status": transcription,
        "analysis_status": analysis,
        "highlight_status": highlight,
        "crop_status": crop,
        "variations_ready": ready,
        "variations_total": TOTAL_VARIATIONS,
        "is_done": is_done,
        "is_complete": is_done,
    }


@router.post("/{video_id}/cancel-generation")
def cancel_generation(video: models.Video = Depends(get_owned_video), db: Session = Depends(get_db)):
    if video.status != models.VideoStatus.PROCESSING:
        return {"success": True, "message": "No generation is running."}
    _cancel(video)
    db.commit()
    return {"success": True, "message": "Generation cancelled."}


@router.post("/cancel-all")
def cancel_all_my_generations(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Cancels the CALLER's running generations only (SEC-06)."""
    videos = (
        db.query(models.Video)
        .join(models.Project, models.Video.project_id == models.Project.id)
        .filter(models.Project.owner_id == user.id, models.Video.status == models.VideoStatus.PROCESSING)
        .all()
    )
    for video in videos:
        _cancel(video)
    db.commit()
    return {"success": True, "cancelled_count": len(videos), "message": "Your active generations were cancelled."}


# ------------------------------------------------------------------ clips

@router.get("/{video_id}/clips", response_model=List[schemas.Clip])
def get_clips(video: models.Video = Depends(get_owned_video), db: Session = Depends(get_db)):
    return db.query(models.Clip).filter(models.Clip.video_id == video.id).order_by(models.Clip.id).all()


@router.post("/{video_id}/clips", response_model=schemas.Clip, status_code=202)
def render_clip(
    clip_in: schemas.ClipCreate,
    video: models.Video = Depends(get_owned_video),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if hit_rate_limit(f"rl:render:{user.id}", settings.MAX_RENDERS_PER_HOUR, 3600):
        raise HTTPException(429, "Too many render requests. Please wait a bit.")
    if video.duration and clip_in.end_time > video.duration + 0.5:
        raise HTTPException(400, "The clip ends after the video does.")
    clip = models.Clip(
        video_id=video.id,
        title=clip_in.title,
        start_time=clip_in.start_time,
        end_time=clip_in.end_time,
        duration=clip_in.end_time - clip_in.start_time,
        status=models.ClipStatus.PENDING,
        edit_options=clip_in.edit_options,
    )
    db.add(clip)
    db.commit()
    db.refresh(clip)
    try:
        _enqueue(render_clip_task, [clip.id])
    except HTTPException:
        clip.status = models.ClipStatus.FAILED
        db.commit()
        raise
    return clip


@router.get("/clips/{clip_id}", response_model=schemas.Clip)
def read_clip(clip: models.Clip = Depends(get_owned_clip)):
    return clip


@router.put("/clips/{clip_id}", response_model=schemas.Clip, status_code=202)
def update_clip(
    clip_in: schemas.ClipCreate,
    clip: models.Clip = Depends(get_owned_clip),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if clip.status in (models.ClipStatus.PENDING, models.ClipStatus.RENDERING):
        raise HTTPException(409, "This clip is already rendering.")
    if hit_rate_limit(f"rl:render:{user.id}", settings.MAX_RENDERS_PER_HOUR, 3600):
        raise HTTPException(429, "Too many render requests. Please wait a bit.")
    if clip.video.duration and clip_in.end_time > clip.video.duration + 0.5:
        raise HTTPException(400, "The clip ends after the video does.")
    clip.title = clip_in.title
    clip.start_time = clip_in.start_time
    clip.end_time = clip_in.end_time
    clip.duration = clip_in.end_time - clip_in.start_time
    clip.status = models.ClipStatus.PENDING
    clip.edit_options = clip_in.edit_options
    db.commit()
    try:
        _enqueue(render_clip_task, [clip.id])
    except HTTPException:
        clip.status = models.ClipStatus.FAILED
        db.commit()
        raise
    db.refresh(clip)
    return clip


@router.post("/clips/{clip_id}/publish", status_code=202)
def publish_clip(
    request: schemas.ClipPublishRequest,
    clip: models.Clip = Depends(get_owned_clip),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if clip.status != models.ClipStatus.COMPLETED or not clip.storage_path:
        raise HTTPException(409, "This clip has not finished rendering yet.")
    platforms = list(dict.fromkeys(request.platforms))  # de-duplicate, keep order
    connected = {
        row.platform
        for row in db.query(models.SocialConnection.platform).filter(models.SocialConnection.user_id == user.id)
    }
    missing = [p for p in platforms if p not in connected]
    if missing:
        raise HTTPException(400, f"Connect your {', '.join(missing)} account first.")
    if hit_rate_limit(f"rl:publish:{user.id}", settings.MAX_PUBLISHES_PER_HOUR, 3600):
        raise HTTPException(429, "Too many publish requests. Please wait a bit.")

    # Lock the row so two clicks can't both start a publish (CONC-03). SQLite ignores FOR UPDATE; Postgres honours it.
    locked = (
        db.query(models.Clip).filter(models.Clip.id == clip.id).with_for_update().populate_existing().one()
    )
    urls = dict(locked.published_urls or {})
    for platform in platforms:
        current = str(urls.get(platform) or "")
        if current == "publishing":
            raise HTTPException(409, f"Already publishing to {platform}.")
        if current.startswith("http") and not request.force:
            raise HTTPException(409, f"Already published to {platform}. Send force=true to publish again.")
    for platform in platforms:
        urls[platform] = "publishing"
    locked.published_urls = urls
    flag_modified(locked, "published_urls")
    db.commit()

    payload = {"platforms": platforms, "title": request.title, "description": request.description,
               "privacy": request.privacy}
    try:
        _enqueue(publish_video_task, [clip.id, payload])
    except HTTPException:
        for platform in platforms:
            urls[platform] = "error: service unavailable"
        locked.published_urls = dict(urls)
        flag_modified(locked, "published_urls")
        db.commit()
        raise
    return {"message": "Publishing started", "clip_id": clip.id}


# ------------------------------------------------------------------ translation preview

@router.post("/translate-transcript")
def translate_transcript(
    request: schemas.TranslateTranscriptRequest,
    user: models.User = Depends(get_current_user),
):
    if hit_rate_limit(f"rl:translate:{user.id}", settings.MAX_TRANSLATIONS_PER_HOUR, 3600):
        raise HTTPException(429, "Too many translation requests. Please wait a bit.")
    from app.services.translation_service import translate_and_distribute_words

    try:
        return translate_and_distribute_words(request.words, request.target_lang)
    except Exception:
        logger.exception("Translation failed for user %s", user.id)
        raise HTTPException(502, "Translation failed. Please try again.")
```

**Verify:** `python -c "from app.api.api_v1.endpoints import videos; print(len(videos.router.routes))"` prints `15`. Full behaviour is checked by the tests in Step 18.

---

### Step 10 — User endpoints: login, connections, OAuth (fixes SEC-01, SEC-04, SEC-10, SEC-11, SEC-13, SEC-21)

Replace the whole of `backend/app/api/api_v1/endpoints/users.py`.

**What changed for the frontend:**
- `/users/{id}/connections` becomes `/users/me/connections`.
- `POST .../connections` (manual token paste) is removed.
- The browser asks `GET /users/me/auth/{platform}/url` for the sign-in URL, then opens it in a popup.

```python
import json
import logging
import secrets
from typing import List, Literal

import requests
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import HTMLResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from urllib.parse import urlencode

from app import models, schemas
from app.api.deps import get_current_user
from app.core import security
from app.core.config import settings
from app.core.database import get_db
from app.core.redis_client import get_redis, hit_rate_limit
from app.services.social_publish_service import SocialPublishService

logger = logging.getLogger(__name__)
router = APIRouter()

Platform = Literal["youtube", "facebook", "instagram"]
OAUTH_STATE_TTL_SECONDS = 600
GRAPH = "https://graph.facebook.com/v20.0"


class _UserFacingError(Exception):
    """An OAuth problem whose message is safe and useful to show the user."""


def _client_ip(request: Request) -> str:
    # Correct behind nginx because uvicorn runs with --proxy-headers (Step 17)
    return request.client.host if request.client else "unknown"


# ------------------------------------------------------------------ account

@router.post("/register", response_model=schemas.Token, status_code=201)
def register_user(user_in: schemas.UserCreate, request: Request, db: Session = Depends(get_db)):
    if hit_rate_limit(f"rl:register:{_client_ip(request)}", 5, 3600):
        raise HTTPException(429, "Too many sign-ups from this network. Please try again later.")
    email = user_in.email.lower()
    if db.query(models.User).filter(models.User.email == email).first():
        raise HTTPException(409, "An account with this email already exists.")
    user = models.User(
        email=email,
        full_name=user_in.full_name,
        hashed_password=security.get_password_hash(user_in.password),
        is_active=True,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "An account with this email already exists.")
    db.refresh(user)
    return schemas.Token(access_token=security.create_access_token(user.id), user=user)


@router.post("/login", response_model=schemas.Token)
def login_user(login_in: schemas.LoginRequest, request: Request, db: Session = Depends(get_db)):
    email = login_in.email.lower()
    ip = _client_ip(request)
    too_many = hit_rate_limit(f"rl:login:{ip}:{email}", settings.LOGIN_ATTEMPTS_PER_15_MIN, 900)
    too_many_ip = hit_rate_limit(f"rl:login-ip:{ip}", settings.LOGIN_ATTEMPTS_PER_15_MIN * 5, 900)
    if too_many or too_many_ip:
        raise HTTPException(429, "Too many login attempts. Please try again in 15 minutes.")
    user = db.query(models.User).filter(models.User.email == email).first()
    password_ok = security.verify_password(login_in.password, user.hashed_password if user else None)
    if not user or not password_ok or not user.is_active:
        raise HTTPException(401, "Incorrect email or password.")
    return schemas.Token(access_token=security.create_access_token(user.id), user=user)


@router.get("/me", response_model=schemas.User)
def get_user_me(user: models.User = Depends(get_current_user)):
    return user


# ------------------------------------------------------------------ social connections (current user only)

@router.get("/me/connections", response_model=List[schemas.SocialConnection])
def read_my_connections(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(models.SocialConnection)
        .filter(models.SocialConnection.user_id == user.id)
        .order_by(models.SocialConnection.platform)
        .all()
    )


@router.delete("/me/connections/{platform}", status_code=204)
def delete_my_connection(
    platform: Platform, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    connection = (
        db.query(models.SocialConnection)
        .filter(models.SocialConnection.user_id == user.id, models.SocialConnection.platform == platform)
        .first()
    )
    if connection is None:
        raise HTTPException(404, "Connection not found")
    db.delete(connection)
    db.commit()
    return Response(status_code=204)


@router.get("/me/auth/{platform}/url")
def oauth_authorize_url(platform: Platform, user: models.User = Depends(get_current_user)):
    """Returns the provider sign-in URL with a random, single-use, 10-minute `state` (SEC-10)."""
    state = secrets.token_urlsafe(32)
    if platform == "youtube":
        if not (settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET):
            raise HTTPException(503, "YouTube connections are not available right now.")
        url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode({
            "response_type": "code",
            "client_id": settings.GOOGLE_CLIENT_ID,
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            "scope": "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
            "state": state,
            "access_type": "offline",
            "prompt": "consent",
        })
    else:
        if not (settings.META_APP_ID and settings.META_APP_SECRET):
            raise HTTPException(503, "Facebook and Instagram connections are not available right now.")
        scope = "pages_show_list,pages_read_engagement,pages_manage_posts,publish_video"
        if platform == "instagram":
            scope += ",instagram_basic,instagram_content_publish"
        redirect_uri = settings.META_REDIRECT_URI if platform == "facebook" else settings.INSTAGRAM_REDIRECT_URI
        url = "https://www.facebook.com/v20.0/dialog/oauth?" + urlencode({
            "client_id": settings.META_APP_ID,
            "redirect_uri": redirect_uri,
            "scope": scope,
            "state": state,
        })
    get_redis().set(f"oauth:state:{state}", f"{user.id}:{platform}", ex=OAUTH_STATE_TTL_SECONDS)
    return {"url": url}


# ------------------------------------------------------------------ OAuth callback (public: the provider redirects here)

def _js(value) -> str:
    """JSON-encodes a value so it is safe INSIDE an HTML <script> block (SEC-11)."""
    return (
        json.dumps(value)
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("&", "\\u0026")
        .replace("\u2028", "\\u2028")
        .replace("\u2029", "\\u2029")
    )


def _popup_result(payload: dict) -> HTMLResponse:
    nonce = secrets.token_urlsafe(16)
    html = (
        "<!doctype html><html><body>"
        f'<script nonce="{nonce}">'
        f"if (window.opener) {{ window.opener.postMessage({_js(payload)}, {_js(settings.FRONTEND_ORIGIN)}); }}"
        "window.close();"
        "</script></body></html>"
    )
    return HTMLResponse(
        html,
        headers={
            "Content-Security-Policy": f"default-src 'none'; script-src 'nonce-{nonce}'",
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
        },
    )


def _failure(message: str = "Connection failed. Please try again.") -> HTMLResponse:
    return _popup_result({"type": "HARVEST_AUTH_FAILURE", "error": message})


@router.get("/auth/{platform}/callback", response_class=HTMLResponse)
def platform_callback(
    platform: Platform,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_message: str | None = None,
    error_description: str | None = None,
    db: Session = Depends(get_db),
):
    stored = get_redis().getdel(f"oauth:state:{state}") if state else None
    if not stored:
        return _failure("This sign-in link has expired. Please try again.")
    user_id_text, _, state_platform = stored.partition(":")
    if state_platform != platform:
        return _failure()
    if error or error_message or error_description:
        logger.info("OAuth %s not granted for user %s: %s", platform, user_id_text,
                    error or error_message or error_description)
        return _failure("Access was not granted.")
    if not code:
        return _failure()
    user = db.get(models.User, int(user_id_text))
    if user is None or not user.is_active:
        return _failure()

    try:
        if platform == "youtube":
            _connect_youtube(db, user.id, code)
        else:
            _connect_meta(db, user.id, platform, code)
    except _UserFacingError as exc:
        db.rollback()
        return _failure(str(exc))
    except Exception:
        db.rollback()
        logger.exception("OAuth callback failed for %s (user %s)", platform, user.id)
        return _failure()
    return _popup_result({"type": "HARVEST_AUTH_SUCCESS", "platform": platform})


def _save_connection(db: Session, user_id: int, platform: str, details: dict) -> None:
    connection = (
        db.query(models.SocialConnection)
        .filter(models.SocialConnection.user_id == user_id, models.SocialConnection.platform == platform)
        .first()
    )
    credentials = dict(details.get("credentials") or {})
    if connection:
        previous = connection.credentials or {}
        # Google only returns a refresh token on first consent; keep the one we already have.
        if platform == "youtube" and not credentials.get("youtube_refresh_token") and previous.get("youtube_refresh_token"):
            credentials["youtube_refresh_token"] = previous["youtube_refresh_token"]
        connection.account_name = details.get("account_name")
        connection.account_handle = details.get("account_handle")
        connection.account_avatar = details.get("account_avatar")
        connection.credentials = credentials
        flag_modified(connection, "credentials")
    else:
        db.add(models.SocialConnection(
            user_id=user_id,
            platform=platform,
            account_name=details.get("account_name"),
            account_handle=details.get("account_handle"),
            account_avatar=details.get("account_avatar"),
            credentials=credentials,
        ))
    db.commit()


def _connect_youtube(db: Session, user_id: int, code: str) -> None:
    response = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        },
        timeout=15,
    )
    response.raise_for_status()
    tokens = response.json()
    details = SocialPublishService.verify_connection("youtube", {
        "youtube_access_token": tokens.get("access_token"),
        "youtube_refresh_token": tokens.get("refresh_token"),
    })
    _save_connection(db, user_id, "youtube", details)


def _connect_meta(db: Session, user_id: int, platform: str, code: str) -> None:
    redirect_uri = settings.META_REDIRECT_URI if platform == "facebook" else settings.INSTAGRAM_REDIRECT_URI
    response = requests.get(
        f"{GRAPH}/oauth/access_token",
        params={"client_id": settings.META_APP_ID, "client_secret": settings.META_APP_SECRET,
                "redirect_uri": redirect_uri, "code": code},
        timeout=15,
    )
    response.raise_for_status()
    user_token = response.json().get("access_token")

    pages_response = requests.get(
        f"{GRAPH}/me/accounts",
        params={"fields": "access_token,instagram_business_account,name", "access_token": user_token},
        timeout=15,
    )
    pages_response.raise_for_status()
    pages = pages_response.json().get("data", [])
    if not pages:
        raise _UserFacingError("No Facebook Pages are linked to this Meta account.")

    facebook_details = None
    first_page = pages[0]
    if first_page.get("access_token") and first_page.get("id"):
        facebook_details = SocialPublishService.verify_connection("facebook", {
            "facebook_access_token": first_page["access_token"],
            "facebook_page_id": first_page["id"],
        })

    instagram_id, instagram_page_token = None, None
    for page in pages:
        linked = page.get("instagram_business_account")
        if linked:
            instagram_id, instagram_page_token = linked["id"], page.get("access_token")
            break
        if page.get("id") and page.get("access_token"):
            try:
                ig = requests.get(
                    f"{GRAPH}/{page['id']}/instagram_accounts",
                    params={"fields": "id,username,name", "access_token": page["access_token"]},
                    timeout=10,
                )
                if ig.status_code == 200 and ig.json().get("data"):
                    instagram_id, instagram_page_token = ig.json()["data"][0]["id"], page["access_token"]
                    break
            except requests.RequestException:
                logger.warning("instagram_accounts lookup failed for page %s", page.get("id"), exc_info=True)

    instagram_details = None
    if instagram_id and instagram_page_token:
        instagram_details = SocialPublishService.verify_connection("instagram", {
            "instagram_access_token": instagram_page_token,
            "instagram_business_id": instagram_id,
        })
    if platform == "instagram" and not instagram_details:
        raise _UserFacingError(
            "No Instagram Business account is linked to your Facebook Page. Link it in your Page settings and try again."
        )
    if facebook_details:
        _save_connection(db, user_id, "facebook", facebook_details)
    if instagram_details:
        _save_connection(db, user_id, "instagram", instagram_details)
```

**Update your OAuth apps:** in the Google Cloud console and the Meta developer console, set the redirect URIs to exactly the values of `GOOGLE_REDIRECT_URI`, `META_REDIRECT_URI` and `INSTAGRAM_REDIRECT_URI` for each environment. In production they look like `https://api.yourdomain.com/api/v1/users/auth/youtube/callback`.

---

### Step 11 — Application entry point; delete the boot-time hacks (fixes SEC-03, SEC-17, SEC-19, ARCH-02, OPS-01)

**11.1** Replace the whole of `backend/app/main.py`:

```python
import logging

import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import models  # noqa: F401  (registers all ORM models)
from app.api.api_v1.api import api_router
from app.core.config import settings
from app.core.logging import setup_logging
from app.services import storage

setup_logging()
logger = logging.getLogger(__name__)

if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENV,
        traces_sample_rate=0.05,
        send_default_pii=False,
    )

storage.ensure_dirs()

_is_production = settings.ENV == "production"

app = FastAPI(
    title=settings.PROJECT_NAME,
    docs_url=None if _is_production else "/docs",
    redoc_url=None if _is_production else "/redoc",
    openapi_url=None if _is_production else f"{settings.API_V1_STR}/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN],
    allow_credentials=False,  # we use bearer tokens, not cookies
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def no_store_api_responses(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.startswith(settings.API_V1_STR) and not path.startswith(f"{settings.API_V1_STR}/media/"):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Full details go to logs/Sentry. The client gets a generic message (SEC-21).
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "An internal server error occurred."})


app.include_router(api_router, prefix=settings.API_V1_STR)
```

What was deleted and why:
- The WinGet PATH hack.
- The import-time `create_all`, `auto_migrate_database` and the `admin123` seeder (SEC-03, ARCH-02). The schema now comes only from Alembic (Step 15).
- Ollama and Celery auto-start (workers are separate processes; Step 17).
- The public `/uploads` mount (SEC-12).
- `error.log` (logs go to stdout and Sentry).
- The self-signed TLS `__main__` block (TLS ends at nginx).

**11.2** Replace the whole of `backend/app/core/logging.py`:

```python
import logging
import sys

from app.core.config import settings


def setup_logging() -> None:
    logging.basicConfig(
        stream=sys.stdout,
        level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(process)d %(message)s",
        force=True,
    )
    # Third-party libraries are noisy at INFO
    for noisy in ("httpx", "urllib3", "ultralytics"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
```

**11.3** Delete these files (they only served the old Windows/self-signed dev setup):
```bash
git rm backend/generate_certs.py backend/run.py backend/run_backend.bat backend/run_celery.bat start.bat
git rm --cached -r backend/uploads 2>/dev/null || true
rm -f backend/error.log backend/key.pem backend/cert.pem
```

**11.4** Local development commands from now on (put them in `backend/README.md`, replacing its "Running" section):
```bash
# terminal 1: API
uvicorn app.main:app --reload --port 8000
# terminal 2: worker (all queues, one process; fine for development)
celery -A app.core.celery_app worker -Q pipeline,render,io -c 1 --loglevel=INFO
# terminal 3: scheduler for the stuck-job sweeper
celery -A app.core.celery_app beat --loglevel=INFO
```

**Verify:** after Step 15 creates the tables, run `uvicorn app.main:app --port 8000`:
- `curl -s localhost:8000/api/v1/readyz` returns `{"status":"ok","database":"ok","redis":"ok"}`.
- `curl -s -o /dev/null -w '%{http_code}' localhost:8000/api/v1/projects/` prints `401`.

---

### Step 12 — Celery: reliability settings, separate queues, stuck-job sweeper (fixes CONC-01, BUG-01, PERF-06)

**12.1** Replace the whole of `backend/app/core/celery_app.py`:

```python
from celery import Celery
from kombu import Queue

from app.core.config import settings

celery_app = Celery(
    "harvest",
    broker=settings.REDIS_URL,
    include=["app.tasks.video_tasks", "app.tasks.maintenance_tasks"],
)

celery_app.conf.update(
    # Serialization: JSON only (no pickle => no remote code execution through the broker)
    task_serializer="json",
    accept_content=["json"],
    # We never read task results; progress lives in the database
    task_ignore_result=True,
    # Three queues so a long AI job can never block a publish or a quick re-render
    task_queues=(Queue("pipeline"), Queue("render"), Queue("io")),
    task_default_queue="io",
    task_routes={
        "app.tasks.video_tasks.generate_master_shorts_task": {"queue": "pipeline"},
        "app.tasks.video_tasks.render_clip_task": {"queue": "render"},
        "app.tasks.video_tasks.publish_video_task": {"queue": "io"},
        "app.tasks.maintenance_tasks.*": {"queue": "io"},
    },
    # Reliability: ack only after the task finishes, so a crashed worker's job is re-delivered
    # (tasks are idempotent and count attempts; see job_control.MAX_ATTEMPTS)
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,  # never hoard long jobs
    worker_max_tasks_per_child=50,  # recycle processes to release memory leaked by ML libraries
    broker_connection_retry_on_startup=True,
    # Must be longer than the longest task, or Redis re-delivers a task that is still running
    broker_transport_options={"visibility_timeout": settings.PIPELINE_TIME_LIMIT_SECONDS + 3600},
    timezone="UTC",
    beat_schedule={
        "sweep-stuck-jobs": {"task": "app.tasks.maintenance_tasks.sweep_stuck_jobs", "schedule": 600.0},
    },
)
```

**12.2** Create `backend/app/tasks/maintenance_tasks.py`:

```python
import logging
from datetime import datetime, timedelta, timezone

from app import models
from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.database import session_scope

logger = logging.getLogger(__name__)


@celery_app.task(ignore_result=True)
def sweep_stuck_jobs() -> None:
    """Fails videos and clips stuck in a running state longer than their task can possibly live (BUG-01)."""
    now = datetime.now(timezone.utc)
    video_cutoff = now - timedelta(seconds=settings.PIPELINE_TIME_LIMIT_SECONDS + 900)
    clip_cutoff = now - timedelta(seconds=settings.RENDER_TIME_LIMIT_SECONDS + 900)
    with session_scope() as db:
        videos = (
            db.query(models.Video)
            .filter(models.Video.status == models.VideoStatus.PROCESSING, models.Video.updated_at < video_cutoff)
            .update({models.Video.status: models.VideoStatus.FAILED}, synchronize_session=False)
        )
        clips = (
            db.query(models.Clip)
            .filter(
                models.Clip.status.in_([models.ClipStatus.PENDING, models.ClipStatus.RENDERING]),
                models.Clip.updated_at < clip_cutoff,
            )
            .update({models.Clip.status: models.ClipStatus.FAILED}, synchronize_session=False)
        )
    if videos or clips:
        logger.warning("Sweeper failed %s stuck videos and %s stuck clips", videos, clips)
```

---

### Step 13 — Background tasks (fixes BUG-01, BUG-03, BUG-07, CONC-02, CONC-03, PERF-01, PERF-05, SEC-05, SEC-19)

All edits are in `backend/app/tasks/video_tasks.py`.

**13.1 Imports.** Find the top of the file:

```python
import os
import logging
from pathlib import Path
from app.core.celery_app import celery_app
from app.core.database import SessionLocal
from app import models

logger = logging.getLogger(__name__)

# Absolute path to the backend directory — anchors all relative upload paths
_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent  # backend/
```

Replace with:

```python
import logging
import os
import shutil
import uuid
from pathlib import Path

from sqlalchemy.orm.attributes import flag_modified

from app import models
from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.database import SessionLocal
from app.services import job_control, storage
from app.services.ffmpeg import run_ffmpeg, timeout_for

logger = logging.getLogger(__name__)
```

**13.2 Delete the dead granular tasks (BUG-07).** Delete everything from the line `@celery_app.task(ignore_result=True)` directly above `def process_video_task(video_id: int):` down to, but **not including**, the `@celery_app.task(ignore_result=True)` line directly above `def render_clip_task(clip_id: int):`. This removes `process_video_task`, `transcribe_video_task`, `analyze_content_task`, `detect_highlights_task` and `generate_smart_crop_task`.

**13.3 `render_clip_task`.** Make six edits.

(a) Find:
```python
@celery_app.task(ignore_result=True)
def render_clip_task(clip_id: int):
    logger.info(f"Starting to render clip {clip_id}")
    db = SessionLocal()
    try:
        clip = db.query(models.Clip).filter(models.Clip.id == clip_id).first()
        if not clip:
            logger.error(f"Clip {clip_id} not found")
            return
```
Replace with:
```python
@celery_app.task(bind=True, ignore_result=True,
                 soft_time_limit=settings.RENDER_TIME_LIMIT_SECONDS - 60,
                 time_limit=settings.RENDER_TIME_LIMIT_SECONDS)
def render_clip_task(self, clip_id: int):
    logger.info("Starting to render clip %s", clip_id)
    db = SessionLocal()
    cropped_path = ass_path = subbed_path = output_path = None
    try:
        clip = db.get(models.Clip, clip_id)
        if not clip:
            logger.error("Clip %s not found", clip_id)
            return
        if job_control.count_attempt(self.request.id) > job_control.MAX_ATTEMPTS:
            logger.error("Clip %s crashed the worker repeatedly; marking it failed", clip_id)
            clip.status = models.ClipStatus.FAILED
            db.commit()
            return
```

(b) Find:
```python
        import os
        import uuid
        if os.path.isabs(video.storage_path):
            video_path = video.storage_path
        else:
            video_path = str(_BACKEND_DIR / video.storage_path)

        # Check if we have crop trajectory; if not, calculate on the fly
        has_crop_trajectory = (
            video.crop_metadata is not None
            and isinstance(video.crop_metadata, dict)
            and video.crop_metadata.get("trajectory")
        )

        if not has_crop_trajectory:
```
Replace with:
```python
        video_path = str(storage.abs_path(video.storage_path))

        # Check if we have crop trajectory; if not, calculate on the fly
        has_crop_trajectory = (
            video.crop_metadata is not None
            and isinstance(video.crop_metadata, dict)
            and video.crop_metadata.get("trajectory")
        )
        requested_framing = (clip.edit_options or {}).get("framing_mode", "fit_blur")

        # Only run YOLO/FaceMesh when the framing mode actually uses the trajectory (PERF-01)
        if not has_crop_trajectory and requested_framing in ("crop", "smart_crop", "fill"):
```

(c) Find:
```python
        # Ensure clips directory exists
        clips_dir = os.path.join(os.path.dirname(video_path), "clips")
        os.makedirs(clips_dir, exist_ok=True)

        output_filename = f"clip_{uuid.uuid4().hex[:8]}.mp4"
        output_path = os.path.join(clips_dir, output_filename)

        # Compute path relative to the app dir so the frontend can serve it via /uploads/
        # _BACKEND_DIR is defined at module level as the backend/ directory
        _app_dir = str(_BACKEND_DIR / "app")
        relative_path = os.path.relpath(output_path, _app_dir).replace("\\", "/")
```
Replace with:
```python
        output_path = str(storage.new_path(f"clips/{video.id}/clip_{uuid.uuid4().hex}.mp4"))
        clips_dir = os.path.dirname(output_path)
        relative_path = storage.rel_path(output_path)
```

(d) Find (inside the music `except` block):
```python
            import subprocess
            subprocess.run(["ffmpeg", "-y", "-i", temp_video_source, "-c", "copy", output_path], capture_output=True)
```
Replace with:
```python
            # check=True: if even the plain copy fails, the clip is FAILED, never "completed" without a file (BUG-03)
            run_ffmpeg(["ffmpeg", "-y", "-i", temp_video_source, "-c", "copy", output_path],
                       timeout=timeout_for(clip.duration))
```

(e) Find the end of the function:
```python
        # Cleanup intermediate files
        for fpath in [cropped_path, ass_path, subbed_path]:
            if os.path.exists(fpath) and fpath != output_path:
                try:
                    os.remove(fpath)
                except Exception as ex:
                    logger.warning(f"Failed to remove temp file {fpath}: {ex}")

        clip.storage_path = relative_path
        clip.status = models.ClipStatus.COMPLETED
        db.commit()
        logger.info(f"Successfully rendered clip {clip_id} to {relative_path}")

    except Exception as e:
        logger.error(f"Error rendering clip {clip_id}: {e}")
        db.rollback()

        clip = db.query(models.Clip).filter(models.Clip.id == clip_id).first()
        if clip:
            clip.status = models.ClipStatus.FAILED
            db.commit()
    finally:
        db.close()
```
Replace with:
```python
        if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
            raise RuntimeError("Render produced no output file")

        previous_path = clip.storage_path
        clip.storage_path = relative_path
        clip.status = models.ClipStatus.COMPLETED
        db.commit()
        if previous_path and previous_path != relative_path:
            storage.delete(previous_path)  # the previous render of this clip (PERF-05)
        logger.info("Rendered clip %s to %s", clip_id, relative_path)

    except Exception:  # includes SoftTimeLimitExceeded
        logger.exception("Error rendering clip %s", clip_id)
        db.rollback()
        if output_path:
            storage.delete(output_path)
        clip = db.get(models.Clip, clip_id)
        if clip:
            clip.status = models.ClipStatus.FAILED
            db.commit()
    finally:
        # Intermediates are removed on success AND on failure (PERF-05)
        for temp_path in (cropped_path, ass_path, subbed_path):
            if temp_path and temp_path != output_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    logger.warning("Failed to remove temp file %s", temp_path)
        db.close()
```

(f) In the same function, replace every remaining `subprocess.run(...)` / `subprocess.Popen(...)` using the table in Step 14.6.

**13.4 Master generation and publishing.** Delete everything from the line `@celery_app.task(ignore_result=True)` directly above `def generate_master_shorts_task(` **to the end of the file**. This deletes both `generate_master_shorts_task` and `publish_video_task`. Paste this in their place:

```python
# ------------------------------------------------------------------ shared helpers

def _mark_video_failed(db, video_id: int) -> None:
    try:
        db.query(models.Video).filter(models.Video.id == video_id).update(
            {models.Video.status: models.VideoStatus.FAILED}, synchronize_session=False
        )
        db.commit()
    except Exception:
        logger.exception("Could not mark video %s as failed", video_id)
        db.rollback()


def _set_all_stages(video: models.Video, value: str) -> None:
    video.transcription_status = models.TranscriptionStatus(value)
    video.analysis_status = models.ContentAnalysisStatus(value)
    video.highlight_status = models.HighlightDetectionStatus(value)
    video.crop_status = models.CropStatus(value)


# ------------------------------------------------------------------ master generation

@celery_app.task(bind=True, ignore_result=True,
                 soft_time_limit=settings.PIPELINE_TIME_LIMIT_SECONDS - 120,
                 time_limit=settings.PIPELINE_TIME_LIMIT_SECONDS)
def generate_master_shorts_task(
    self,
    video_id: int,
    length: float,
    platform: str,
    optional_prompt: str,
    translate_language: str = "none",
    dub_voice: bool = False,
    caption_language: str = "translated",
    dub_mix_mode: str = "replace",
    speaker_gender: str = "female",
    audio_theme: str = "auto",
    framing_mode: str = "fit_blur",
):
    task_id = self.request.id
    work_dir = Path(settings.SCRATCH_DIR) / f"master_{task_id}"  # private to this run (CONC-02)
    attempt = job_control.bind_worker(video_id, task_id)
    db = SessionLocal()
    try:
        if job_control.is_superseded(video_id):
            logger.info("Task %s for video %s was superseded by a newer generation; exiting", task_id, video_id)
            return
        if job_control.is_cancel_requested(video_id):
            logger.info("Video %s was cancelled before task %s started", video_id, task_id)
            _mark_video_failed(db, video_id)
            return
        if attempt > job_control.MAX_ATTEMPTS:
            logger.error("Video %s crashed the worker %s times; giving up", video_id, attempt - 1)
            _mark_video_failed(db, video_id)
            return

        video = db.get(models.Video, video_id)
        if video is None:
            logger.error("Video %s not found", video_id)
            return
        try:
            video_path = str(storage.abs_path(video.storage_path))
        except ValueError:
            video_path = ""
        if not video_path or not os.path.exists(video_path):
            logger.error("Source file for video %s is missing", video_id)
            _mark_video_failed(db, video_id)  # never leave it PROCESSING (BUG-01)
            return

        video.status = models.VideoStatus.PROCESSING
        _set_all_stages(video, "none")
        db.commit()

        # A fresh run replaces the previous run's variations (database rows AND files)
        previous = (
            db.query(models.Clip)
            .filter(models.Clip.video_id == video_id, models.Clip.title.like("%Master Variation%"))
            .all()
        )
        for old_clip in previous:
            storage.delete(old_clip.storage_path)
            db.delete(old_clip)
        db.commit()

        work_dir.mkdir(parents=True, exist_ok=True)
        saved_sources = set()

        def _save_variation_clip(item, current_idx, total_count):
            if not isinstance(item, dict) or job_control.is_video_cancelled(video_id):
                return
            src_path = item.get("path")
            if not src_path or not os.path.exists(src_path) or src_path in saved_sources:
                return
            saved_sources.add(src_path)
            title = item.get("title", f"Master Variation {current_idx}")
            clip_duration = item.get("duration", length)
            start_val = item.get("start_time", 0.0)
            end_val = item.get("end_time", start_val + clip_duration)
            final_path = storage.new_path(f"clips/{video_id}/variation_{current_idx}_{uuid.uuid4().hex[:8]}.mp4")
            shutil.move(src_path, final_path)  # move, not copy (PERF-05)
            db.add(models.Clip(
                video_id=video_id,
                title=title,
                start_time=start_val,
                end_time=end_val,
                duration=clip_duration,
                status=models.ClipStatus.COMPLETED,
                storage_path=storage.rel_path(final_path),
            ))
            video.status = models.VideoStatus.PROCESSING
            _set_all_stages(video, "completed")
            db.commit()
            logger.info("Saved variation %s/%s (%s) for video %s", current_idx, total_count, title, video_id)

        def _update_progress(stage: str):
            transcription, analysis = models.TranscriptionStatus, models.ContentAnalysisStatus
            highlight, crop = models.HighlightDetectionStatus, models.CropStatus
            video.status = models.VideoStatus.PROCESSING
            if stage == "transcribing":
                video.transcription_status = transcription.PROCESSING
            elif stage == "analyzing":
                video.transcription_status = transcription.COMPLETED
                video.analysis_status = analysis.PROCESSING
            elif stage == "highlighting":
                video.transcription_status = transcription.COMPLETED
                video.analysis_status = analysis.COMPLETED
                video.highlight_status = highlight.PROCESSING
            elif stage == "cropping":
                video.transcription_status = transcription.COMPLETED
                video.analysis_status = analysis.COMPLETED
                video.highlight_status = highlight.COMPLETED
                video.crop_status = crop.PROCESSING
            elif stage == "rendering":
                _set_all_stages(video, "completed")
            db.commit()

        from app.services.master_agent import master_agent

        results = master_agent.generate_shorts(
            video_path=video_path,
            length=length,
            platform=platform,
            optional_prompt=optional_prompt,
            audio_theme=audio_theme,
            progress_callback=_update_progress,
            db_video=video,
            translate_language=translate_language,
            dub_voice=dub_voice,
            caption_language=caption_language,
            dub_mix_mode=dub_mix_mode,
            speaker_gender=speaker_gender,
            framing_mode=framing_mode,
            on_variation_complete=_save_variation_clip,
            work_dir=str(work_dir),
        )
        for index, item in enumerate(results, 1):
            if isinstance(item, dict) and item.get("path") not in saved_sources:
                _save_variation_clip(item, index, len(results))

        if job_control.is_superseded(video_id):
            return
        if job_control.is_cancel_requested(video_id):
            _mark_video_failed(db, video_id)
            return

        produced = (
            db.query(models.Clip)
            .filter(
                models.Clip.video_id == video_id,
                models.Clip.title.like("%Master Variation%"),
                models.Clip.status == models.ClipStatus.COMPLETED,
            )
            .count()
        )
        if produced == 0:
            raise RuntimeError("The pipeline finished without producing any variation")  # BUG-03

        db.refresh(video)
        video.status = models.VideoStatus.COMPLETED
        _set_all_stages(video, "completed")
        db.commit()
        logger.info("Video %s: %s variations ready", video_id, produced)

    except Exception:  # includes SoftTimeLimitExceeded
        logger.exception("Master generation failed for video %s (task %s)", video_id, task_id)
        db.rollback()
        if not job_control.is_superseded(video_id):
            _mark_video_failed(db, video_id)
    finally:
        job_control.unbind_worker(video_id)
        shutil.rmtree(work_dir, ignore_errors=True)  # never leave scratch files behind (PERF-05)
        db.close()


# ------------------------------------------------------------------ publishing

def _save_published(db, clip: models.Clip, published: dict) -> None:
    clip.published_urls = dict(published)
    flag_modified(clip, "published_urls")
    db.commit()


@celery_app.task(bind=True, ignore_result=True,
                 soft_time_limit=settings.PUBLISH_TIME_LIMIT_SECONDS - 60,
                 time_limit=settings.PUBLISH_TIME_LIMIT_SECONDS)
def publish_video_task(self, clip_id: int, config: dict):
    platforms = list(config.get("platforms") or [])
    # Log ids only: never the config, tokens or API responses (SEC-19)
    logger.info("Publishing clip %s to %s", clip_id, platforms)
    db = SessionLocal()
    try:
        clip = db.get(models.Clip, clip_id)
        if clip is None or clip.video is None or clip.video.project is None:
            logger.error("Clip %s is missing or orphaned; not publishing", clip_id)  # never fall back to user 1 (SEC-05)
            return
        published = dict(clip.published_urls or {})
        if job_control.count_attempt(self.request.id) > job_control.MAX_ATTEMPTS:
            for platform in platforms:
                if published.get(platform) == "publishing":
                    published[platform] = "error: publishing kept failing"
            _save_published(db, clip, published)
            return

        from app.services.social_publish_service import SocialPublishService

        owner_id = clip.video.project.owner_id
        connections = {
            c.platform: c
            for c in db.query(models.SocialConnection).filter(models.SocialConnection.user_id == owner_id)
        }
        video_path = str(storage.abs_path(clip.storage_path))

        for platform in platforms:
            if str(published.get(platform) or "").startswith("http"):
                continue  # already published: this delivery is a retry (CONC-03)
            connection = connections.get(platform)
            if connection is None:
                published[platform] = "error: account not connected"
                _save_published(db, clip, published)
                continue
            credentials = dict(connection.credentials or {})
            publish_config = {
                "title": config.get("title") or clip.title or "Harvest AI short",
                "description": config.get("description") or "",
                "privacy": config.get("privacy") or "public",
                **credentials,  # ONLY the clip owner's own tokens
            }
            if platform == "instagram":
                # Instagram's servers download the file themselves: give them a short-lived signed URL.
                publish_config["public_video_url"] = storage.signed_url(clip.storage_path, ttl=3600)
            try:
                result = SocialPublishService.publish_clip(video_path, platform, publish_config)
            except ValueError as exc:  # our own, user-safe messages
                logger.warning("Publishing clip %s to %s rejected: %s", clip_id, platform, exc)
                published[platform] = f"error: {str(exc)[:200]}"
            except Exception:
                logger.exception("Publishing clip %s to %s failed", clip_id, platform)
                published[platform] = "error: publishing failed, please try again"
            else:
                if result.get("status") == "success" and result.get("video_url"):
                    published[platform] = result["video_url"]
                    if result.get("updated_access_token"):
                        connection.credentials = {**credentials, f"{platform}_access_token": result["updated_access_token"]}
                        flag_modified(connection, "credentials")
                else:
                    published[platform] = "error: the platform did not return a video link"
            _save_published(db, clip, published)  # persist after EACH platform
    except Exception:
        logger.exception("Publishing task for clip %s crashed", clip_id)
        db.rollback()
        clip = db.get(models.Clip, clip_id)
        if clip is not None:
            published = dict(clip.published_urls or {})
            for platform in platforms:
                if published.get(platform) == "publishing":
                    published[platform] = "error: publishing failed, please try again"
            _save_published(db, clip, published)
    finally:
        db.close()
```

**Verify:**
- `grep -n "_BACKEND_DIR\|process_video_task\|transcribe_video_task" app/tasks/video_tasks.py` prints nothing.
- `python -c "import app.tasks.video_tasks as t; print(t.render_clip_task.name, t.generate_master_shorts_task.name)"` works.

---

### Step 14 — Services (fixes SEC-05, SEC-14, SEC-19, SEC-20, BUG-04, BUG-05, BUG-06, BUG-08, BUG-09, BUG-12, CONC-04, CONC-05, CONC-07, PERF-01, PERF-02, PERF-03)

**14.1 `backend/app/services/master_agent.py`.** Make five edits.

(a) **Cross-process cancellation (CONC-04).** Delete the whole in-memory registry: everything from the comment `# Cancellation registry to immediately terminate any running generation task cooperatively` through the end of the `def is_video_cancelled(video_id: int) -> bool:` function (it ends with `return False`). In its place put this one line:
```python
from app.services.job_control import is_video_cancelled  # Redis-backed: works across API and worker processes
```

(b) **Private work folder.** Find:
```python
        framing_mode: str = "fit_blur",
        on_variation_complete=None
    ) -> List[dict]:
```
Replace with:
```python
        framing_mode: str = "fit_blur",
        on_variation_complete=None,
        work_dir: str = None,
    ) -> List[dict]:
```
Then find `        video_processor = VideoProcessor()` and replace it with `        video_processor = VideoProcessor(upload_dir=work_dir)`.

(c) **Skip YOLO when the framing mode does not use it (PERF-01).** Find:
```python
        # 4. Smart Cropping Trajectory
        if progress_callback:
            progress_callback("cropping")
        logger.info("Calculating crop trajectory...")
        try:
            crop_data = smart_cropping_service.generate_crop_metadata(video_path)
            full_trajectory = crop_data.get("trajectory", [])
            if db_video is not None:
                from app.models.video import CropStatus
                db_video.crop_metadata = crop_data
                db_video.crop_status = CropStatus.COMPLETED
        except Exception as e:
            logger.warning(f"Smart cropping failed (using static center crop): {e}")
            full_trajectory = []
```
Replace with:
```python
        # 4. Smart Cropping Trajectory: only crop-based framing modes use it (PERF-01)
        full_trajectory = []
        if framing_mode in ("crop", "smart_crop", "fill"):
            if progress_callback:
                progress_callback("cropping")
            logger.info("Calculating crop trajectory...")
            try:
                crop_data = smart_cropping_service.generate_crop_metadata(video_path)
                full_trajectory = crop_data.get("trajectory", [])
                if db_video is not None:
                    from app.models.video import CropStatus
                    db_video.crop_metadata = crop_data
                    db_video.crop_status = CropStatus.COMPLETED
            except Exception as e:
                logger.warning(f"Smart cropping failed (using static center crop): {e}")
                full_trajectory = []
```

(d) **One prompt parse per job, and the user's choices always win (BUG-06).** Find:
```python
        generated_files = []
        base_dir = os.path.dirname(video_path)
```
Replace with:
```python
        generated_files = []
        base_dir = work_dir or os.path.dirname(video_path)

        # The user's free-text prompt is parsed ONCE per job (it used to be 5 LLM calls).
        # Its hints can never override the persona style or the user's explicit settings.
        user_prompt_hints = {}
        if optional_prompt:
            try:
                user_prompt_hints = prompt_editing_agent.parse_prompt(optional_prompt) or {}
            except Exception:
                logger.warning("Could not parse the user's prompt; continuing without it", exc_info=True)
```
Then find:
```python
            # Parse instructions with LLM
            instructions = prompt_editing_agent.parse_prompt(persona_prompt)
            # Enforce persona's specific animated caption style and BGM
            instructions["caption_style"] = persona_info["caption_style"]
            instructions["music_style"] = persona_info.get("music_style", "standard")
            instructions["zooms"] = "none"
            instructions["transition"] = "none"
            instructions["framing_mode"] = framing_mode

            # Translation / Dubbing if requested by user in UI
            if translate_language and translate_language != "none":
                instructions["translate_language"] = translate_language
            if dub_voice:
                instructions["dub_voice"] = dub_voice
            if caption_language:
                instructions["caption_language"] = caption_language
            if dub_mix_mode:
                instructions["dub_mix_mode"] = dub_mix_mode
```
Replace with:
```python
            instructions = dict(user_prompt_hints)
            instructions.update({
                "caption_style": persona_info["caption_style"],
                "music_style": persona_info.get("music_style", "standard"),
                "zooms": "none",
                "transition": "none",
                "framing_mode": framing_mode,
                "translate_language": translate_language or "none",
                "dub_voice": bool(dub_voice),
                "caption_language": caption_language or "translated",
                "dub_mix_mode": dub_mix_mode or "replace",
            })
```
After this edit `persona_prompt` is unused. Delete the line `            persona_prompt = persona_info["prompt"]`.

(e) **Clip end can never come before its start (BUG-05).** Find:
```python
            # 2. Snap end time to natural sentence ending near best_start + desired_dur
            target_en = best_start + desired_dur
            if video_duration > 0 and target_en > video_duration:
                target_en = video_duration
```
Replace with:
```python
            # 2. Snap end time to natural sentence ending near best_start + desired_dur
            target_en = best_start + desired_dur
            if video_duration > 0 and target_en > video_duration:
                target_en = video_duration
            min_len = min(10.0, desired_dur * 0.5)  # short requested lengths are honoured
```
Then find `                if w_end < best_start + 10.0:` and replace it with `                if w_end < best_start + min_len:`.

Then find:
```python
                valid_ends = [w for w in sorted_words if float(w.get("end", 0.0)) >= best_start + 10.0] or sorted_words
                closest_end_word = min(valid_ends, key=lambda w: abs(float(w.get("end", 0.0)) - target_en))
                best_end = min(video_duration or 99999.0, float(closest_end_word.get("end", 0.0)) + 0.15)

            return round(best_start, 2), round(best_end, 2)
```
Replace with:
```python
                valid_ends = [w for w in sorted_words if float(w.get("end", 0.0)) > best_start + min_len]
                if valid_ends:
                    closest_end_word = min(valid_ends, key=lambda w: abs(float(w.get("end", 0.0)) - target_en))
                    best_end = min(video_duration or 99999.0, float(closest_end_word.get("end", 0.0)) + 0.15)
                else:
                    best_end = target_en

            if best_end <= best_start:  # never an empty or negative window
                best_end = best_start + desired_dur
                if video_duration > 0:
                    best_end = min(best_end, video_duration)
            return round(best_start, 2), round(best_end, 2)
```

**14.2** Replace the whole of `backend/app/services/video_processor.py` (fixes BUG-04, PERF-02, PERF-03):

```python
import logging
import subprocess
from pathlib import Path
from typing import Optional

from app.core.config import settings
from app.services.ffmpeg import probe_media, run_ffmpeg, timeout_for

logger = logging.getLogger(__name__)


class VideoProcessor:
    """Prepares a source video for the pipeline: metadata + the extracted audio track.

    The old 1-fps frame dump and 15-second preview were never read by anything and are gone (PERF-02).
    """

    def __init__(self, upload_dir: Optional[str] = None):
        self.upload_dir = Path(upload_dir) if upload_dir else Path(settings.SCRATCH_DIR) / "derived"
        self.upload_dir.mkdir(parents=True, exist_ok=True)

    def process(self, video_path: str) -> dict:
        source = Path(video_path)
        if not source.exists():
            raise FileNotFoundError(f"Video file not found: {source}")
        metadata = self._get_metadata(source)
        assets_dir = self.upload_dir / source.stem
        assets_dir.mkdir(parents=True, exist_ok=True)
        audio_path = assets_dir / f"{source.stem}_audio.wav"
        self._extract_audio(source, audio_path, metadata.get("duration"))
        return {
            "duration": metadata.get("duration"),
            "resolution": metadata.get("resolution"),
            "fps": metadata.get("fps"),
            "bitrate": metadata.get("bitrate"),
            "audio_path": str(audio_path),
            "frame_directory": None,
            "short_path": None,
        }

    def _get_metadata(self, video_path: Path) -> dict:
        try:
            meta = probe_media(video_path)  # reads container duration too (MKV/WebM, BUG-04)
        except Exception:
            logger.exception("ffprobe failed for %s", video_path)
            return {}
        return {key: meta[key] for key in ("duration", "resolution", "fps", "bitrate")}

    def _extract_audio(self, video_path: Path, output_path: Path, duration: Optional[float] = None) -> None:
        try:
            run_ffmpeg(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", str(video_path),
                 "-vn", "-map", "a:0", "-c:a", "pcm_s16le", str(output_path)],
                timeout=timeout_for(duration),
            )
            return
        except subprocess.CalledProcessError:
            logger.warning("No usable audio stream in %s; generating a silent track", video_path)
        run_ffmpeg(
            ["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=22050:cl=mono",
             "-t", str(duration or 10.0), "-c:a", "pcm_s16le", str(output_path)],
            timeout=300,
        )
```

**14.3 `backend/app/services/smart_cropping_service.py`.** Make four edits (CONC-05, PERF-01).

(a) Find:
```python
                self.yolo = YOLO(yolo_model_path)
                if self.device == "cuda":
                    self.yolo.to("cuda")
                self.tracker = DeepSort(max_age=30, n_init=3, nms_max_overlap=1.0)
            except Exception as e:
                logger.warning(f"YOLO model load failed ({e}). Using face-center fallback.")
                self.yolo = None
                self.tracker = None
        else:
            self.yolo = None
            self.tracker = None
```
Replace with:
```python
                self.yolo = YOLO(yolo_model_path)
                if self.device == "cuda":
                    self.yolo.to("cuda")
            except Exception as e:
                logger.warning(f"YOLO model load failed ({e}). Using face-center fallback.")
                self.yolo = None
        else:
            self.yolo = None
```

(b) Find:
```python
        # MAR (Mouth Aspect Ratio) tracking for active-speaker detection
        self.mar_history = {}
        self.mar_window_size = 15
```
Replace with:
```python
        # MAR (Mouth Aspect Ratio) window for active-speaker detection.
        # The tracker and MAR history are created PER VIDEO in generate_crop_metadata (never shared).
        self.mar_window_size = 15
```

(c) Find the **first** occurrence of:
```python
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
```
Replace with:
```python
        # Per-call state: never shared between videos or threads (CONC-05)
        tracker = DeepSort(max_age=30, n_init=3, nms_max_overlap=1.0) if self.yolo is not None else None
        mar_history = {}

        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
```
Inside `generate_crop_metadata`, replace every `self.tracker` with `tracker` and every `self.mar_history` with `mar_history`. That is five or six places, all in the active-speaker block. Afterwards `grep -n "self.tracker\|self.mar_history" app/services/smart_cropping_service.py` must print nothing.

(d) Stop fully decoding the frames you skip. Find:
```python
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                if frame_idx % frame_skip != 0:
                    frame_idx += 1
                    continue
```
Replace with:
```python
            while cap.isOpened():
                if frame_idx % frame_skip != 0:
                    if not cap.grab():  # advance without decoding
                        break
                    frame_idx += 1
                    continue
                ret, frame = cap.read()
                if not ret:
                    break
```

**14.4 `backend/app/services/social_publish_service.py`: no operator-token fallbacks (SEC-05).**

1. Delete each pair of lines shaped like `if not <name>:` + `<name> = settings.<SOMETHING>`, where `<SOMETHING>` is one of `YOUTUBE_ACCESS_TOKEN`, `FACEBOOK_ACCESS_TOKEN`, `FACEBOOK_PAGE_ID`, `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_BUSINESS_ID` or `PUBLIC_VIDEO_URL`. They are in `verify_connection` (around lines 54, 113-116, 162-167).
2. In `_publish_to_youtube` and `_publish_to_facebook`, delete the ` or settings.<NAME>` suffix on each `config.get(...)` line (lines 304, 382, 383).
3. In `_publish_to_instagram`, find:
   ```python
           access_token = config.get("instagram_access_token") or settings.INSTAGRAM_ACCESS_TOKEN
           instagram_business_id = config.get("instagram_business_id") or settings.INSTAGRAM_BUSINESS_ID
           video_url = config.get("public_video_url") or settings.PUBLIC_VIDEO_URL

           # If video_url is a base URL, construct the full URL to the clip file
           if video_url and not video_url.lower().endswith(".mp4"):
               normalized_path = video_path.replace("\\", "/")
               if "uploads/" in normalized_path.lower():
                   try:
                       idx = normalized_path.lower().index("uploads/")
                       relative_path = normalized_path[idx:]
                       video_url = f"{video_url.rstrip('/')}/{relative_path}"
                   except ValueError:
                       pass
   ```
   Replace with:
   ```python
           access_token = config.get("instagram_access_token")
           instagram_business_id = config.get("instagram_business_id")
           video_url = config.get("public_video_url")  # signed, expiring URL built by publish_video_task
   ```
4. Add `timeout=60` to any `requests.get/post/put(...)` call in this file that has no `timeout=`. Check with `grep -n "requests\.\(get\|post\|put\)(" app/services/social_publish_service.py`.

**Verify:** `grep -rn "settings\.\(YOUTUBE_ACCESS_TOKEN\|FACEBOOK_ACCESS_TOKEN\|FACEBOOK_PAGE_ID\|INSTAGRAM_ACCESS_TOKEN\|INSTAGRAM_BUSINESS_ID\|PUBLIC_VIDEO_URL\)" app/` prints nothing.

**14.5 `backend/app/services/clip_rendering_service.py`: no pipe deadlock, with a timeout (BUG-12).**
1. Add `import tempfile` to the imports, plus `from app.services.ffmpeg import popen_ffmpeg, run_ffmpeg, timeout_for`.
2. Find `        process = None` (line ~96). Add a line directly below it: `        stderr_log = None`.
3. Find:
   ```python
               process = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
   ```
   Replace with:
   ```python
               stderr_log = tempfile.TemporaryFile()  # a file, not a pipe: a full pipe deadlocks both processes
               process = popen_ffmpeg(ffmpeg_cmd, stdin=subprocess.PIPE, stderr=stderr_log)
   ```
4. Find:
   ```python
               process.stdin.close()
               process.wait()
   ```
   Replace with:
   ```python
               process.stdin.close()
               process.wait(timeout=timeout_for(duration, factor=10))
   ```
5. Find `                stderr = process.stderr.read().decode()` and replace it with:
   ```python
                   stderr_log.seek(0)
                   stderr = stderr_log.read().decode(errors="ignore")[-4000:]
   ```
6. In the function's `finally:` block, add as its first lines:
   ```python
               if stderr_log is not None:
                   stderr_log.close()
   ```

**14.6 Every other ffmpeg/ffprobe call goes through `run_ffmpeg` (SEC-14, PERF-03).** List them with:
```bash
grep -rn "subprocess\.\(run\|Popen\)(" app/ | grep -v "app/services/ffmpeg.py"
```
For each line found (about 35, in `clip_rendering_service.py`, `master_agent.py`, `music_agent.py`, `subtitle_service.py`, `transcription_service.py`, `voice_service.py`, `tasks/video_tasks.py`):
1. Add `from app.services.ffmpeg import run_ffmpeg` (and `timeout_for` if you use it) to that file's imports.
2. Replace the call using this table:

| Old call | New call |
|---|---|
| `subprocess.run(cmd, capture_output=True, check=True)` | `run_ffmpeg(cmd)` |
| `subprocess.run(cmd, capture_output=True, text=True, check=True)` | `run_ffmpeg(cmd, text=True)` |
| `subprocess.run(cmd, capture_output=True)` and the code then checks `.returncode` | `run_ffmpeg(cmd, check=False)` |
| `subprocess.run(cmd, capture_output=True, text=True)` and the code then checks `.returncode` | `run_ffmpeg(cmd, check=False, text=True)` |
| `subprocess.run(cmd, capture_output=True)` and **nothing** checks the result (a silent failure) | `run_ffmpeg(cmd)`, which now raises on failure (BUG-03) |

3. **Timeout:** when a duration variable is in scope (`duration`, `clip.duration`, `video_duration`, `part_end - part_start`), pass `timeout=timeout_for(<that value>)`. Otherwise leave the default (30 minutes).
4. Remove `import subprocess` from a file only if nothing else in that file uses `subprocess` (e.g. `subprocess.CalledProcessError` in an `except` is still a use; keep the import then).

**Verify:** the grep above prints nothing.

**14.7 `backend/app/services/music_agent.py`: atomic cache writes (CONC-07).**
1. Add `import uuid` to the imports.
2. Find `                        temp_cache = f"{cached_path}.tmp"` and replace with `                        temp_cache = f"{cached_path}.{uuid.uuid4().hex}.tmp"  # unique per worker`.
3. Find:
   ```python
                                   if os.path.exists(cached_path):
                                       os.remove(cached_path)
                                   os.rename(temp_cache, cached_path)
   ```
   Replace with:
   ```python
                                   os.replace(temp_cache, cached_path)  # atomic, safe with concurrent workers
   ```
4. In the `apply_music` fallback (the last `subprocess.run([... "-c", "copy", ...], capture_output=True)` in the file), switch to `run_ffmpeg([...])` per 14.6. It must raise if even the copy fails.

**14.8 `backend/app/services/voice_service.py` (BUG-08 and an undefined-name crash).**
1. Add `import shutil` to the imports.
2. Find:
   ```python
           current_duration = self.get_audio_duration(input_wav)
           if current_duration <= 0 or target_duration <= 0:
               return
   ```
   Replace with:
   ```python
           current_duration = self.get_audio_duration(input_wav)
           if current_duration <= 0 or target_duration <= 0:
               shutil.copyfile(input_wav, output_wav)  # always produce the file the caller expects
               return
   ```
3. Delete the unreachable "Tertiary Fallback". It uses an undefined variable `gender_norm` (ruff F821). Delete from the line `        # 3. Tertiary Fallback: Local gTTS with pitch-shift` down to and including the `            return output_path` that ends its `except` block, which is the line just above `    def get_audio_duration(self, audio_path: str) -> float:`.

**Verify:** `uvx ruff check --select E9,F63,F7,F82 app` reports no errors. If `uvx` is not installed, run `pip install ruff` and then `ruff check ...`.

**14.9 `backend/app/services/subtitle_service.py`: untrusted style values (SEC-20).**
1. Add this directly below the existing imports at the top of the file:
   ```python
   import re

   ALLOWED_FONTS = {"Arial", "Arial Black", "Impact", "Nirmala UI", "Outfit", "Syne"}
   _HEX_COLOR = re.compile(r"^#[0-9A-Fa-f]{6}$")


   def _clamp_int(value, low: int, high: int, default: int) -> int:
       try:
           return max(low, min(high, int(value)))
       except (TypeError, ValueError):
           return default


   def _ass_text(text) -> str:
       """Plain caption text for an ASS Dialogue line: no override blocks, no line breaks."""
       return (str(text).replace("{", "(").replace("}", ")").replace("\\", "/")
               .replace("\r", " ").replace("\n", " "))
   ```
2. In `_color_to_ass`, find `        hex_color = hex_color.lstrip("#")`. Replace it with:
   ```python
           if not isinstance(hex_color, str) or not _HEX_COLOR.match(hex_color):
               return "&H00FFFFFF&"
           hex_color = hex_color.lstrip("#")
   ```
3. In `generate_ass`, find:
   ```python
           if style_config is None:
               style_config = {}
   ```
   Replace with:
   ```python
           if style_config is None:
               style_config = {}
           words = [{**w, "text": _ass_text(w.get("text", ""))} for w in (words or [])]
   ```
4. In `generate_ass`, find `        primary_color = self._color_to_ass(primary_color_hex)` and insert directly **above** it:
   ```python
           # Values from user edit_options are pasted into the ASS header: never trust them
           if font_name not in ALLOWED_FONTS:
               font_name = default_font if default_font in ALLOWED_FONTS else "Arial"
           font_size = _clamp_int(font_size, 20, 160, 70)
           outline_size = _clamp_int(outline_size, 0, 12, 4)
           shadow_size = _clamp_int(shadow_size, 0, 10, 1)
           alignment = _clamp_int(alignment, 1, 9, 2)
           margin_v = _clamp_int(margin_v, 0, 1500, 320)
   ```
5. Find `        resolution_y = style_config.get("resolution_y", 1920)` and add directly below it:
   ```python
           resolution_x = _clamp_int(resolution_x, 240, 3840, 1080)
           resolution_y = _clamp_int(resolution_y, 240, 3840, 1920)
   ```

**14.10 LLM client timeouts (PERF-03).** Add `timeout=60.0, max_retries=2,` as extra arguments to each of the 7 `OpenAI(` constructor calls. List them with `grep -n "OpenAI(" app/services/*.py`; they are in `content_understanding_service.py` (2), `highlight_detection_service.py` (1), `music_agent.py` (2) and `prompt_editing_agent.py` (2). Example:
```python
            self.client = OpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=self.api_key,
                timeout=60.0,
                max_retries=2,
            )
```
**Production note:** without `QWEN_API_KEY` these services fall back to a local Ollama at `localhost:11434`, which does not exist in the production containers. **`QWEN_API_KEY` is required in production.**

**14.11 `backend/app/services/transcription_service.py` (BUG-09, SEC-19).**
1. Delete the hand-written `.env` parser. Find:
   ```python
           if not gcp_creds:
               try:
                   # Try to load from .env file directly if present
   ```
   Delete from that line down to and including `                logger.debug(f"Failed to parse .env for credentials: {e}")`. `GOOGLE_APPLICATION_CREDENTIALS` must come from the real process environment (Docker `env_file` provides it in production).
2. Delete the transcript logging (it writes user content to logs). Find and delete:
   ```python
               logger.info(
                   f"[{segment.start:.2f}s -> {segment.end:.2f}s] "
                   f"{segment.text}"
               )
   ```
   Also find and delete:
   ```python
               logger.info("=== TRANSCRIPT DEBUG ===")

               for item in transcript[:50]:
                   logger.info(item)

               logger.info("========================")
   ```
   Also delete the trailing comment line `# Trigger reload: detected gcp-key.json added.`
3. Use Google STT only for audio it can actually handle. Synchronous recognize is limited to about 1 minute. Add this function directly above `class TranscriptionService`:
   ```python
   def _wav_duration_seconds(path: str) -> float:
       import wave
       try:
           with wave.open(path, "rb") as wav:
               return wav.getnframes() / float(wav.getframerate())
       except Exception:
           return float("inf")
   ```
   Then find `        if self.use_google and not self._google_quota_exhausted:` and replace it with:
   ```python
           if self.use_google and not self._google_quota_exhausted and _wav_duration_seconds(audio_path) <= 55:
   ```

---

### Step 15 — Database migrations: one correct baseline (fixes ARCH-03, DB-01)

The old Alembic history can't build a database (its first revision is empty). Production has never run, so we replace it with one baseline generated from the models.

Run from `backend/` with `DATABASE_URI` pointing at your **empty** local Postgres from Step 0:

```bash
git rm alembic/versions/*.py
alembic revision --autogenerate -m "baseline schema"
```

Open the generated file in `alembic/versions/`:
1. Replace every occurrence of `app.core.crypto.EncryptedJSON()` with `sa.Text()`. The column is plain TEXT in the database; encryption happens in Python.
2. Check that it creates the tables `users`, `projects`, `videos`, `clips` and `social_connections`, the indexes on `projects.owner_id`, `videos.project_id`, `videos.status`, `clips.video_id` and `social_connections.user_id`, and the unique constraint `uq_social_connections_user_platform`.

Then:
```bash
alembic upgrade head
alembic check        # must print: No new upgrade operations detected.
```

**From now on, every model change needs a migration:** run `alembic revision --autogenerate -m "<what changed>"`, review the file, then `alembic upgrade head`. The app never creates tables by itself.

---

### Step 16 — Frontend (fixes FE-01..13: login, the single API client, polling, media URLs, dependency CVEs, bundle size)

Run these commands from `frontend/`.

**16.0 Before you start:** run `npm ci`. Today `npm run lint` reports 84 errors on the **old** code. Step 16.16 brings it to **0 errors**, which Step 18's CI requires.

**16.1 Dependencies (SEC-22, FE-PERF-4):**
```bash
npm install axios@latest react-router-dom@latest
npm uninstall @react-three/postprocessing @vitejs/plugin-basic-ssl
npm audit fix
npm audit --omit=dev --audit-level=high     # must exit with code 0
```

**16.2** Replace the whole of `frontend/.env.example` and copy it to `frontend/.env`:
```bash
# Base URL of the API. In production the frontend and API share a domain, so this is just "/api/v1".
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

**16.3** Replace the whole of `frontend/vite.config.js`. This drops the self-signed HTTPS plugin and moves the Storybook test runner out of the production build:
```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { sourcemap: false },
});
```

**16.4** Replace the whole of `frontend/src/api/client.js`. This is now the **only** place that talks to the API:
```js
import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';
// Works for absolute ("http://localhost:8000/api/v1") and relative ("/api/v1") base URLs
export const API_ORIGIN = new URL(API_BASE_URL, window.location.origin).origin;

const TOKEN_KEY = 'harvest_token';
const ACTIVE_JOBS_KEY = 'harvest_active_generations';

const client = axios.create({ baseURL: API_BASE_URL, timeout: 30000 });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('harvest_user');
  localStorage.removeItem(ACTIVE_JOBS_KEY);
}

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    const isAuthCall = url.startsWith('/users/login') || url.startsWith('/users/register');
    if (error.response?.status === 401 && !isAuthCall) {
      clearSession();
      if (window.location.pathname !== '/login') {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.assign(`/login?next=${next}`);
      }
    }
    return Promise.reject(error);
  },
);

/** A message that is safe to show the user for a failed request. */
export function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg; // FastAPI validation error
  if (error?.code === 'ECONNABORTED') return 'The server took too long to respond. Please try again.';
  return fallback;
}

const data = (request) => request.then((response) => response.data);

function startSession(result) {
  clearSession();
  localStorage.setItem(TOKEN_KEY, result.access_token);
  return result.user;
}

export const api = {
  // ---- Auth ----
  login: (email, password) => data(client.post('/users/login', { email, password })).then(startSession),
  register: (email, password, fullName) =>
    data(client.post('/users/register', { email, password, full_name: fullName })).then(startSession),
  logout: clearSession,
  hasSession: () => Boolean(localStorage.getItem(TOKEN_KEY)),
  getCurrentUser: () => data(client.get('/users/me')),

  // ---- Projects ----
  getProjects: () => data(client.get('/projects/')),
  getProject: (projectId) => data(client.get(`/projects/${projectId}`)),
  createProject: (title, description) => data(client.post('/projects/', { title, description })),
  deleteProject: (projectId) => data(client.delete(`/projects/${projectId}`)),

  // ---- Videos ----
  getVideos: (projectId) => data(client.get('/videos/', { params: projectId ? { project_id: projectId } : {} })),
  getVideo: (videoId) => data(client.get(`/videos/${videoId}`)),
  uploadVideo: (projectId, file, onUploadProgress) => {
    const form = new FormData();
    form.append('project_id', projectId);
    form.append('file', file);
    return data(client.post('/videos/', form, { onUploadProgress, timeout: 0 })); // big files: no client timeout
  },
  deleteVideo: (videoId) => data(client.delete(`/videos/${videoId}`)),
  getVideoStatus: (videoId) => data(client.get(`/videos/${videoId}/status`)),
  getVariations: (videoId) => data(client.get(`/videos/${videoId}/variations`)),
  getClips: (videoId) => data(client.get(`/videos/${videoId}/clips`)),
  masterGenerate: (videoId, options) => data(client.post(`/videos/${videoId}/master-generate`, options)),
  cancelGeneration: (videoId) => data(client.post(`/videos/${videoId}/cancel-generation`)),
  cancelAllGenerations: () => data(client.post('/videos/cancel-all')), // cancels only YOUR jobs
  translateTranscript: (words, targetLang) =>
    data(client.post('/videos/translate-transcript', { words, target_lang: targetLang })),

  // ---- Clips ----
  renderClip: (videoId, clip) => data(client.post(`/videos/${videoId}/clips`, clip)),
  updateClip: (clipId, clip) => data(client.put(`/videos/clips/${clipId}`, clip)),
  getClip: (clipId) => data(client.get(`/videos/clips/${clipId}`)),
  publishClip: (clipId, platforms, title, description, privacy, force = false) =>
    data(client.post(`/videos/clips/${clipId}/publish`, { platforms, title, description, privacy, force })),

  // ---- Social connections (always the logged-in user) ----
  getConnections: () => data(client.get('/users/me/connections')),
  deleteConnection: (platform) => data(client.delete(`/users/me/connections/${platform}`)),
  getOAuthUrl: (platform) => data(client.get(`/users/me/auth/${platform}/url`)).then((d) => d.url),
};
```

**16.5** Create `frontend/src/hooks/usePolling.js`:
```js
import { useEffect, useRef } from 'react';

/**
 * Calls `fn` repeatedly while `enabled` is true.
 * - Waits for each call to finish before scheduling the next one (no pile-up when the API is slow).
 * - Backs off exponentially on errors, and slows down while the tab is hidden.
 * - Polls immediately when the tab becomes visible again.
 * - Stops when `fn` returns true, when `enabled` becomes false, and on unmount.
 */
export function usePolling(fn, { enabled = true, interval = 3000, maxInterval = 30000, immediate = false } = {}) {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let inFlight = false;
    let timer;
    let delay = interval;

    const schedule = (ms) => {
      clearTimeout(timer);
      timer = setTimeout(tick, ms);
    };

    async function tick() {
      if (cancelled || inFlight) return;
      if (document.hidden) {
        delay = Math.min(delay * 1.5, maxInterval);
        schedule(delay);
        return;
      }
      inFlight = true;
      try {
        const stop = await fnRef.current();
        if (stop === true || cancelled) return;
        delay = interval;
      } catch (error) {
        if (cancelled) return;
        console.warn('Polling request failed; backing off', error);
        delay = Math.min(delay * 2, maxInterval);
      } finally {
        inFlight = false;
      }
      schedule(delay);
    }

    const onVisible = () => {
      if (!document.hidden && !cancelled && !inFlight) {
        delay = interval;
        schedule(0);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    schedule(immediate ? 0 : interval);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, interval, maxInterval, immediate]);
}
```

**16.6** Create `frontend/src/components/RequireAuth.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api } from '../api/client';

/** Renders children only for a logged-in user; otherwise redirects to /login?next=<current page>. */
export default function RequireAuth({ children }) {
  const location = useLocation();
  const [state, setState] = useState(() => (api.hasSession() ? 'checking' : 'anonymous'));

  useEffect(() => {
    if (state !== 'checking') return undefined;
    let active = true;
    api.getCurrentUser()
      .then(() => { if (active) setState('ok'); })
      .catch(() => { if (active) setState('anonymous'); });
    return () => { active = false; };
  }, [state]);

  if (state === 'checking') return null;
  if (state === 'anonymous') {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return children;
}
```

**16.7** Create `frontend/src/components/LoginPage.jsx`:
```jsx
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';

// Only same-site relative paths are allowed as a redirect target (prevents open redirects)
function safeNext(value) {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/dashboard';
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isLogin = mode === 'login';

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (isLogin) await api.login(email, password);
      else await api.register(email, password, fullName);
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (err) {
      setError(errorMessage(err, isLogin ? 'Could not sign in.' : 'Could not create your account.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <form onSubmit={submit} className="glass-panel"
        style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '2rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{isLogin ? 'Sign in to Harvest AI' : 'Create your account'}</h1>
        {!isLogin && (
          <label>
            Full name
            <input className="input-field" value={fullName} maxLength={100} autoComplete="name"
              onChange={(e) => setFullName(e.target.value)} />
          </label>
        )}
        <label>
          Email
          <input className="input-field" type="email" required value={email} autoComplete="email"
            onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input className="input-field" type="password" required minLength={isLogin ? 1 : 8} maxLength={72}
            value={password} autoComplete={isLogin ? 'current-password' : 'new-password'}
            onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p role="alert" style={{ color: '#dc2626', margin: 0 }}>{error}</p>}
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? 'Please wait…' : isLogin ? 'Sign in' : 'Create account'}
        </button>
        <button type="button" onClick={() => { setMode(isLogin ? 'register' : 'login'); setError(''); }}
          style={{ background: 'none', border: 'none', color: 'var(--indigo-600)', cursor: 'pointer' }}>
          {isLogin ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>
      </form>
    </main>
  );
}
```

**16.8** Replace the whole of `frontend/src/App.jsx`. It adds the login route, protects every app page and loads each page lazily, so three.js only downloads on the landing page:
```jsx
import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { GenerationProvider } from './context/GenerationContext';
import FloatingGenerationWidget from './components/FloatingGenerationWidget';
import RequireAuth from './components/RequireAuth';
import './index.css';

const LandingPage = lazy(() => import('./components/LandingPage'));
const LoginPage = lazy(() => import('./components/LoginPage'));
const DashboardPage = lazy(() => import('./components/DashboardPage'));
const ProjectDetailPage = lazy(() => import('./components/ProjectDetailPage'));
const VideoProcessingPage = lazy(() => import('./components/VideoProcessingPage'));
const MasterGeneratorPage = lazy(() => import('./components/MasterGeneratorPage'));

function ProtectedLayout() {
  return (
    <RequireAuth>
      <Outlet />
      <FloatingGenerationWidget />
    </RequireAuth>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <GenerationProvider>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/project/:projectId" element={<ProjectDetailPage />} />
              <Route path="/video/:videoId" element={<VideoProcessingPage />} />
              <Route path="/master-generator/:videoId" element={<MasterGeneratorPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </GenerationProvider>
    </BrowserRouter>
  );
}
```
**Log-out button:** in `DashboardPage.jsx`, next to the existing header buttons, add:
```jsx
<button className="btn-secondary" onClick={() => { api.logout(); navigate('/login'); }}>Log out</button>
```
`api` and `navigate` already exist in that file.

**16.9 `frontend/src/context/GenerationContext.jsx`:**
1. Add `import { usePolling } from '../hooks/usePolling';` under the existing imports.
2. Find the block that starts with `  // Background polling loop` and ends with `  }, [activeTasks.length]);`. Replace the whole block with:
```jsx
  // Background polling: one status request per active task, with backoff (FE-PERF-1)
  usePolling(async () => {
    const tasks = activeTasksRef.current;
    if (tasks.length === 0) return true;
    const results = await Promise.allSettled(tasks.map((task) => api.getVideoStatus(task.videoId)));
    results.forEach((result, index) => {
      const task = tasks[index];
      if (result.status === 'rejected') {
        if (result.reason?.response?.status === 404) {
          setActiveTasks((prev) => prev.filter((t) => t.videoId !== task.videoId));
        }
        return;
      }
      const status = result.value;
      if (status.is_done) {
        setActiveTasks((prev) => prev.filter((t) => t.videoId !== task.videoId));
        setCompletedTasks((prev) => (prev.some((c) => c.videoId === task.videoId) ? prev : [
          ...prev,
          { videoId: task.videoId, videoTitle: status.original_filename || task.videoTitle, completedAt: Date.now() },
        ]));
      } else if (status.video_status === 'failed' || status.stage === 'idle') {
        setActiveTasks((prev) => prev.filter((t) => t.videoId !== task.videoId));
      } else {
        setActiveTasks((prev) => prev.map((t) => (t.videoId === task.videoId ? {
          ...t,
          videoTitle: status.original_filename || t.videoTitle,
          stage: status.stage || t.stage,
          stageLabel: status.stage_label || t.stageLabel,
          variationsReady: status.variations_ready || 0,
          variationsTotal: status.variations_total || 5,
          videoStatus: status.video_status,
        } : t)));
      }
    });
    if (results.every((r) => r.status === 'rejected')) throw new Error('All status requests failed');
    return false;
  }, { enabled: activeTasks.length > 0 && api.hasSession(), interval: 4000 });
```
`cancelAllGenerations` stays as it is. The backend now limits it to the caller's own jobs.

**16.10 `frontend/src/components/SocialPublishingPanel.jsx` (SEC-04, SEC-10, SEC-11, FE leaks):**
1. Change the first import line to `import { useState, useEffect, useRef, useCallback } from 'react';`. Change `import { motion, AnimatePresence } from 'framer-motion';` to `import { motion } from 'framer-motion';`. Change the API import to `import { api, API_ORIGIN, errorMessage } from '../api/client';`.
2. Delete everything from the line `  // Load connected accounts from Database (real storage)` down to and including the `  };` that closes `handlePublish` (the line directly above `  const getPlatformIcon = (platform, size = 20) => {`). Paste in its place:
```jsx
  const publishTimerRef = useRef(null);
  const authCleanupRef = useRef(null);

  // Stop every timer and listener when the panel closes
  useEffect(() => () => {
    clearTimeout(publishTimerRef.current);
    authCleanupRef.current?.();
  }, []);

  // Credentials never reach the browser: we only get account name/handle/avatar (SEC-04)
  const loadConnections = useCallback(async () => {
    const data = await api.getConnections();
    const loaded = { youtube: null, facebook: null, instagram: null };
    const preSelect = { youtube: false, facebook: false, instagram: false };
    data.forEach((conn) => {
      loaded[conn.platform] = { name: conn.account_name, handle: conn.account_handle, avatar: conn.account_avatar };
      preSelect[conn.platform] = true;
    });
    setConnections(loaded);
    setSelectedPlatforms(preSelect);
    return loaded;
  }, []);

  useEffect(() => {
    loadConnections().catch((e) => console.error('Failed to load connections', e));
  }, [loadConnections]);

  const handleConnect = async (platform) => {
    const w = 550;
    const h = 720;
    const left = window.screen.width / 2 - w / 2;
    const top = window.screen.height / 2 - h / 2;
    // Open the popup synchronously inside the click so pop-up blockers allow it; point it at the provider after.
    const popup = window.open('', `connect_${platform}`,
      `width=${w},height=${h},top=${top},left=${left},status=no,menubar=no,toolbar=no`);
    if (!popup) {
      alert('Please allow pop-ups for this site to connect your account.');
      return;
    }
    let url;
    try {
      url = await api.getOAuthUrl(platform);
    } catch (e) {
      popup.close();
      alert(errorMessage(e, 'Could not start the connection. Please try again.'));
      return;
    }
    popup.location.href = url;

    authCleanupRef.current?.();
    let timer = null;
    const onMessage = async (event) => {
      if (event.origin !== API_ORIGIN) return; // only trust messages from our own API's popup (SEC-11)
      if (event.data?.type === 'HARVEST_AUTH_SUCCESS' && event.data?.platform === platform) {
        cleanup();
        loadConnections().catch((e) => console.error(e));
      } else if (event.data?.type === 'HARVEST_AUTH_FAILURE') {
        cleanup();
        alert(`Connection failed: ${event.data.error}`);
      }
    };
    function cleanup() {
      window.removeEventListener('message', onMessage);
      clearInterval(timer);
      authCleanupRef.current = null;
    }
    window.addEventListener('message', onMessage);
    // Fallback for providers that cut the popup's link to this window: watch the server for up to 2 minutes.
    let checks = 0;
    timer = setInterval(async () => {
      checks += 1;
      if (checks > 60) { cleanup(); return; } // 60 x 2 s
      try {
        const loaded = await loadConnections();
        if (loaded[platform]) cleanup();
      } catch {
        /* keep trying until the timeout */
      }
    }, 2000);
    authCleanupRef.current = cleanup;
  };

  const handleDisconnect = async (platform) => {
    try {
      await api.deleteConnection(platform);
      setConnections((prev) => ({ ...prev, [platform]: null }));
      setSelectedPlatforms((prev) => ({ ...prev, [platform]: false }));
    } catch (e) {
      alert(errorMessage(e, 'Failed to disconnect. Please try again.'));
    }
  };

  const togglePlatformSelection = (platform) => {
    if (!connections[platform]) {
      handleConnect(platform);
      return;
    }
    setSelectedPlatforms((prev) => ({ ...prev, [platform]: !prev[platform] }));
  };

  const handlePublish = async () => {
    const activePlatforms = Object.keys(selectedPlatforms).filter((k) => selectedPlatforms[k]);
    if (activePlatforms.length === 0) {
      alert('Please select at least one connected platform to publish to.');
      return;
    }
    setIsPublishing(true);
    setPublishSuccess(false);
    setPublishProgress(activePlatforms.map((p) => ({
      platform: p, stage: 'handshake', label: 'Connecting to server API...', status: 'running',
    })));
    try {
      await api.publishClip(clip.id, activePlatforms, title, description, privacy);
    } catch (e) {
      setIsPublishing(false);
      setPublishProgress([]);
      alert(errorMessage(e, 'Publishing failed. Please try again.'));
      return;
    }
    setPublishProgress(activePlatforms.map((p) => ({
      platform: p, stage: 'uploading', label: 'Uploading and processing video on platform servers...', status: 'running',
    })));

    let delay = 3000;
    let waited = 0;
    const poll = async () => {
      let urls = {};
      try {
        urls = (await api.getClip(clip.id)).published_urls || {};
        delay = 3000;
      } catch (err) {
        console.error('Error polling publishing status:', err);
        delay = Math.min(delay * 2, 30000);
      }
      const finished = (p) => Boolean(urls[p]) && urls[p] !== 'publishing';
      setPublishProgress((prev) => prev.map((item) => {
        const value = urls[item.platform];
        if (!finished(item.platform)) {
          return { ...item, stage: 'indexing', label: `Processing on ${getPlatformLabel(item.platform)} API servers...`, status: 'running' };
        }
        if (value.startsWith('error:')) {
          return { ...item, stage: 'failed', label: `Publishing failed: ${value.substring(6).trim()}`, status: 'failed' };
        }
        return { ...item, stage: 'success', label: 'Video successfully published!', status: 'completed' };
      }));
      if (activePlatforms.every(finished)) {
        setIsPublishing(false);
        const successUrls = {};
        activePlatforms.forEach((p) => { if (!urls[p].startsWith('error:')) successUrls[p] = urls[p]; });
        if (Object.keys(successUrls).length > 0) {
          setPublishSuccess(true);
          setShareUrls(successUrls);
        } else {
          alert('Publishing failed on every platform. Please check your connected accounts and try again.');
        }
        return;
      }
      waited += delay;
      if (waited > 10 * 60 * 1000) {
        setIsPublishing(false);
        alert('Publishing is taking longer than expected. Check the platform in a few minutes.');
        return;
      }
      publishTimerRef.current = setTimeout(poll, delay);
    };
    publishTimerRef.current = setTimeout(poll, delay);
  };
```

**16.11 `frontend/src/components/MasterGeneratorPage.jsx`:**
1. Delete lines 9-10 (`const SERVER_URL = ...` and `const API_BASE = ...`).
2. Change `import { api } from '../api/client';` to `import { api, errorMessage } from '../api/client';`. Add `import { usePolling } from '../hooks/usePolling';`.
3. Find:
   ```jsx
   function VariationCard({ clip, index, onPublishClick, cacheBust }) {
     const storagePath = (clip.storage_path || '').replace(/\\/g, '/');
     const relPath = storagePath.includes('uploads/') ? storagePath.substring(storagePath.indexOf('uploads/')) : storagePath;
     const url = `${SERVER_URL}/${relPath}?t=${cacheBust}`;
   ```
   Replace with:
   ```jsx
   function VariationCard({ clip, index, onPublishClick }) {
     const url = clip.media_url || ''; // signed, stable URL from the API
   ```
4. Find `  const { startTracking, stopTracking, cancelGeneration: cancelGenContext, activeTasks } = useGeneration();` and remove `, activeTasks`.
5. Delete the line `  const [cacheBust, setCacheBust] = useState(Date.now());`. Then delete the line `                cacheBust={cacheBust}` where `<VariationCard` is rendered.
6. Delete everything from `  const intervalRef = useRef(null);` down to and including `  useEffect(() => () => stopPolling(), [stopPolling]);`. Paste in its place:
```jsx
  const startTimeRef = useRef(null);
  const isGeneratingPage = page === 'generating';

  const loadVideoDetails = useCallback(async () => {
    try {
      const [current, varData] = await Promise.all([api.getVideo(videoId), api.getVariations(videoId)]);
      setVideo(current);
      setVariations(varData);
      if (current.status === 'processing') setPage('generating');
      else if (varData.length > 0) setPage('results');
      else setPage('setup');
    } catch (e) {
      if (e.response?.status === 404) navigate('/dashboard');
      else console.error('Failed to load video', e);
    }
  }, [videoId, navigate]);

  useEffect(() => { loadVideoDetails(); }, [loadVideoDetails]);

  // Elapsed-time counter while the generating page is open
  useEffect(() => {
    if (!isGeneratingPage) return undefined;
    const startedAt = startTimeRef.current || Date.now();
    startTimeRef.current = startedAt;
    const id = setInterval(() => setElapsedSecs(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => {
      clearInterval(id);
      startTimeRef.current = null;
    };
  }, [isGeneratingPage]);

  const formatElapsed = (s) => `${Math.floor(s / 60)}m ${(s % 60).toString().padStart(2, '0')}s`;

  // ONE progress poller, only while the generating page is open; it stops itself when the job ends
  usePolling(async () => {
    const status = await api.getVideoStatus(videoId);
    setPipelineStatus(status);
    if (status.is_done) {
      stopTracking(Number(videoId));
      setVariations(await api.getVariations(videoId));
      setPage('results');
      return true;
    }
    if (status.video_status === 'failed') {
      stopTracking(Number(videoId));
      setPage('setup');
      if (!isCancelling) alert('The generation failed or was cancelled. Please try again.');
      return true;
    }
    if (status.variations_ready !== variations.length) {
      setVariations(await api.getVariations(videoId));
    }
    return false;
  }, { enabled: isGeneratingPage, interval: 3000, immediate: true });

  const generate = async () => {
    if (!video || isGenerating) return;
    setIsGenerating(true);
    setVariations([]);
    setPipelineStatus(null);
    try {
      await api.masterGenerate(video.id, {
        length: Number(length),
        platform: 'youtube',
        optional_prompt: prompt,
        audio_theme: audioTheme,
        translate_language: translateLanguage,
        dub_voice: Boolean(dubVoice && translateLanguage !== 'none'),
        speaker_gender: speakerGender,
        caption_language: translateLanguage === 'none' ? 'original' : captionLanguage,
        dub_mix_mode: dubMixMode,
        framing_mode: framingMode,
      });
      startTracking(video.id, video.original_filename);
      startTimeRef.current = Date.now();
      setElapsedSecs(0);
      setPage('generating');
    } catch (e) {
      alert(errorMessage(e, 'Could not start the generation. Please try again.'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCancelGeneration = async () => {
    setIsCancelling(true);
    try {
      await cancelGenContext(video.id);
      setPipelineStatus(null);
      setPage('setup');
    } finally {
      setIsCancelling(false);
    }
  };
```
7. Find `onClick={() => { stopPolling(); setPage('setup'); }}` and replace it with `onClick={() => setPage('setup')}`.
8. Find `— polling every 5s` and replace it with `— updates automatically`.

**16.12 `frontend/src/components/VideoProcessingPage.jsx`:**
1. Delete lines 8-9 (`const SERVER_URL = ...`, `const API_BASE = ...`). Change the API import to `import { api, errorMessage } from '../api/client';`. Add `import { usePolling } from '../hooks/usePolling';`.
2. Delete the line `  const [cacheBust, setCacheBust] = useState(Date.now());`.
3. Replace the two translation effects. Delete from `  /* Translation effect */` down to and including the second effect's closing line `  }, [captionLanguage, video, translateLanguage, translatedTranscript]);`. Paste:
```jsx
  /* Translation previews: re-run when the language or transcript changes, NOT on every poll (FE-PERF-3) */
  const transcriptKey = video ? `${video.id}:${video.transcript?.length || 0}` : '';

  useEffect(() => {
    if (translateLanguage === 'none' || !video?.transcript?.length) { setTranslatedTranscript(null); return undefined; }
    let active = true;
    setTranslating(true);
    api.translateTranscript(video.transcript, translateLanguage)
      .then((d) => { if (active && d?.length) setTranslatedTranscript(d); })
      .catch((e) => console.error('Translation preview failed', e))
      .finally(() => { if (active) setTranslating(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translateLanguage, transcriptKey]);

  useEffect(() => {
    if (captionLanguage !== 'english' || !video?.transcript?.length) { setEnglishTranscript(null); return undefined; }
    if (translateLanguage === 'en') { setEnglishTranscript(translatedTranscript); return undefined; }
    let active = true;
    setFetchingEnglish(true);
    api.translateTranscript(video.transcript, 'en')
      .then((d) => { if (active) setEnglishTranscript(d); })
      .catch((e) => console.error('English caption preview failed', e))
      .finally(() => { if (active) setFetchingEnglish(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captionLanguage, transcriptKey, translateLanguage, translatedTranscript]);
```
4. Replace the "Load video" effect. Find:
   ```jsx
     /* Load video */
     useEffect(() => {
       (async () => {
         try {
           const allVideos = await api.getVideos();
           const current = allVideos.find(v => v.id === parseInt(videoId));
           if (current) setVideo(current); else navigate('/dashboard');
         } catch (e) { console.error(e); }
       })();
     }, [videoId]);
   ```
   Replace with:
   ```jsx
     /* Load video (one request for one video, FE-PERF-2) */
     useEffect(() => {
       api.getVideo(videoId).then(setVideo).catch((e) => {
         if (e.response?.status === 404) navigate('/dashboard');
         else console.error(e);
       });
     }, [videoId, navigate]);
   ```
5. Replace polling. Delete from `  /* Polling */` down to and including `  }, [video, isPipelineActive]);`. Paste:
```jsx
  /* Polling: only while something is running; one loop with backoff (FE-PERF-1) */
  const isPipelineActive = Boolean(video) && (
    video.status === 'pending' || video.status === 'processing' ||
    clips.some((c) => c.status === 'pending' || c.status === 'rendering')
  );

  useEffect(() => {
    if (!video?.id) return;
    api.getClips(video.id).then(setClips).catch((e) => console.error('Failed to load clips', e));
  }, [video?.id]);

  usePolling(async () => {
    const [fresh, status, freshClips] = await Promise.all([
      api.getVideo(video.id), api.getVideoStatus(video.id), api.getClips(video.id),
    ]);
    setVideo(fresh);
    setPipelineStatus(status);
    setClips(freshClips);
  }, { enabled: isPipelineActive, interval: 3000 });
```
6. Media URLs. Delete from `  const backendUrl = SERVER_URL;` down to and including the `const shortUrl = ...` line. Paste:
```jsx
  const videoUrl = video.media_url || ''; // signed, stable URL: the player is not reloaded on every poll
  const shortUrl = '';
```
7. Replace the whole `const steps = [ ... ];` array with this. The step-by-step endpoints were removed (BUG-07); the Master Generator does all of them:
```jsx
  const steps = [
    { key: 'metadata', title: 'Video Metadata Extraction', description: 'Extract FPS, resolution, bitrate, and audio streams.', status: video.status, canTrigger: false },
    { key: 'transcription', title: 'Audio Transcription', description: 'Word-level timestamps (runs inside the Master Generator).', status: video.transcription_status, canTrigger: false },
    { key: 'analysis', title: 'AI Content Analysis', description: 'Topic, key scenes and highlights (runs inside the Master Generator).', status: video.analysis_status, canTrigger: false },
    { key: 'highlights', title: 'Highlight Candidates Selection', description: 'Top sequences and viral appeal (runs inside the Master Generator).', status: video.highlight_status, canTrigger: false },
    { key: 'crop', title: 'Smart Cropping Trajectory (9:16)', description: 'Computed automatically when you render with Smart Crop.', status: video.crop_status, canTrigger: false },
  ];
```
8. "Render Clip" button. Find the two style lines:
   ```jsx
                               background: (framingMode === 'smart_crop' && video.crop_status !== 'completed') ? 'var(--bg-inset)' : 'var(--accent-dark)',
                               color: (framingMode === 'smart_crop' && video.crop_status !== 'completed') ? 'var(--text-faint)' : '#fff',
   ```
   Replace them with:
   ```jsx
                               background: 'var(--accent-dark)',
                               color: '#fff',
   ```
   Delete the two lines that start with `disabled={framingMode === 'smart_crop'` and `title={framingMode === 'smart_crop'`. Smart crop is now computed on demand by the render task.

   Then replace the button's `onClick={async () => { try { await fetch(...clips`, { ... }); } catch (e) { console.error(e); } }}` handler (from `onClick={async () => {` down to the `}}` just above `>` and `<Film size={12} /> Render Clip`) with:
   ```jsx
                             onClick={async () => {
                               try {
                                 const created = await api.renderClip(video.id, {
                                   title: clip.title,
                                   start_time: clip.start_time,
                                   end_time: clip.end_time,
                                   edit_options: {
                                     translate_language: translateLanguage,
                                     dub_voice: dubVoice,
                                     caption_language: captionLanguage,
                                     dub_mix_mode: dubMixMode,
                                     framing_mode: framingMode,
                                     subtitles: getSubtitles(),
                                   },
                                 });
                                 setClips((prev) => [...prev, created]); // starts polling until it finishes
                               } catch (e) {
                                 alert(errorMessage(e, 'Could not start rendering. Please try again.'));
                               }
                             }}
   ```
9. Find the clip player whose `src` starts with `` src={`${SERVER_URL}/${(c.storage_path `` (one long line) and replace the whole `src={...}` attribute with `src={c.media_url}`.

**Verify:** `grep -rn "SERVER_URL\|API_BASE\b\|fetch(\|storage_path\|getUserConnections\|cacheBust" src/components src/context` prints nothing.

**16.13 `frontend/src/components/ProjectDetailPage.jsx`:**
1. Delete line 11 (`const API_BASE = ...`). Change the API import to `import { api, errorMessage } from '../api/client';`. Add `import { usePolling } from '../hooks/usePolling';`.
2. Replace the body of `loadData` (from `    try {` down to its closing `  };`) with:
```jsx
    try {
      const [currentProject, projectVideos] = await Promise.all([
        api.getProject(projectId),
        api.getVideos(projectId),
      ]);
      setProject(currentProject);
      setVideos(projectVideos);
    } catch (err) {
      if (err.response?.status === 404) navigate('/dashboard');
      else console.error('Failed to load project details', err);
    } finally {
      setLoading(false);
    }
  };
```
3. Find:
   ```jsx
     useEffect(() => {
       if (!hasProcessingVideos) return;
       const interval = setInterval(loadData, 3000);
       return () => clearInterval(interval);
     }, [hasProcessingVideos]);
   ```
   Replace with:
   ```jsx
     usePolling(loadData, { enabled: hasProcessingVideos, interval: 4000 });
   ```
4. Upload files one at a time instead of all in parallel (FE-12). Find from `      let completedCount = 0;` down to and including `      const responses = await Promise.all(uploadPromises);`. Replace with:
```jsx
      const responses = [];
      for (const [idx, file] of files.entries()) {
        if (files.length > 1) setUploadingStatus(`Uploading ${idx + 1} of ${files.length}: ${file.name}…`);
        const res = await api.uploadVideo(parseInt(projectId), file, (ev) => {
          const current = ev.total ? ev.loaded / ev.total : 0;
          setProgress(Math.round(((idx + current) / files.length) * 100));
        });
        responses.push(res);
      }
```
   In the same function's `catch`, replace `alert('One or more video uploads failed. Please check the backend connection.');` with `alert(errorMessage(err, 'One or more uploads failed. Please try again.'));`.

**16.14 `frontend/src/components/DashboardPage.jsx`:** add `import { usePolling } from '../hooks/usePolling';`. Then find:
```jsx
  useEffect(() => {
    if (!hasActivePipelines) return;
    const id = setInterval(loadData, 4000);
    return () => clearInterval(id);
  }, [hasActivePipelines]);
```
Replace with:
```jsx
  usePolling(loadData, { enabled: hasActivePipelines, interval: 5000 });
```

**16.15 Delete dead files (QUAL-04):**
```bash
git rm -r src/stories src/components/HtmlOverlay.jsx src/components/Scene.jsx src/components/ProjectNode.jsx src/App.css src/assets/react.svg
git rm ../read.md ../harvest_AI_Colab.ipynb
```
`HtmlOverlay`, `Scene` and `ProjectNode` aren't imported anywhere. The notebook is invalid JSON and won't open.

**16.16 Make the linter pass (required by CI):**

1. Remove Storybook. It isn't part of the product, its template files account for about 40 of the lint errors, and its test runner was already detached in 16.3:
   ```bash
   git rm -r .storybook src/components/*.stories.jsx
   npm uninstall @chromatic-com/storybook @storybook/addon-a11y @storybook/addon-docs @storybook/addon-mcp @storybook/addon-vitest @storybook/react-vite @vitest/browser-playwright @vitest/coverage-v8 eslint-plugin-storybook playwright storybook vitest
   npm pkg delete scripts.storybook scripts.build-storybook
   ```
2. Replace the whole of `frontend/eslint.config.js`. Real bugs stay **errors**, e.g. `no-undef`, `no-unused-vars` and the rules of hooks. The new React-Compiler "readiness" rules become **warnings**: they flag existing patterns that work today and get cleaned up in Part E.
   ```js
   import js from '@eslint/js';
   import globals from 'globals';
   import reactHooks from 'eslint-plugin-react-hooks';
   import reactRefresh from 'eslint-plugin-react-refresh';
   import { defineConfig, globalIgnores } from 'eslint/config';

   export default defineConfig([
     globalIgnores(['dist']),
     {
       files: ['**/*.{js,jsx}'],
       extends: [js.configs.recommended, reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
       languageOptions: {
         globals: globals.browser,
         parserOptions: { ecmaFeatures: { jsx: true } },
       },
       rules: {
         // React Compiler readiness rules: advisory until those components are refactored (Part E)
         'react-hooks/set-state-in-effect': 'warn',
         'react-hooks/refs': 'warn',
         'react-hooks/static-components': 'warn',
         'react-hooks/purity': 'warn',
         'react-hooks/immutability': 'warn',
         'react-hooks/preserve-manual-memoization': 'warn',
         // A context module exporting its Provider and its hook together is intentional
         'react-refresh/only-export-components': 'warn',
       },
     },
   ]);
   ```
3. Remove unused imports and variables (exact edits):

   | File | Find | Replace with |
   |---|---|---|
   | `src/components/DashboardPage.jsx` | `import React, { useState, useEffect } from 'react';` | `import { useState, useEffect } from 'react';` |
   | `src/components/FloatingGenerationWidget.jsx` | `import React, { useState } from 'react';` | `import { useState } from 'react';` |
   | `src/components/FloatingGenerationWidget.jsx` | `ExternalLink, Trash2, Film, Sparkles` | `ExternalLink, Sparkles` |
   | `src/components/MasterGeneratorPage.jsx` | `Clock, Globe, Mic,` | `Clock, Mic,` |
   | `src/components/ProjectDetailPage.jsx` | `import React, { useState, useEffect } from 'react';` | `import { useState, useEffect } from 'react';` |
   | `src/components/ProjectDetailPage.jsx` | `const { activeTasks, startTrackingBatch, cancelGeneration, cancelAllGenerations } = useGeneration();` | `const { activeTasks, cancelGeneration, cancelAllGenerations } = useGeneration();` |
   | `src/components/VideoProcessingPage.jsx` | `import React, { useState, useEffect, useRef } from 'react';` | `import { useState, useEffect, useRef } from 'react';` |
   | `src/components/VideoProcessingPage.jsx` | `import { ChevronLeft, Scissors, Mic, Wand,` | `import { Scissors, Wand,` |
   | `src/context/GenerationContext.jsx` | `import React, { createContext,` | `import { createContext,` |
   | `src/context/GenerationContext.jsx` | `    } catch {}` | `    } catch {` / `      /* storage unavailable (e.g. private mode): nothing to clear */` / `    }` (three lines) |

**Verify:**
- `npm run lint` reports **0 errors** (about 15 warnings remain; they are tracked in Part E).
- `npm run build` succeeds, and the build output lists separate chunks per page (three.js only in the `LandingPage` chunk).
- Manually:
  - log in,
  - create a project,
  - upload a short MP4,
  - generate,
  - watch progress,
  - play a variation,
  - log out, and confirm that going to `/dashboard` sends you to `/login`.

---

### Step 17 — Production deployment (fixes SEC-08, SEC-12, SEC-15, SEC-17, PERF-07, OPS-02)

Target: **one Linux host** (for example 8+ vCPU, 32 GB RAM, optional NVIDIA GPU), Docker Compose, nginx in front, TLS from Let's Encrypt. Part E covers scaling out to more hosts.

**17.1** Create `backend/.dockerignore`:
```gitignore
.env
.env.*
!.env.example
*.pem
*.db
*.sqlite3
*.log
gcp-key.json
uploads/
scratch/
.venv/
venv/
__pycache__/
**/__pycache__/
.pytest_cache/
tests/
.git
```

**17.2** Replace the whole of `backend/Dockerfile`:
```dockerfile
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# ffmpeg for media; libgl/libglib for OpenCV and MediaPipe
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

# Never run as root (SEC-15)
RUN useradd --create-home --uid 10001 app \
 && mkdir -p /data/media /data/scratch \
 && chown -R app:app /app /data
USER app

ENV MEDIA_ROOT=/data/media \
    SCRATCH_DIR=/data/scratch

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4", "--proxy-headers", "--forwarded-allow-ips", "*"]
```

**17.3** Delete the old `backend/docker-compose.yml` and `backend/nginx.conf` (`git rm`). Create the folder `deploy/` at the repo root with the four files below.

`deploy/docker-compose.prod.yml`:
```yaml
name: harvest

x-backend: &backend
  build:
    context: ../backend
  image: harvest-backend:latest
  env_file: ../backend/.env.production
  environment:
    ENV: production
    DATABASE_URI: postgresql://harvest:${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}@db:5432/harvest
    REDIS_URL: redis://:${REDIS_PASSWORD:?set REDIS_PASSWORD}@redis:6379/0
    MEDIA_ROOT: /data/media
    SCRATCH_DIR: /data/scratch
    USE_X_ACCEL_REDIRECT: "true"
    DB_POOL_SIZE: "5"
    DB_MAX_OVERFLOW: "10"
  volumes:
    - media:/data/media
    - scratch:/data/scratch
    - model_cache:/home/app/.cache
  depends_on:
    db: { condition: service_healthy }
    redis: { condition: service_healthy }
    migrate: { condition: service_completed_successfully }
  restart: unless-stopped

services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: harvest
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}
      POSTGRES_DB: harvest
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U harvest -d harvest"]
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped
    # NO "ports:"; only reachable inside this compose network (SEC-08)

  redis:
    image: redis:7-alpine
    command: ["redis-server", "--requirepass", "${REDIS_PASSWORD:?set REDIS_PASSWORD}", "--appendonly", "yes"]
    environment:
      REDIS_PASSWORD: ${REDIS_PASSWORD}
    volumes: [redisdata:/data]
    healthcheck:
      test: ["CMD-SHELL", "redis-cli -a \"$$REDIS_PASSWORD\" --no-auth-warning ping | grep PONG"]
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped
    # NO "ports:"

  migrate:
    <<: *backend
    command: ["alembic", "upgrade", "head"]
    depends_on:
      db: { condition: service_healthy }
    restart: "no"

  api:
    <<: *backend
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/v1/readyz', timeout=3).status == 200 else 1)"]
      interval: 15s
      timeout: 5s
      retries: 3

  worker-pipeline:   # heavy AI pipeline: 1 process (= 1 GPU). Add hosts/GPUs to scale (Part E)
    <<: *backend
    command: ["celery", "-A", "app.core.celery_app", "worker", "-Q", "pipeline", "-c", "1", "-n", "pipeline@%h", "--loglevel=INFO"]
    # GPU host: uncomment
    # deploy:
    #   resources:
    #     reservations:
    #       devices: [{ driver: nvidia, count: 1, capabilities: [gpu] }]

  worker-render:     # ffmpeg re-renders
    <<: *backend
    command: ["celery", "-A", "app.core.celery_app", "worker", "-Q", "render", "-c", "2", "-n", "render@%h", "--loglevel=INFO"]

  worker-io:         # publishing + maintenance (network-bound)
    <<: *backend
    command: ["celery", "-A", "app.core.celery_app", "worker", "-Q", "io", "-c", "8", "-n", "io@%h", "--loglevel=INFO"]

  beat:              # scheduler for the stuck-job sweeper (exactly ONE instance)
    <<: *backend
    command: ["celery", "-A", "app.core.celery_app", "beat", "--loglevel=INFO", "--schedule", "/data/scratch/celerybeat-schedule"]

  nginx:
    build:
      context: ..
      dockerfile: deploy/nginx.Dockerfile
    ports: ["80:80", "443:443"]   # the ONLY published ports
    volumes:
      - media:/data/media:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      api: { condition: service_healthy }
    restart: unless-stopped

volumes:
  pgdata: {}
  redisdata: {}
  media: {}
  scratch: {}
  model_cache: {}
```

`deploy/nginx.Dockerfile`:
```dockerfile
FROM node:20-alpine AS frontend
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ENV VITE_API_BASE_URL=/api/v1
RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=frontend /src/dist /usr/share/nginx/html
```

`deploy/security-headers.conf`:
```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
```

`deploy/nginx.conf` (replace `yourdomain.com` everywhere with your domain):
```nginx
limit_req_zone $binary_remote_addr zone=auth:10m rate=10r/m;
limit_req_zone $binary_remote_addr zone=api:10m rate=20r/s;
limit_req_status 429;

upstream harvest_api {
    server api:8000;
    keepalive 32;
}

server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL:10m;

    server_tokens off;
    client_max_body_size 16m;            # API default; the upload location overrides it
    gzip on;
    gzip_min_length 1024;
    gzip_types text/css application/javascript application/json image/svg+xml;

    include /etc/nginx/snippets/security-headers.conf;

    # Shared proxy settings (keep-alive to the API; real client IP for rate limits)
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;

    # ---- Frontend (single-page app) ----
    location / {
        root /usr/share/nginx/html;
        try_files $uri /index.html;
        include /etc/nginx/snippets/security-headers.conf;
        add_header Cache-Control "no-cache" always;
        add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; media-src 'self' blob:; connect-src 'self' https:; worker-src 'self' blob:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" always;
    }
    location /assets/ {               # hashed build files: cache forever
        root /usr/share/nginx/html;
        include /etc/nginx/snippets/security-headers.conf;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }

    # ---- API ----
    location /api/ {
        limit_req zone=api burst=40 nodelay;
        proxy_pass http://harvest_api;
    }
    location = /api/v1/users/login {
        limit_req zone=auth burst=5 nodelay;
        proxy_pass http://harvest_api;
    }
    location = /api/v1/users/register {
        limit_req zone=auth burst=3 nodelay;
        proxy_pass http://harvest_api;
    }
    location = /api/v1/videos/ {      # video upload (POST) and list (GET)
        limit_req zone=api burst=10;
        client_max_body_size 2100m;
        client_body_timeout 300s;
        proxy_request_buffering off;  # stream to the API instead of spooling 2 GB to nginx's disk
        proxy_read_timeout 900s;
        proxy_send_timeout 900s;
        proxy_pass http://harvest_api;
    }

    # ---- Media: only reachable via X-Accel-Redirect from a validly signed /api/v1/media/... URL ----
    location /_protected/ {
        internal;
        alias /data/media/;
        include /etc/nginx/snippets/security-headers.conf;
        add_header Cache-Control "private, max-age=3600" always;
    }
}
```

**17.4 Server setup (once):**
```bash
# 1. Firewall: only SSH, HTTP, HTTPS
sudo ufw default deny incoming && sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw enable

# 2. TLS certificate (nginx must not be running yet)
sudo apt-get install -y certbot
sudo certbot certonly --standalone -d yourdomain.com
# Auto-renew: stop nginx briefly, renew, start it again
echo '0 3 * * * root certbot renew --pre-hook "docker compose -f /srv/harvest/deploy/docker-compose.prod.yml stop nginx" --post-hook "docker compose -f /srv/harvest/deploy/docker-compose.prod.yml start nginx"' | sudo tee /etc/cron.d/certbot-harvest

# 3. Secrets (never committed)
cd /srv/harvest
cp backend/.env.example backend/.env.production && chmod 600 backend/.env.production
#    Fill in .env.production:
#      SECRET_KEY, TOKEN_ENC_KEY (generate as in Step 2.3), QWEN_API_KEY, SENTRY_DSN,
#      FRONTEND_ORIGIN=https://yourdomain.com, PUBLIC_API_URL=https://yourdomain.com,
#      GOOGLE_/META_ client ids and secrets, redirect URIs with https://yourdomain.com/...
#    (DATABASE_URI and REDIS_URL are set by the compose file. Leave them out.)
cat > deploy/.env <<EOF
POSTGRES_PASSWORD=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
REDIS_PASSWORD=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
EOF
chmod 600 deploy/.env
```
Add `deploy/.env` to the repo-root `.gitignore`.

**17.5 Deploy / update:**
```bash
cd /srv/harvest && git pull
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build
docker compose -f deploy/docker-compose.prod.yml ps        # everything "running"/"healthy"; migrate "exited (0)"
```

**17.6 Backups (do not skip):**
```bash
# Nightly database dump, kept 14 days
cat > /etc/cron.daily/harvest-db-backup <<'EOF'
#!/bin/sh
cd /srv/harvest
docker compose -f deploy/docker-compose.prod.yml exec -T db pg_dump -U harvest -Fc harvest > /var/backups/harvest-$(date +\%F).dump
find /var/backups -name 'harvest-*.dump' -mtime +14 -delete
EOF
chmod +x /etc/cron.daily/harvest-db-backup
```
Copy `/var/backups` off the host (for example to object storage) and **test a restore once**: `pg_restore -d <empty db> harvest-<date>.dump`. Also store `TOKEN_ENC_KEY` and `SECRET_KEY` in a password manager. Without `TOKEN_ENC_KEY`, a restored database's social tokens can't be read.

**Verify (from your laptop):**
```bash
nmap -Pn yourdomain.com                                  # only 22, 80, 443 open
curl -sI https://yourdomain.com | grep -i strict-transport  # HSTS present
curl -s https://yourdomain.com/api/v1/readyz              # {"status":"ok",...}
curl -s -o /dev/null -w '%{http_code}\n' https://yourdomain.com/api/v1/projects/   # 401
curl -s -o /dev/null -w '%{http_code}\n' https://yourdomain.com/docs               # 404 (docs disabled)
curl -s -o /dev/null -w '%{http_code}\n' https://yourdomain.com/_protected/x       # 404 (internal only)
```

---

### Step 18 — Tests and CI (fixes QA-01)

**18.1** Create `backend/tests/__init__.py` (empty file) and `backend/tests/conftest.py`:
```python
import os
from pathlib import Path

# Test configuration MUST be set before any `app` module is imported.
_TMP = Path(__file__).resolve().parent / ".tmp"
_TMP.mkdir(exist_ok=True)
os.environ.update({
    "ENV": "test",
    "SECRET_KEY": "test-secret-key-0123456789-abcdefghijklmnopqrstuvwxyz",
    "TOKEN_ENC_KEY": "MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=",
    "DATABASE_URI": f"sqlite:///{_TMP / 'test.db'}",
    "MEDIA_ROOT": str(_TMP / "media"),
    "SCRATCH_DIR": str(_TMP / "scratch"),
    "REDIS_URL": "redis://localhost:6379/15",
    "FRONTEND_ORIGIN": "http://testserver",
    "PUBLIC_API_URL": "http://testserver",
})

import fakeredis  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import models  # noqa: E402
from app.core import redis_client  # noqa: E402
from app.core.database import Base, SessionLocal, engine  # noqa: E402


@pytest.fixture(autouse=True)
def fake_redis(monkeypatch):
    fake = fakeredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(redis_client, "_client", fake)
    return fake


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


@pytest.fixture(autouse=True)
def sent_tasks(monkeypatch):
    """Records tasks instead of sending them to a broker."""
    from app.core.celery_app import celery_app
    from app.tasks import video_tasks

    sent = []
    for name in ("generate_master_shorts_task", "render_clip_task", "publish_video_task"):
        task = getattr(video_tasks, name)
        monkeypatch.setattr(task, "apply_async", lambda *a, _name=name, **k: sent.append(_name))
    monkeypatch.setattr(celery_app.control, "revoke", lambda *a, **k: None)
    return sent


@pytest.fixture
def client():
    from app.main import app
    with TestClient(app) as test_client:
        yield test_client


def _register(client, email):
    response = client.post("/api/v1/users/register",
                           json={"email": email, "password": "correct-horse-battery", "full_name": "Test"})
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def alice(client):
    return _register(client, "alice@example.com")


@pytest.fixture
def bob(client):
    return _register(client, "bob@example.com")


@pytest.fixture
def alice_video(client, alice):
    """A project, video and finished clip owned by Alice (created directly: no ffmpeg needed)."""
    project = client.post("/api/v1/projects/", json={"title": "Alice project"}, headers=alice).json()
    with SessionLocal() as db:
        video = models.Video(original_filename="a.mp4", storage_path="originals/1/a.mp4",
                             project_id=project["id"], duration=30.0, status=models.VideoStatus.COMPLETED)
        db.add(video)
        db.commit()
        clip = models.Clip(video_id=video.id, title="Master Variation 1", start_time=0, end_time=10,
                           duration=10, status=models.ClipStatus.COMPLETED, storage_path="clips/1/x.mp4")
        db.add(clip)
        db.commit()
        return {"project_id": project["id"], "video_id": video.id, "clip_id": clip.id}


def add_connection(user_headers, client, platform="youtube", token="SECRET-TOKEN"):
    me = client.get("/api/v1/users/me", headers=user_headers).json()
    with SessionLocal() as db:
        db.add(models.SocialConnection(user_id=me["id"], platform=platform, account_name="Acct",
                                       credentials={f"{platform}_access_token": token}))
        db.commit()
```

**18.2** Create `backend/tests/test_security.py`:
```python
import pytest
from sqlalchemy import text

from app import models
from app.core.database import SessionLocal
from tests.conftest import add_connection

API = "/api/v1"


@pytest.mark.parametrize("method,url", [
    ("get", f"{API}/projects/"),
    ("post", f"{API}/projects/"),
    ("get", f"{API}/videos/"),
    ("get", f"{API}/videos/1"),
    ("post", f"{API}/videos/cancel-all"),
    ("post", f"{API}/videos/translate-transcript"),
    ("get", f"{API}/users/me"),
    ("get", f"{API}/users/me/connections"),
    ("get", f"{API}/users/me/auth/youtube/url"),
])
def test_every_private_route_requires_a_token(client, method, url):
    assert getattr(client, method)(url).status_code == 401


def test_forged_token_is_rejected(client):
    import jwt
    forged = jwt.encode({"sub": "1", "exp": 9999999999, "type": "access"},
                        "harvest-ai-dev-insecure-secret-key-change-in-production-32b", "HS256")
    assert client.get(f"{API}/users/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


def test_users_cannot_touch_each_others_data(client, alice, bob, alice_video):
    vid, cid, pid = alice_video["video_id"], alice_video["clip_id"], alice_video["project_id"]
    for method, url in [
        ("get", f"{API}/projects/{pid}"),
        ("delete", f"{API}/projects/{pid}"),
        ("get", f"{API}/videos/{vid}"),
        ("delete", f"{API}/videos/{vid}"),
        ("get", f"{API}/videos/{vid}/status"),
        ("get", f"{API}/videos/{vid}/clips"),
        ("get", f"{API}/videos/{vid}/variations"),
        ("post", f"{API}/videos/{vid}/cancel-generation"),
        ("get", f"{API}/videos/clips/{cid}"),
    ]:
        assert getattr(client, method)(url, headers=bob).status_code == 404, url
    assert client.post(f"{API}/videos/{vid}/master-generate", json={}, headers=bob).status_code == 404
    assert client.post(f"{API}/videos/{vid}/clips", json={"start_time": 0, "end_time": 5}, headers=bob).status_code == 404
    assert client.put(f"{API}/videos/clips/{cid}", json={"start_time": 0, "end_time": 5}, headers=bob).status_code == 404
    assert client.post(f"{API}/videos/clips/{cid}/publish", json={"platforms": ["youtube"]}, headers=bob).status_code == 404
    assert client.get(f"{API}/projects/", headers=bob).json() == []
    assert client.get(f"{API}/videos/", headers=bob).json() == []
    assert client.get(f"{API}/videos/{vid}", headers=alice).status_code == 200  # Alice still has everything


def test_owner_id_cannot_be_chosen_by_the_client(client, bob):
    bob_id = client.get(f"{API}/users/me", headers=bob).json()["id"]
    created = client.post(f"{API}/projects/", json={"title": "x", "owner_id": 999}, headers=bob).json()
    assert created["owner_id"] == bob_id


def test_tokens_are_encrypted_at_rest_and_never_returned(client, alice):
    add_connection(alice, client)
    with SessionLocal() as db:
        raw = db.execute(text("SELECT credentials FROM social_connections")).scalar()
    assert "SECRET-TOKEN" not in raw
    body = client.get(f"{API}/users/me/connections", headers=alice).text
    assert "SECRET-TOKEN" not in body and "credentials" not in body


def test_oauth_callback_never_reflects_input_and_state_is_single_use(client, alice, fake_redis):
    attack = "</script><script>alert(1)</script>"
    response = client.get(f"{API}/users/auth/youtube/callback", params={"state": "unknown", "error": attack})
    assert response.status_code == 200
    assert "<script>alert(1)" not in response.text
    assert "nonce-" in response.headers["content-security-policy"]

    fake_redis.set("oauth:state:abc", "1:youtube")
    first = client.get(f"{API}/users/auth/youtube/callback", params={"state": "abc", "error": attack})
    assert "Access was not granted" in first.text and "<script>alert(1)" not in first.text
    assert fake_redis.get("oauth:state:abc") is None  # consumed
    second = client.get(f"{API}/users/auth/youtube/callback", params={"state": "abc", "code": "x"})
    assert "expired" in second.text


def test_login_is_rate_limited(client, alice):
    for _ in range(10):
        r = client.post(f"{API}/users/login", json={"email": "alice@example.com", "password": "wrong-password"})
        assert r.status_code == 401
    r = client.post(f"{API}/users/login", json={"email": "alice@example.com", "password": "wrong-password"})
    assert r.status_code == 429


def test_media_urls_require_a_valid_signature(client):
    from app.services import storage
    storage.new_path("clips/1/t.mp4").write_bytes(b"video-bytes")
    url = storage.signed_url("clips/1/t.mp4").replace("http://testserver", "")
    assert client.get(url).status_code == 200
    assert client.get(url.replace("sig=", "sig=0")).status_code == 403
    assert client.get(f"{API}/media/clips/1/t.mp4?exp=9999999999&sig=abc").status_code == 403
    assert client.get("/uploads/clips/1/t.mp4").status_code == 404  # no public media folder


def test_cancel_all_only_touches_the_callers_jobs(client, alice, bob, alice_video):
    with SessionLocal() as db:
        db.get(models.Video, alice_video["video_id"]).status = models.VideoStatus.PROCESSING
        db.commit()
    assert client.post(f"{API}/videos/cancel-all", headers=bob).json()["cancelled_count"] == 0
    with SessionLocal() as db:
        assert db.get(models.Video, alice_video["video_id"]).status == models.VideoStatus.PROCESSING
```

**18.3** Create `backend/tests/test_jobs.py`:
```python
import pytest

from app.services.ffmpeg import _harden, run_ffmpeg
from tests.conftest import add_connection

API = "/api/v1"


def test_generation_is_single_flight(client, alice, alice_video, sent_tasks):
    url = f"{API}/videos/{alice_video['video_id']}/master-generate"
    assert client.post(url, json={}, headers=alice).status_code == 202
    assert client.post(url, json={}, headers=alice).status_code == 409
    assert sent_tasks == ["generate_master_shorts_task"]


def test_status_reports_done_when_job_finished_with_fewer_than_five(client, alice, alice_video):
    status = client.get(f"{API}/videos/{alice_video['video_id']}/status", headers=alice).json()
    assert status["is_done"] is True and status["variations_ready"] == 1


def test_publish_needs_a_connection_and_is_idempotent(client, alice, alice_video, sent_tasks):
    url = f"{API}/videos/clips/{alice_video['clip_id']}/publish"
    assert client.post(url, json={"platforms": ["youtube"]}, headers=alice).status_code == 400
    add_connection(alice, client)
    assert client.post(url, json={"platforms": ["youtube"]}, headers=alice).status_code == 202
    assert client.post(url, json={"platforms": ["youtube"]}, headers=alice).status_code == 409
    assert sent_tasks == ["publish_video_task"]


def test_invalid_generation_options_are_rejected(client, alice, alice_video):
    url = f"{API}/videos/{alice_video['video_id']}/master-generate"
    assert client.post(url, json={"framing_mode": "evil"}, headers=alice).status_code == 422
    assert client.post(url, json={"length": 100000}, headers=alice).status_code == 422


def test_ffmpeg_inputs_are_protocol_restricted():
    cmd = _harden(["ffmpeg", "-y", "-i", "a.mp4", "-i", "b.wav", "out.mp4"])
    assert cmd.count("-protocol_whitelist") == 2
    assert cmd[cmd.index("a.mp4") - 3] == "-protocol_whitelist"
    with pytest.raises(ValueError):
        run_ffmpeg(["rm", "-rf", "/"])


def test_storage_blocks_path_traversal():
    from app.services import storage
    with pytest.raises(ValueError):
        storage.abs_path("../../etc/passwd")


def test_production_refuses_unsafe_config():
    from app.core.config import Settings
    with pytest.raises(ValueError):
        Settings(ENV="production", DATABASE_URI="sqlite:///x.db",
                 FRONTEND_ORIGIN="https://a.example", PUBLIC_API_URL="https://a.example")
    with pytest.raises(ValueError):
        Settings(SECRET_KEY="short")
```

Add `backend/tests/.tmp/` to the repo-root `.gitignore`.

**Verify:** `cd backend && pytest -q` passes (Redis is faked; no services needed).

**18.4** Create `.github/workflows/ci.yml`:
```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  backend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: harvest
          POSTGRES_PASSWORD: harvest
          POSTGRES_DB: harvest
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U harvest" --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      SECRET_KEY: ci-secret-key-0123456789-abcdefghijklmnopqrstuvwxyz
      TOKEN_ENC_KEY: MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=
      DATABASE_URI: postgresql://harvest:harvest@localhost:5432/harvest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
          cache: pip
          cache-dependency-path: backend/requirements*.txt
      - name: Install (CPU-only torch keeps CI fast)
        run: |
          pip install torch --index-url https://download.pytorch.org/whl/cpu
          pip install -r requirements-dev.txt
      - name: Lint (errors only)
        run: ruff check --select E9,F63,F7,F82 app tests
      - name: Unit and security tests
        run: pytest -q
      - name: Migrations build the schema from scratch and match the models
        run: alembic upgrade head && alembic check
      - name: Dependency vulnerabilities
        run: pip-audit -r requirements.txt

  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm run build
      - run: npm audit --omit=dev --audit-level=high
```
If `pip-audit` reports a vulnerability that has no fix yet, record it in an issue and add `--ignore-vuln <ID>` with a comment linking the issue. **Never ignore without an issue.**

**18.5** Protect `main` in GitHub: Settings → Branches → require the `backend` and `frontend` checks to pass before merging.

---

### Step 19 — Observability and alerts (fixes OPS-01)

1. Create a Sentry project (Python). Put its DSN in `SENTRY_DSN` in `backend/.env.production`. Step 11 already initialises it for the API. For workers, add these lines to the end of `backend/app/core/celery_app.py`:
   ```python
   if settings.SENTRY_DSN:
       import sentry_sdk
       sentry_sdk.init(dsn=settings.SENTRY_DSN, environment=settings.ENV, traces_sample_rate=0.05, send_default_pii=False)
   ```
2. In Sentry, create alerts for: **any new issue**, and **error rate > 1% for 5 minutes**.
3. Point an uptime monitor (UptimeRobot, Better Stack, etc.) at `https://yourdomain.com/api/v1/readyz` every minute.
4. Weekly, check stuck jobs and queue depth:
   ```bash
   docker compose -f deploy/docker-compose.prod.yml logs --since 168h beat worker-io | grep "Sweeper failed"
   docker compose -f deploy/docker-compose.prod.yml exec redis sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning llen pipeline'
   ```
   If the sweeper keeps firing, or `pipeline` stays above about 20, you need more pipeline workers (Part E).

---

## Part D — Go-live checklist

Tick every box. Each one names the step that fixes it and how to check it.

**Current reassessment blockers (2026-10-17):** do not launch until SEC-23 is remediated and verified, the still-open findings in §0.5 are fixed, and the newer feature areas listed in §0.3 have received a security review. The original step references below are historical and must be mapped to the release commit before use.

**Security**
- [ ] SEC-23: YouTube session cookies revoked; `backend/cookies.txt` removed from the current tree and Git history; cookie artifacts ignored; old values confirmed invalid.
- [ ] Reassessment §0.5: seeded account, JWT fallback, public media mount, database/Redis exposure, operator-token publishing fallback and direct API exposure are resolved in the actual release commit.
- [ ] Security review completed for template/branding uploads, outro/QR configuration, scheduled publishing, metadata suggestions, object storage and current Studio flows.
- [ ] No request without a token reaches private data (`test_every_private_route_requires_a_token`) — Steps 7–10
- [ ] User B gets 404 on every one of user A's resources (`test_users_cannot_touch_each_others_data`) — Steps 7–9
- [ ] No seeded user, no user-1 fallback, `owner_id` cannot be forged — Steps 6–8, 11
- [ ] App refuses to start without a strong `SECRET_KEY` / valid `TOKEN_ENC_KEY`, or with SQLite in production (`test_production_refuses_unsafe_config`) — Step 2
- [ ] OAuth tokens are encrypted at rest and never returned (`test_tokens_are_encrypted_at_rest_and_never_returned`) — Steps 3, 6, 10
- [ ] No operator-token fallbacks: the `settings.(YOUTUBE|FACEBOOK|INSTAGRAM|PUBLIC_VIDEO)` grep prints nothing — Step 14.4
- [ ] OAuth state is random and single-use; the callback never reflects input — Step 10
- [ ] `cancel-all` only affects the caller — Step 9
- [ ] Media is only served with a valid signature; `/uploads` is gone — Steps 4, 7, 11, 17
- [ ] Every ffmpeg call goes through `run_ffmpeg` (protocol whitelist + timeout); uploads are checked by content — Steps 4, 9, 14.6
- [ ] Only ports 22/80/443 are open (`nmap`); DB and Redis have passwords — Step 17
- [ ] HSTS, CSP and other headers present; `/docs` returns 404 in production — Steps 11, 17
- [ ] Login and register are rate-limited (nginx + app) — Steps 10, 17
- [ ] `npm audit --omit=dev --audit-level=high` and `pip-audit` are clean — Steps 16, 18

**Reliability**
- [ ] Celery `acks_late`, prefetch 1, time limits, max attempts; sweeper scheduled (exactly one `beat`) — Steps 12, 13, 17
- [ ] Double-click on Generate → one job (409); double-click on Publish → one post (409) — Steps 9, 13
- [ ] Cancel works across processes and never kills other users' tasks — Steps 5, 9, 14.1
- [ ] A job with 0 variations ends FAILED, not COMPLETED; a job with 1–4 ends COMPLETED and the UI shows results — Steps 9, 13
- [ ] `alembic upgrade head` builds the DB from empty; `alembic check` is clean — Step 15
- [ ] `/readyz` returns 503 when the DB or Redis is down; uptime monitor and Sentry alerts are active — Steps 7, 19
- [ ] Nightly DB backup runs and a restore has been tested; secrets are stored in a password manager — Step 17.6

**Performance**
- [ ] YOLO only runs for crop framing modes; no frame dump; scratch folder empties after each job — Steps 13, 14
- [ ] Frontend: one poller per page, with backoff; single-video endpoints; stable media URLs (no video reload while polling) — Step 16
- [ ] Per-user active-job limit, daily minutes quota, queue-depth back-pressure — Step 9

**Load test before launch** (on a staging copy of production):
```bash
pip install locust
cat > locustfile.py <<'EOF'
from locust import HttpUser, task, between
class User(HttpUser):
    wait_time = between(2, 4)
    def on_start(self):
        r = self.client.post("/api/v1/users/login", json={"email": "load@example.com", "password": "load-test-password"})
        self.client.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    @task(5)
    def status(self): self.client.get("/api/v1/videos/1/status", name="status")
    @task(1)
    def lists(self): self.client.get("/api/v1/projects/", name="projects")
EOF
locust -H https://staging.yourdomain.com --users 1000 --spawn-rate 50 --run-time 10m --headless
```
Create `load@example.com` and video 1 for that user first.

**Pass criteria:**
- p95 latency < 200 ms on `status` and `projects`,
- error rate < 0.1%,
- API CPU < 70%.

(Raise nginx's `api` rate-limit zone for the load-test IP, or run the test from several IPs.)

---

## Part E — After launch: scaling out and further improvements

Do these when the metrics from Step 19 say so, not before (YAGNI). They are ordered by expected value.

1. **Object storage + CDN (ARCH-01). Required before adding a second server.**
   - Swap the internals of `app/services/storage.py` for S3 (or R2/GCS) with `boto3`:
     - `new_path` / `abs_path` become "download to scratch",
     - saving becomes `upload_file`,
     - `signed_url` becomes `generate_presigned_url` (or CloudFront signed URLs),
     - `delete` becomes `delete_object`.
   - Because every caller already goes through `storage.py`, no endpoint or task changes.
   - Uploads become presigned multipart PUTs straight from the browser: `POST /videos/upload-url` returns the URL, then `POST /videos/{id}/complete` probes the file and creates the row. Large files never pass through the API.
   - Add bucket lifecycle rules (e.g. delete originals after N days, per your terms of service).
2. **More pipeline throughput:**
   - Run `worker-pipeline` on more GPU hosts (each with `-c 1` per GPU), pointed at the same managed Postgres and Redis.
   - Autoscale on the Redis `llen pipeline` value (KEDA, or your cloud's queue-based autoscaler).
   - Move Postgres and Redis to managed services with TLS, and add PgBouncer when connections approach `max_connections`.
3. **Cheaper and faster per video:**
   - Load the WAV once at 16 kHz mono for analysis (PERF-04). Verify that dub "mix" mode still sounds right before switching the extracted track's format.
   - Compute crop trajectories only for the chosen clip windows (PERF-01 part 2).
   - Translate captions in **one** batched call per clip instead of one per line (PERF-10).
   - Run TTS lines concurrently with `asyncio.gather` (PERF-10).
   - Pick a single STT engine (GPU Whisper) to remove the Google STT path and bill.
4. **Code health:**
   - Extract one deep module `render_short(video_path, start, end, words, options, workdir) -> path` used by both `render_clip_task` and `master_agent` (QUAL-01). This deletes ~300 duplicated lines.
   - Replace the `title LIKE '%Master Variation%'` convention with a `Clip.kind` enum column (`master_variation` / `manual`).
   - Pass `video_id` and plain values into `master_agent` instead of the ORM object (CONC-06), so no DB connection is held while ffmpeg runs.
   - Merge the 5 identical status enums.
   - Split `MasterGeneratorPage.jsx` (about 1,000 lines) into `/setup`, `/generating` and `/results` routes.
   - Move the duplicated `LANGUAGES` list and `StatusChip` into `src/lib/`.
   - Clear the remaining ~15 ESLint warnings (React-Compiler readiness), e.g. move `AppNav` out of `MasterGeneratorPage`'s render, then switch those rules back to `error` in `eslint.config.js`.
5. **Auth upgrades:**
   - Move the token from `localStorage` to an `HttpOnly; Secure; SameSite=Lax` cookie with CSRF protection.
   - Add refresh tokens, email verification and password reset.
   - Add PKCE to the Google OAuth flow.
6. **Progress push instead of polling:** add a Server-Sent Events endpoint only if polling shows up as a meaningful share of API load in your metrics.
7. **Paid tiers:** add a `pipeline-priority` queue consumed first by the pipeline workers, plus per-plan limits in `config.py`.
