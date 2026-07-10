"""
Authentication request/response schemas
"""

from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional


class RegisterRequest(BaseModel):
    """Request schema for email/mobile/password registration"""
    name: str = Field(..., min_length=2, max_length=50)
    email: EmailStr
    phone: str = Field(..., description="Mobile number with country code")
    password: str = Field(..., min_length=8, max_length=128)
    
    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        import re
        digits = re.sub(r'\D', '', v)
        if len(digits) < 10 or len(digits) > 15:
            raise ValueError("Invalid phone number")
        return v


class LoginRequest(BaseModel):
    """Request schema for email/mobile/password login"""
    identifier: str = Field(..., description="Email address or mobile number")
    password: str = Field(..., min_length=1)


class TokenResponse(BaseModel):
    """JWT token response"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user_id: str
    phone: str
    email: Optional[EmailStr] = None
    name: Optional[str] = None
    is_admin: bool = False


class RefreshTokenRequest(BaseModel):
    """Request schema for token refresh"""
    refresh_token: str


class AuthMessageResponse(BaseModel):
    """Simple message response"""
    message: str
    success: bool = True
