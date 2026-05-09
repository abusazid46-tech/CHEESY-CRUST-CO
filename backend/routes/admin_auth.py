# backend/routes/admin_auth.py
"""
Admin Authentication Routes
"""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, validator
from typing import Dict, Any

from services.admin_service import admin_service

router = APIRouter()


class AdminLoginRequest(BaseModel):
    email: str = Field(..., description="Admin email address")
    password: str = Field(..., min_length=6, description="Admin password")
    
    class Config:
        schema_extra = {
            "example": {
                "email": "admin@cheesycrust.co",
                "password": "Admin@123456"
            }
        }


class AdminLoginResponse(BaseModel):
    success: bool = True
    message: str
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = 86400
    admin: Dict[str, Any]


@router.post("/admin/auth/login", response_model=AdminLoginResponse)
async def admin_login(request: AdminLoginRequest):
    """Admin login with email and password"""
    print(f"Login attempt: {request.email}")  # Debug log
    
    success, message, tokens = await admin_service.login(
        email=request.email,
        password=request.password
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"message": message}
        )
    
    return AdminLoginResponse(
        success=True,
        message=message,
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        admin=tokens["admin"]
    )


@router.post("/admin/auth/logout")
async def admin_logout():
    """Admin logout"""
    return {"success": True, "message": "Logged out successfully"}


@router.get("/admin/auth/me")
async def get_admin_profile():
    """Get current admin profile"""
    # This would normally require authentication
    return {"message": "Please provide admin token"}


@router.post("/admin/auth/create")
async def create_admin_user():
    """Create new admin"""
    return {"message": "Not implemented yet"}


@router.post("/admin/auth/change-password")
async def change_password():
    """Change admin password"""
    return {"message": "Not implemented yet"}
