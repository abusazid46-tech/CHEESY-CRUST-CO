"""
Menu schemas
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class MenuCategoryEnum(str, Enum):
    BREAKFAST = "breakfast"
    LUNCH = "lunch"
    DINNER = "dinner"
    STARTER = "starter"
    DESSERT = "dessert"
    BEVERAGE = "beverage"


class MenuItemCreate(BaseModel):
    """Create menu item request"""
    name: str = Field(..., min_length=2, max_length=100)
    category: MenuCategoryEnum
    price: float = Field(..., gt=0)
    description: str = Field(..., min_length=10, max_length=500)
    image_url: str
    is_available: bool = True
    is_veg: bool = True


class MenuItemUpdate(BaseModel):
    """Update menu item request"""
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    category: Optional[MenuCategoryEnum] = None
    price: Optional[float] = Field(None, gt=0)
    description: Optional[str] = Field(None, min_length=10, max_length=500)
    image_url: Optional[str] = None
    is_available: Optional[bool] = None
    is_veg: Optional[bool] = None


class MenuItemResponse(BaseModel):
    """Menu item response"""
    id: str = Field(alias="_id")
    name: str
    slug: str
    category: str
    price: float
    description: str
    image_url: str
    is_available: bool
    is_veg: bool
    rating: dict = Field(default_factory=lambda: {"avg": 0, "count": 0})
    created_at: datetime
    updated_at: datetime
    
    class Config:
        populate_by_name = True


class MenuListResponse(BaseModel):
    """Menu list response"""
    items: List[MenuItemResponse]
    total: int
    categories: List[str] = Field(default_factory=list)
