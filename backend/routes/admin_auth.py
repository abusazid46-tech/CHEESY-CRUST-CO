# backend/routes/admin_auth.py
"""
Admin Authentication Routes
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Dict, Any

from services.admin_service import admin_service
from middleware.admin_auth import admin_required

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


class AdminRefreshRequest(BaseModel):
    refresh_token: str


class AdminCreateRequest(BaseModel):
    email: str
    password: str = Field(..., min_length=8)
    name: str = Field(..., min_length=2, max_length=80)
    role: str = "admin"


class AdminProfileUpdateRequest(BaseModel):
    email: str | None = None
    name: str | None = Field(None, min_length=2, max_length=80)


class AdminPasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)


@router.post("/admin/auth/login")
async def admin_login(request: AdminLoginRequest):
    """Admin login with email and password"""
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
async def admin_logout(payload: Dict[str, Any] = Depends(admin_required)):
    """Admin logout"""
    return {"success": True, "message": "Logged out successfully"}


@router.get("/admin/auth/me")
async def get_admin_profile(payload: Dict[str, Any] = Depends(admin_required)):
    """Get current admin profile"""
    admin = await admin_service.get_admin_by_id(payload["sub"])
    if not admin:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin not found")
    return {"success": True, "admin": admin_service.public_admin(admin)}


@router.post("/admin/auth/refresh")
async def refresh_admin_token(request: AdminRefreshRequest):
    """Refresh admin access token"""
    success, message, tokens = await admin_service.refresh_token(request.refresh_token)
    if not success:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=message)
    return {"success": True, "message": message, **tokens}


@router.put("/admin/auth/profile")
async def update_admin_profile(
    request: AdminProfileUpdateRequest,
    payload: Dict[str, Any] = Depends(admin_required)
):
    """Update current admin profile"""
    admin = await admin_service.update_admin_profile(payload["sub"], request.model_dump(exclude_unset=True))
    if not admin:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unable to update profile")
    return {"success": True, "admin": admin_service.public_admin(admin)}


@router.post("/admin/auth/create")
async def create_admin_user(
    request: AdminCreateRequest,
    payload: Dict[str, Any] = Depends(admin_required)
):
    """Create new admin"""
    if payload.get("role") != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super admin access required")
    success, message, admin = await admin_service.create_admin(
        request.email,
        request.password,
        request.name,
        request.role
    )
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)
    return {"success": True, "message": message, "admin": admin}


@router.get("/admin/auth/users")
async def get_admin_users(payload: Dict[str, Any] = Depends(admin_required)):
    """List admin users"""
    return {"success": True, "admins": await admin_service.list_admins()}


@router.post("/admin/auth/change-password")
async def change_password(
    request: AdminPasswordChangeRequest,
    payload: Dict[str, Any] = Depends(admin_required)
):
    """Change admin password"""
    success, message = await admin_service.change_password(
        payload["sub"],
        request.current_password,
        request.new_password
    )
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)
    return {"success": True, "message": message}
