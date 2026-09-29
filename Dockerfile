FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

WORKDIR /app

# Install system dependencies (including FFmpeg for video processing)
RUN apt-get update \
    && apt-get install -y gcc postgresql-client ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies from backend
COPY backend/requirements.txt .
RUN pip install --upgrade pip \
    && pip install -r requirements.txt

# Copy backend application source
COPY backend/ .

# Create uploads directory
RUN mkdir -p uploads

# Start application (dynamic $PORT support for Railway)
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
