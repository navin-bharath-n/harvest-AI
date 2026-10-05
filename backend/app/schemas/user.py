from typing import Optional
import re
from pydantic import BaseModel, EmailStr, field_validator
from datetime import datetime

COMMON_WEAK_PASSWORDS = {
    "password", "password123", "12345678", "123456789", "qwerty123",
    "admin123", "welcome1", "letmein1", "harvest123", "iloveyou"
}

class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    is_active: Optional[bool] = True

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        if isinstance(v, str):
            v = v.strip().lower()
            if not v:
                raise ValueError("Email address cannot be empty.")
        return v

    @field_validator("full_name")
    @classmethod
    def sanitize_full_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if len(v) > 100:
                raise ValueError("Full name cannot exceed 100 characters.")
            # Prevent XSS injection characters
            if "<" in v or ">" in v or "\x00" in v:
                raise ValueError("Full name contains invalid characters.")
        return v


class UserCreate(UserBase):
    password: str

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if not v or len(v) < 8:
            raise ValueError("Password must be at least 8 characters long.")
        if len(v) > 72:
            raise ValueError("Password cannot exceed 72 characters.")
        
        if v.lower() in COMMON_WEAK_PASSWORDS:
            raise ValueError("Password is too common or easily guessable.")

        has_lower = any(c.islower() for c in v)
        has_upper = any(c.isupper() for c in v)
        has_digit = any(c.isdigit() for c in v)
        has_special = any(c in r"""!@#$%^&*()_+-=[]{}|;:,.<>?/~`'"\"""" for c in v)

        missing = []
        if not has_lower:
            missing.append("a lowercase letter")
        if not has_upper:
            missing.append("an uppercase letter")
        if not has_digit:
            missing.append("a number")
        if not has_special:
            missing.append("a special character (!@#$%^&*...)")

        if missing:
            raise ValueError(f"Password must include: {', '.join(missing)}.")

        return v


class UserUpdate(UserBase):
    password: Optional[str] = None


class User(UserBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: User


class LoginRequest(BaseModel):
    email: EmailStr
    password: str

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        if isinstance(v, str):
            v = v.strip().lower()
        return v
