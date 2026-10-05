from typing import Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime

class SocialConnectionBase(BaseModel):
    platform: str
    account_name: Optional[str] = None
    account_handle: Optional[str] = None
    account_avatar: Optional[str] = None

class SocialConnectionCreate(SocialConnectionBase):
    credentials: Optional[Dict[str, Any]] = None

class SocialConnection(SocialConnectionBase):
    id: int
    user_id: int
    created_at: datetime
    is_connected: bool = True

    class Config:
        from_attributes = True
