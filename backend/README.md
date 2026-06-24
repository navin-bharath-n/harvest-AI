# AI Shorts Generator Backend

This is the FastAPI backend for the AI Shorts Generator application.

## Tech Stack

*   **FastAPI**: Modern, fast web framework for building APIs.
*   **PostgreSQL**: Relational database.
*   **SQLAlchemy**: ORM for database interactions.
*   **Alembic**: Database migration tool.
*   **Redis**: Message broker and result backend for Celery.
*   **Celery**: Asynchronous task queue/job queue.
*   **Docker & Docker Compose**: Containerization and orchestration.

## Getting Started

### Prerequisites
*   Docker
*   Docker Compose

### Setup & Run

1.  **Environment Variables**:
    Copy the `.env.example` file to `.env` if you need to override any defaults.
    ```bash
    cp .env.example .env
    ```

2.  **Start Services**:
    Run Docker Compose to build and start the database, redis, web app, and celery worker.
    ```bash
    docker-compose up --build
    ```

3.  **Run Migrations**:
    In a new terminal, run the Alembic migrations to create the database tables.
    ```bash
    docker-compose exec web alembic upgrade head
    ```

4.  **Access the Application**:
    *   **API Documentation (Swagger UI)**: https://localhost:8000/docs
    *   **API Documentation (ReDoc)**: https://localhost:8000/redoc
    *   **Health Check Endpoint**: https://localhost:8000/api/v1/health

## Project Structure

*   `app/api/`: API route definitions.
*   `app/core/`: Application settings, DB session management, Celery app.
*   `app/models/`: SQLAlchemy DB models.
*   `app/schemas/`: Pydantic models for request/response validation.
*   `app/tasks/`: Celery background tasks (e.g., video processing).
*   `alembic/`: Database migration scripts.

## Usage

1.  **Create a User**: Use the `/api/v1/users/` endpoint to create a user.
2.  **Create a Project**: Use the `/api/v1/projects/` endpoint to create a project for that user.
3.  **Upload a Video**: Use the `/api/v1/videos/` endpoint to upload a video file for a specific project. This will automatically trigger a background Celery task to process the video.
