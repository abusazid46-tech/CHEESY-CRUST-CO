"""
Shopping cart models
"""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field
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


class CartItem(BaseModel):
    """Individual cart item"""
    item_id: str
    name: str
    price: float
    quantity: int = 1
    image_url: Optional[str] = None
    
    @property
    def subtotal(self) -> float:
        return self.price * self.quantity


class Cart(BaseModel):
    """Shopping cart model"""
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    user_id: PyObjectId
    items: List[CartItem] = Field(default_factory=list)
    total: float = 0.0
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
    
    def calculate_total(self) -> float:
        """Calculate cart total"""
        return sum(item.subtotal for item in self.items)
    
    def update_total(self):
        """Update total and timestamp"""
        self.total = self.calculate_total()
        self.updated_at = datetime.utcnow()
