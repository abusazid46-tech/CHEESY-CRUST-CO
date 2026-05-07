"""
Cart schemas
"""

from pydantic import BaseModel, Field
from typing import List, Optional


class CartItemAdd(BaseModel):
    """Add item to cart request"""
    item_id: str
    quantity: int = Field(1, ge=1, le=20)


class CartItemUpdate(BaseModel):
    """Update cart item request"""
    item_id: str
    quantity: int = Field(..., ge=0, le=20)


class CartItemResponse(BaseModel):
    """Cart item response"""
    item_id: str
    name: str
    price: float
    quantity: int
    image_url: Optional[str] = None
    subtotal: float


class CartResponse(BaseModel):
    """Cart response"""
    id: str = Field(alias="_id")
    items: List[CartItemResponse] = Field(default_factory=list)
    total: float
    item_count: int = 0
    updated_at: str
    
    class Config:
        populate_by_name = True
