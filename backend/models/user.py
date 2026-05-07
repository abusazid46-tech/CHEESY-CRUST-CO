"""
User and OTP models for MongoDB
"""

from datetime import datetime, timedelta
from typing import Optional, List
from pydantic import BaseModel, Field, EmailStr
from bson import ObjectId


class PyObjectId(ObjectId):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v, _info=None):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid objectid")
        return ObjectId(v)

    @classmethod
    def __get_pydantic_json_schema__(cls, _schema_generator):
        return {"type": "string"}


class Address(BaseModel):
    """User address model"""
    id: str = Field(default_factory=lambda: str(ObjectId()))
    label: str = "Home"
    full: str
    is_default: bool = False


class User(BaseModel):
    """User model"""
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    phone: str
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    dob: Optional[datetime] = None
    addresses: List[Address] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True
    is_admin: bool = False
    
    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}


class OTPSession(BaseModel):
    """OTP verification session"""
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    phone: str
    otp: str
    expires_at: datetime
    verified: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    attempts: int = 0
    
    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
    
    @classmethod
    def create(cls, phone: str, otp: str, expiry_minutes: int = 5):
        """Factory method to create OTP session"""
        return cls(
            phone=phone,
            otp=otp,
            expires_at=datetime.utcnow() + timedelta(minutes=expiry_minutes)
        )
    
    def is_expired(self) -> bool:
        """Check if OTP has expired"""
        return datetime.utcnow() > self.expires_at
    
    def verify(self, otp: str) -> bool:
        """Verify OTP and mark as verified"""
        if self.is_expired():
            return False
        if self.attempts >= 3:
            return False
        self.attempts += 1
        if self.otp == otp:
            self.verified = True
            return True
        return False
