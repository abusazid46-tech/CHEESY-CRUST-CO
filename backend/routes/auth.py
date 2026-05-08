"""
Authentication routes - OTP and JWT
"""
from config.settings import settings
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import JSONResponse

from schemas.auth import (
    SendOTPRequest, SendOTPResponse,
    VerifyOTPRequest, TokenResponse,
    RefreshTokenRequest
)
from services import auth_service

router = APIRouter()


@router.post("/send-otp", response_model=SendOTPResponse)
async def send_otp(request: SendOTPRequest):
  if settings.DEV_AUTH_BYPASS:
        return SendOTPResponse(
            success=True,
            message="OTP bypass enabled",
            phone=request.phone,
            expires_in=300
        )
    success, message, otp = await auth_service.send_otp(request.phone)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message
        )
    
    # In demo mode, include OTP in response (for testing only)
    response = SendOTPResponse(
        success=True,
        message=message,
        phone=request.phone,
        expires_in=300
    )
    
    return response


@router.post("/verify-otp", response_model=TokenResponse)
async def verify_otp(request: VerifyOTPRequest):
        if settings.DEV_AUTH_BYPASS:
        return TokenResponse(
            access_token="dev-access-token",
            refresh_token="dev-refresh-token",
            token_type="bearer",
            expires_in=3600,
            user={
                "phone": request.phone
            }
        )
    """Verify OTP and return JWT tokens"""
    success, message, tokens = await auth_service.verify_otp(request.phone, request.otp)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message
        )
    
    return TokenResponse(**tokens)


@router.post("/refresh")
async def refresh_token(request: RefreshTokenRequest):
    """Refresh access token using refresh token"""
    success, message, tokens = await auth_service.refresh_token(request.refresh_token)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=message
        )
    
    return TokenResponse(**tokens)


@router.post("/logout")
async def logout():
    """Logout user (client-side token removal)"""
    return JSONResponse(
        content={"success": True, "message": "Logged out successfully"},
        status_code=status.HTTP_200_OK
    )
