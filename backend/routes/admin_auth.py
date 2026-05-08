"""
Admin authentication routes
"""

from fastapi import APIRouter, HTTPException, status, Depends, Request
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Dict, Any

from services.admin_service import admin_service
from middleware.admin_auth import admin_required, get_current_admin

router = APIRouter(prefix="/admin/auth", tags=["Admin Auth"])


class AdminLoginRequest(BaseModel):
    """Admin login request"""
    email: EmailStr
    password: str = Field(..., min_length=6)


class AdminLoginResponse(BaseModel):
    """Admin login response"""
    success: bool = True
    message: str
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = 86400
    admin: dict


class AdminCreateRequest(BaseModel):
    """Create admin request"""
    email: EmailStr
    password: str = Field(..., min_length=8)
    name: str = Field(..., min_length=2)
    role: str = "admin"


class ChangePasswordRequest(BaseModel):
    """Change password request"""
    current_password: str
    new_password: str = Field(..., min_length=8)


@router.post("/login", response_model=AdminLoginResponse)
async def admin_login(request: AdminLoginRequest):
    """Admin login with email and password"""
    success, message, tokens = await admin_service.login(
        request.email,
        request.password
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=message
        )
    
    return AdminLoginResponse(
        success=True,
        message=message,
        **tokens
    )


@router.post("/logout")
async def admin_logout(
    request: Request,
    admin: Dict[str, Any] = Depends(admin_required)
):
    """Admin logout"""
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    await admin_service.logout(admin["sub"], token)
    
    return {"success": True, "message": "Logged out successfully"}


@router.get("/me")
async def get_admin_profile(admin: Dict[str, Any] = Depends(admin_required)):
    """Get current admin profile"""
    admin_data = await admin_service.get_admin_by_id(admin["sub"])
    
    if not admin_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Admin not found"
        )
    
    return {"success": True, "admin": admin_data}


@router.post("/create")
async def create_admin_user(
    request: AdminCreateRequest,
    admin: Dict[str, Any] = Depends(admin_required)
):
    """Create new admin (super_admin only)"""
    if admin.get("role") != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only super admin can create admins"
        )
    
    success, message, admin_data = await admin_service.create_admin(
        request.email,
        request.password,
        request.name,
        request.role
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message
        )
    
    return {"success": True, "message": message, "admin": admin_data}


@router.post("/change-password")
async def change_password(
    request: ChangePasswordRequest,
    admin: Dict[str, Any] = Depends(admin_required)
):
    """Change admin password"""
    success, message = await admin_service.update_password(
        admin["sub"],
        request.current_password,
        request.new_password
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message
        )
    
    return {"success": True, "message": message}
