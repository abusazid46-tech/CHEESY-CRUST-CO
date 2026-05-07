"""
Reservation schemas
"""

from pydantic import BaseModel, Field, field_validator
from typing import List, Optional
from datetime import date, time, datetime


class PreOrderItemSchema(BaseModel):
    """Pre-order item schema"""
    item_id: str
    name: str
    price: float
    quantity: int = Field(1, ge=1)


class ReservationCreateRequest(BaseModel):
    """Create reservation request"""
    name: str = Field(..., min_length=2, max_length=50)
    phone: str
    date: date
    time: str
    guests: int = Field(..., ge=1, le=20)
    special_requests: Optional[str] = None
    preorder_items: List[PreOrderItemSchema] = Field(default_factory=list)
    
    @field_validator("time")
    @classmethod
    def validate_time(cls, v: str) -> str:
        # Validate time format HH:MM
        try:
            datetime.strptime(v, "%H:%M")
        except ValueError:
            raise ValueError("Time must be in HH:MM format")
        return v
    
    @field_validator("date")
    @classmethod
    def validate_date(cls, v: date) -> date:
        from datetime import date as date_type
        if v < date_type.today():
            raise ValueError("Date cannot be in the past")
        return v


class ReservationResponse(BaseModel):
    """Reservation response"""
    id: str = Field(alias="_id")
    name: str
    phone: str
    date: str
    time: str
    guests: int
    special_requests: Optional[str] = None
    preorder_items: List[dict] = Field(default_factory=list)
    preorder_total: float
    status: str
    payment_status: str
    created_at: datetime
    
    class Config:
        populate_by_name = True


class ReservationAvailabilityRequest(BaseModel):
    """Check availability request"""
    date: date
    time: str
    guests: int
