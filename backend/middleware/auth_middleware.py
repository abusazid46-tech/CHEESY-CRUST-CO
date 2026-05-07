"""
Authentication middleware for JWT validation
"""

from fastapi import Depends, Request, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, Dict, Any
from bson import ObjectId

from utils.security import decode_token
from database import db


class JWTBearer(HTTPBearer):
    """JWT Bearer token authentication"""
    
    def __init__(self, auto_error: bool = True):
        super().__init__(auto_error=auto_error)
    
    async def __call__(self, request: Request) -> Optional[Dict[str, Any]]:
        credentials: HTTPAuthorizationCredentials = await super().__call__(request)
        
        if not credentials:
            if self.auto_error:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Invalid authorization code"
                )
            return None
        
        if credentials.scheme != "Bearer":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid authentication scheme"
            )
        
        payload = decode_token(credentials.credentials)
        if not payload:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid or expired token"
            )
        
        return payload


async def get_current_user(payload: Dict[str, Any] = None):
    """Dependency to get current authenticated user"""
    if not payload:
        return None
    
    user_id = payload.get("sub")
    if not user_id:
        return None
    
    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if user:
            user["_id"] = str(user["_id"])
        return user
    except Exception:
        return None


# Global auth dependency
auth_required = JWTBearer()
admin_required = JWTBearer()
auth_optional = JWTBearer(auto_error=False)


async def get_current_admin_user(payload: Dict[str, Any] = Depends(admin_required)):
    """Dependency to ensure user is admin"""
    user = await get_current_user(payload)
    if not user or not user.get("is_admin", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return user
