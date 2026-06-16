from typing import Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime

class SocialConnectionBase(BaseModel):
    platform: str
    account_name: Optional[str] = None
    account_handle: Optional[str] = None
    account_avatar: Optional[str] = None
    credentials: Optional[Dict[str, Any]] = None

class SocialConnectionCreate(SocialConnectionBase):
    pass

class SocialConnection(SocialConnectionBase):
    id: int
    user_id: int
    created_at: datetime

    class Config:
        from_attributes = True
