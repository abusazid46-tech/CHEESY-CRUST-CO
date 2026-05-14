"""
Admin model for authentication
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
from bson import ObjectId
import hashlib
import hmac
import secrets


class PyObjectId(ObjectId):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v, info=None):  # <-- ADD info=None parameter
        if isinstance(v, ObjectId):
            return v
        if isinstance(v, str):
            if not ObjectId.is_valid(v):
                raise ValueError("Invalid objectid")
            return ObjectId(v)
        raise ValueError("Invalid objectid")

    @classmethod
    def __get_pydantic_json_schema__(cls, _schema_generator):
        return {"type": "string"}

class Admin(BaseModel):
    """Admin user model"""
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    email: str
    name: str
    password_hash: str
    salt: str
    role: str = "admin"  # admin, super_admin, manager
    is_active: bool = True
    last_login: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
    
    @staticmethod
    def hash_password(password: str, salt: str = None) -> tuple:
        """Hash password with salt using SHA-256"""
        if not salt:
            salt = secrets.token_hex(16)
        
        # Combine password and salt, then hash
        password_salt = password + salt
        password_hash = hashlib.sha256(password_salt.encode()).hexdigest()
        
        return password_hash, salt
    
    @staticmethod
    def verify_password(password: str, salt: str, password_hash: str) -> bool:
        """Verify password against stored hash"""
        new_hash, _ = Admin.hash_password(password, salt)
        return hmac.compare_digest(new_hash, password_hash)
    
    @classmethod
    def create_admin(cls, email: str, password: str, name: str, role: str = "admin"):
        """Factory method to create admin with hashed password"""
        password_hash, salt = cls.hash_password(password)
        
        return cls(
            email=email,
            name=name,
            password_hash=password_hash,
            salt=salt,
            role=role
        )


class AdminSession(BaseModel):
    """Admin login session"""
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    admin_id: PyObjectId
    token: str
    expires_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True
    
    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
