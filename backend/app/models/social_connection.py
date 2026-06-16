from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base

class SocialConnection(Base):
    __tablename__ = "social_connections"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    platform = Column(String, nullable=False, index=True) # "youtube", "facebook", "instagram"
    account_name = Column(String, nullable=True)
    account_handle = Column(String, nullable=True)
    account_avatar = Column(String, nullable=True)
    credentials = Column(JSON, nullable=True) # contains tokens, page IDs, etc.
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="social_connections")
