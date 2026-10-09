FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

WORKDIR /app

# Install system dependencies (including FFmpeg, Node.js for yt-dlp JavaScript challenges, and graphics libraries for MediaPipe / OpenCV)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        gcc \
        g++ \
        git \
        ffmpeg \
        nodejs \
        fonts-dejavu-core \
        fonts-freefont-ttf \
        fontconfig \
        libgl1 \
        libglib2.0-0 \
        postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies from backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt

# Copy backend application source
COPY backend/ .

# Create uploads directory
RUN mkdir -p uploads

# Start application (dynamic $PORT support for Railway)
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
