from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import settings

DATABASE_URL = settings.SQLALCHEMY_DATABASE_URI
if not DATABASE_URL or not DATABASE_URL.strip():
    from app.core.config import _DEFAULT_DB_PATH
    DATABASE_URL = _DEFAULT_DB_PATH

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False}
    )
else:
    # Optimized for Neon Serverless PostgreSQL & Cloud Postgres:
    # 1. pool_pre_ping=True: Tests connection health before checkout (handles Neon auto-suspend / scale-to-zero)
    # 2. pool_recycle=300: Recycles connections at 5 minutes to prevent stale dropped connections
    # 3. pool_size=5, max_overflow=10: Sized for 1-vCPU server to stay well within Neon free tier limits
    # 4. connect_timeout=15: Fast timeout with clean retry if Neon is waking up from suspend
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_recycle=300,
        pool_size=5,
        max_overflow=10,
        connect_args={"connect_timeout": 15}
    )

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()