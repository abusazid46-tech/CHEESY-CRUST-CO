"""
User schemas
"""

from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List
from datetime import datetime, date


class AddressSchema(BaseModel):
    """Address schema"""
    id: Optional[str] = None
    label: str = "Home"
    full: str
    is_default: bool = False


class UserProfileResponse(BaseModel):
    """User profile response"""
    id: str
    phone: str
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    dob: Optional[date] = None
    addresses: List[AddressSchema] = Field(default_factory=list)
    created_at: datetime
    is_active: bool = True


class UserUpdateRequest(BaseModel):
    """Request to update user profile"""
    name: Optional[str] = Field(None, min_length=2, max_length=50)
    email: Optional[EmailStr] = None
    dob: Optional[date] = None


class AddAddressRequest(BaseModel):
    """Request to add address"""
    label: str = "Home"
    full: str
    is_default: bool = False


class UpdateAddressRequest(BaseModel):
    """Request to update address"""
    label: Optional[str] = None
    full: Optional[str] = None
    is_default: Optional[bool] = None


class UserOrdersResponse(BaseModel):
    """User orders response"""
    orders: List[dict]
    total: int
