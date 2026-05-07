"""
Table reservation models
"""

from datetime import datetime, date, time
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


class ReservationStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    COMPLETED = "completed"
    NO_SHOW = "no_show"


class PaymentStatus(str, Enum):  # <-- ADD THIS
    PENDING = "pending"
    PAID = "paid"
    FAILED = "failed"
    REFUNDED = "refunded"


class PreOrderItem(BaseModel):
    """Pre-order item for reservation"""
    item_id: str
    name: str
    price: float
    quantity: int = 1


class Reservation(BaseModel):
    """Table reservation model"""
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    user_id: Optional[PyObjectId] = None
    name: str
    phone: str
    date: date
    time: time
    guests: int
    special_requests: Optional[str] = None
    preorder_items: List[PreOrderItem] = Field(default_factory=list)
    preorder_total: float = 0.0
    status: ReservationStatus = ReservationStatus.PENDING
    payment_status: PaymentStatus = PaymentStatus.PENDING  # <-- NOW DEFINED
    payment_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
    
    def calculate_preorder_total(self) -> float:
        return sum(item.price * item.quantity for item in self.preorder_items)
