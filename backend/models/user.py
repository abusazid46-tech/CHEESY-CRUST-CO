"""
User models for MongoDB
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, EmailStr
from bson import ObjectId
import hashlib
import hmac
import secrets


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
    password_hash: Optional[str] = None
    salt: Optional[str] = None
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

    @staticmethod
    def hash_password(password: str, salt: Optional[str] = None) -> tuple[str, str]:
        if not salt:
            salt = secrets.token_hex(16)
        password_hash = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            120_000,
        ).hex()
        return password_hash, salt

    @staticmethod
    def verify_password(password: str, salt: Optional[str], password_hash: Optional[str]) -> bool:
        if not salt or not password_hash:
            return False
        new_hash, _ = User.hash_password(password, salt)
        return hmac.compare_digest(new_hash, password_hash)


