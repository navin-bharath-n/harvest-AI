from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class SmartLink(Base):
    """
    PRD K-1 & K-3: Persisted smart link with device-aware redirect,
    QR attribution tracking, and evergreen next-video support.
    """
    __tablename__ = "smart_links"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String, unique=True, index=True, nullable=False)
    title = Column(String, nullable=False)
    primary_url = Column(String, nullable=False)
    deep_link_ios = Column(String, nullable=True)
    deep_link_android = Column(String, nullable=True)
    is_evergreen = Column(Boolean, default=True)
    latest_video_url = Column(String, nullable=True)

    # Attribution counters
    total_clicks = Column(Integer, default=0)
    qr_scans = Column(Integer, default=0)
    followers_attributed = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
