"""
Authentication routes - customer email/mobile/password login and JWT
"""

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import JSONResponse

from schemas.auth import RegisterRequest, LoginRequest, TokenResponse, RefreshTokenRequest
from services import auth_service

router = APIRouter()


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(request: RegisterRequest):
    """Create a customer account with email, mobile number, and password."""
    success, message, tokens = await auth_service.register(
        name=request.name,
        email=str(request.email),
        phone=request.phone,
        password=request.password,
    )

    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)

    return TokenResponse(**tokens)


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    """Login with email or mobile number plus password."""
    success, message, tokens = await auth_service.login(
        identifier=request.identifier,
        password=request.password,
    )

    if not success:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=message)

    return TokenResponse(**tokens)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(request: RefreshTokenRequest):
    """Refresh access token using refresh token."""
    success, message, tokens = await auth_service.refresh_token(request.refresh_token)

    if not success:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=message)

    return TokenResponse(**tokens)


@router.post("/logout")
async def logout():
    """Logout user by removing tokens client-side."""
    return JSONResponse(
        content={"success": True, "message": "Logged out successfully"},
        status_code=status.HTTP_200_OK,
    )
