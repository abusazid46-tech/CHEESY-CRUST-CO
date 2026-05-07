"""
Menu item models
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
from bson import ObjectId
from enum import Enum


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


class MenuCategory(str, Enum):
    BREAKFAST = "breakfast"
    LUNCH = "lunch"
    DINNER = "dinner"
    STARTER = "starter"
    DESSERT = "dessert"
    BEVERAGE = "beverage"


class MenuItem(BaseModel):
    """Menu item model"""
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    name: str
    slug: str
    category: MenuCategory
    price: float
    description: str
    image_url: str
    is_available: bool = True
    is_veg: bool = True
    rating: dict = Field(default_factory=lambda: {"avg": 0, "count": 0})
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
    
    @classmethod
    def generate_slug(cls, name: str) -> str:
        """Generate URL-friendly slug from name"""
        import re
        slug = name.lower().strip()
        slug = re.sub(r'[^\w\s-]', '', slug)
        slug = re.sub(r'[-\s]+', '-', slug)
        return slug
