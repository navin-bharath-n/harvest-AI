from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.config import settings
from app.core import security
from app import models

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/users/login",
    auto_error=False
)

def get_current_user_optional(
    db: Session = Depends(get_db),
    token: Optional[str] = Depends(oauth2_scheme)
) -> Optional[models.User]:
    if not token:
        return None
    user_id = security.decode_access_token(token)
    if not user_id:
        return None
    try:
        user = db.query(models.User).filter(models.User.id == int(user_id)).first()
        return user
    except Exception:
        return None

def get_current_user(
    db: Session = Depends(get_db),
    token: Optional[str] = Depends(oauth2_scheme)
) -> models.User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if token:
        user_id = security.decode_access_token(token)
        if user_id:
            try:
                user = db.query(models.User).filter(models.User.id == int(user_id)).first()
                if user and user.is_active:
                    return user
            except Exception:
                pass
        raise credentials_exception

    # Fallback for unauthenticated local development or single-user mode
    default_user = db.query(models.User).filter(models.User.id == 1).first()
    if default_user:
        return default_user
        
    raise credentials_exception
