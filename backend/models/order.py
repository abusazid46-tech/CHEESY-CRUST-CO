"""
Order models
"""

from datetime import datetime
from typing import List, Optional
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


class OrderStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    PREPARING = "preparing"
    READY = "ready"
    OUT_FOR_DELIVERY = "out_for_delivery"
    DELIVERED = "delivered"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class PaymentStatus(str, Enum):
    PENDING = "pending"
    PAID = "paid"
    FAILED = "failed"
    REFUNDED = "refunded"


class OrderType(str, Enum):
    DELIVERY = "delivery"
    TAKEAWAY = "takeaway"
    DINE_IN = "dine_in"


class OrderItem(BaseModel):
    """Order item"""
    item_id: str
    name: str
    price: float
    quantity: int
    image_url: Optional[str] = None
    
    @property
    def subtotal(self) -> float:
        return self.price * self.quantity


class Order(BaseModel):
    """Order model"""
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    order_number: str
    user_id: PyObjectId
    items: List[OrderItem] = Field(default_factory=list)
    subtotal: float = 0.0
    delivery_fee: float = 0.0
    total: float = 0.0
    order_type: OrderType = OrderType.DELIVERY
    address: Optional[str] = None
    status: OrderStatus = OrderStatus.PENDING
    payment_status: PaymentStatus = PaymentStatus.PENDING
    payment_id: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
    
    @classmethod
    def generate_order_number(cls) -> str:
        """Generate unique order number"""
        import random
        import string
        timestamp = datetime.utcnow().strftime("%Y%m%d")
        random_str = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        return f"CC{timestamp}{random_str}"
