"""
Admin Authentication Routes
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, validator
from typing import Optional

from services.admin_service import admin_service
from middleware import get_current_admin_user

router = APIRouter()


# Request/Response Models
class AdminLoginRequest(BaseModel):
    email: str
    password: str
    
    @validator('password')
    def password_min_length(cls, v):
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters')
        return v


class AdminCreateRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = "admin"
    
    @validator('password')
    def password_min_length(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        return v
    
    @validator('name')
    def name_min_length(cls, v):
        if len(v) < 2:
            raise ValueError('Name must be at least 2 characters')
        return v


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    
    @validator('new_password')
    def password_min_length(cls, v):
        if len(v) < 8:
            raise ValueError('New password must be at least 8 characters')
        return v


# Routes
@router.post("/admin/auth/login")
async def admin_login(request: AdminLoginRequest):
    """Admin login with email and password"""
    success, message, tokens = await admin_service.login(
        email=request.email,
        password=request.password
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=message
        )
    
    return {
        "success": True,
        "message": message,
        **tokens  # Spread the tokens dict (access_token, refresh_token, etc.)
    }


@router.post("/admin/auth/logout")
async def admin_logout(admin: dict = Depends(get_current_admin_user)):
    """Admin logout"""
    # Get token from request (you'll need to extract it)
    # This is a simplified version
    await admin_service.logout(admin["_id"], "")
    
    return {
        "success": True,
        "message": "Logged out successfully"
    }


@router.get("/admin/auth/me")
async def get_admin_profile(admin: dict = Depends(get_current_admin_user)):
    """Get current admin profile"""
    return {
        "success": True,
        "admin": admin
    }


@router.post("/admin/auth/create")
async def create_admin_user(
    request: AdminCreateRequest,
    admin: dict = Depends(get_current_admin_user)
):
    """Create new admin (super_admin only)"""
    if admin.get("role") != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only super admins can create admin users"
        )
    
    success, message, new_admin = await admin_service.create_admin(
        email=request.email,
        password=request.password,
        name=request.name,
        role=request.role
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message
        )
    
    return {
        "success": True,
        "message": message,
        "admin": new_admin
    }


@router.post("/admin/auth/change-password")
async def change_password(
    request: ChangePasswordRequest,
    admin: dict = Depends(get_current_admin_user)
):
    """Change admin password"""
    success, message = await admin_service.update_password(
        admin_id=admin["_id"],
        current_password=request.current_password,
        new_password=request.new_password
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message
        )
    
    return {
        "success": True,
        "message": message
    }
