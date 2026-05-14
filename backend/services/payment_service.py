"""
Payment service - Razorpay integration
"""

import razorpay
import hmac
import hashlib
import logging
from typing import Optional, Tuple
from datetime import datetime

from config.settings import settings
from database import collections
from models.order import PaymentStatus

logger = logging.getLogger(__name__)


class PaymentService:
    """Payment service class"""
    
    def __init__(self):
        self.client = razorpay.Client(
            auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)
        )
    
    async def create_order(
        self,
        amount: float,
        order_id: Optional[str] = None,
        reservation_id: Optional[str] = None,
        notes: Optional[dict] = None
    ) -> Tuple[bool, dict]:
        """Create Razorpay order"""
        try:
            # Convert to paise
            amount_in_paise = int(amount * 100)
            
            razorpay_order = self.client.order.create({
                "amount": amount_in_paise,
                "currency": "INR",
                "payment_capture": 1,
                "notes": notes or {}
            })
            
            # Save payment record
            payment_record = {
                "razorpay_order_id": razorpay_order["id"],
                "amount": amount,
                "currency": "INR",
                "status": "created",
                "order_id": order_id,
                "reservation_id": reservation_id,
                "notes": notes,
                "created_at": razorpay_order["created_at"]
            }
            
            await collections.payments.insert_one(payment_record)
            
            return True, {
                "razorpay_order_id": razorpay_order["id"],
                "razorpay_key": settings.RAZORPAY_KEY_ID,
                "amount": amount_in_paise,
                "currency": "INR",
                "order_id": order_id,
                "reservation_id": reservation_id
            }
        except Exception as e:
            logger.error(f"Razorpay order creation error: {e}")
            return False, {"error": str(e)}
    
    def verify_signature(
        self,
        razorpay_payment_id: str,
        razorpay_order_id: str,
        razorpay_signature: str
    ) -> bool:
        """Verify Razorpay payment signature"""
        try:
            # Create signature string
            signature_string = f"{razorpay_order_id}|{razorpay_payment_id}"
            
            # Generate expected signature
            expected_signature = hmac.new(
                settings.RAZORPAY_KEY_SECRET.encode(),
                signature_string.encode(),
                hashlib.sha256
            ).hexdigest()
            
            return hmac.compare_digest(expected_signature, razorpay_signature)
        except Exception as e:
            logger.error(f"Signature verification error: {e}")
            return False
    
    async def process_payment_success(
        self,
        razorpay_payment_id: str,
        razorpay_order_id: str,
        razorpay_signature: str,
        order_id: Optional[str] = None,
        reservation_id: Optional[str] = None
    ) -> Tuple[bool, str]:
        """Process successful payment"""
        
        # Verify signature
        if not self.verify_signature(razorpay_payment_id, razorpay_order_id, razorpay_signature):
            return False, "Invalid payment signature"
        
        # Update payment record
        await collections.payments.update_one(
            {"razorpay_order_id": razorpay_order_id},
            {"$set": {
                "razorpay_payment_id": razorpay_payment_id,
                "razorpay_signature": razorpay_signature,
                "status": "paid",
                "verified_at": datetime.utcnow()
            }}
        )
        
        # Update order payment status
        if order_id:
            from bson import ObjectId
            order = await collections.orders.find_one({"_id": ObjectId(order_id)})
            await collections.orders.update_one(
                {"_id": ObjectId(order_id)},
                {"$set": {
                    "payment_status": PaymentStatus.PAID,
                    "payment_id": razorpay_payment_id,
                    "status": "confirmed",
                    "updated_at": datetime.utcnow()
                }}
            )
            if order and order.get("user_id"):
                await collections.carts.update_one(
                    {"user_id": order["user_id"]},
                    {"$set": {"items": [], "total": 0.0, "updated_at": datetime.utcnow()}}
                )
        
        # Update reservation payment status
        if reservation_id:
            from bson import ObjectId
            await collections.reservations.update_one(
                {"_id": ObjectId(reservation_id)},
                {"$set": {
                    "payment_status": PaymentStatus.PAID,
                    "payment_id": razorpay_payment_id,
                    "status": "confirmed",
                    "updated_at": datetime.utcnow()
                }}
            )
        
        return True, "Payment verified successfully"
    
    async def get_payment_by_order(self, razorpay_order_id: str) -> Optional[dict]:
        """Get payment record by Razorpay order ID"""
        payment = await collections.payments.find_one({"razorpay_order_id": razorpay_order_id})
        if payment:
            payment["_id"] = str(payment["_id"])
        return payment
    
    async def refund_payment(self, payment_id: str, amount: Optional[float] = None) -> Tuple[bool, dict]:
        """Refund a payment"""
        try:
            refund_data = {"payment_id": payment_id}
            if amount:
                refund_data["amount"] = int(amount * 100)
            
            refund = self.client.payment.refund(payment_id, refund_data)
            
            await collections.payments.update_one(
                {"razorpay_payment_id": payment_id},
                {"$set": {
                    "status": "refunded",
                    "refund_id": refund["id"],
                    "refund_amount": amount,
                    "refunded_at": datetime.utcnow()
                }}
            )
            
            return True, refund
        except Exception as e:
            logger.error(f"Refund error: {e}")
            return False, {"error": str(e)}


# Singleton instance
payment_service = PaymentService()
