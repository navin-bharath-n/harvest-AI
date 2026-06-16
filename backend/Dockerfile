FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

WORKDIR /app

# Install system dependencies
RUN apt-get update \
    && apt-get install -y gcc postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --upgrade pip \
    && pip install -r requirements.txt

# Copy project
COPY . .

# Create uploads directory
RUN mkdir -p uploads

# Command to run the application (overridden in docker-compose for workers)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
