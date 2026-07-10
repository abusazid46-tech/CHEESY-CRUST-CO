"""
Payment schemas
"""

from pydantic import BaseModel, Field
from typing import Optional


class CreateOrderRequest(BaseModel):
    """Create Razorpay order request"""
    amount: Optional[float] = Field(None, gt=0)
    order_id: Optional[str] = None
    reservation_id: Optional[str] = None
    notes: Optional[dict] = None


class CreateOrderResponse(BaseModel):
    """Create Razorpay order response"""
    razorpay_order_id: str
    razorpay_key: str
    amount: int
    currency: str = "INR"
    order_id: Optional[str] = None
    reservation_id: Optional[str] = None


class VerifyPaymentRequest(BaseModel):
    """Verify payment request"""
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str
    order_id: Optional[str] = None
    reservation_id: Optional[str] = None


class PaymentResponse(BaseModel):
    """Payment response"""
    id: str
    razorpay_payment_id: str
    razorpay_order_id: str
    amount: float
    status: str
    created_at: str
