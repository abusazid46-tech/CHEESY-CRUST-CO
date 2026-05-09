# backend/routes/admin_auth.py
"""
Admin Authentication Routes
"""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
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


# REMOVE response_model - it's causing issues
@router.post("/admin/auth/login")
async def admin_login(request: AdminLoginRequest):
    """Admin login with email and password"""
    print(f"Login attempt: {request.email}")  # Debug log
    
    success, message, tokens = await admin_service.login(
        email=request.email,
        password=request.password
    )
    
    if not success:
        # FIX: Use string detail, not dict
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=message  # Changed from {"message": message} to just message
        )
    
    # Return plain dict without Pydantic model
    return {
        "success": True,
        "message": message,
        "access_token": tokens["access_token"],
        "refresh_token": tokens["refresh_token"],
        "token_type": tokens.get("token_type", "bearer"),
        "expires_in": tokens.get("expires_in", 86400),
        "admin": tokens["admin"]
    }


@router.post("/admin/auth/logout")
async def admin_logout():
    """Admin logout"""
    return {"success": True, "message": "Logged out successfully"}


@router.get("/admin/auth/me")
async def get_admin_profile():
    """Get current admin profile"""
    return {"message": "Please provide admin token"}


@router.post("/admin/auth/create")
async def create_admin_user():
    """Create new admin"""
    return {"message": "Not implemented yet"}


@router.post("/admin/auth/change-password")
async def change_password():
    """Change admin password"""
    return {"message": "Not implemented yet"}
