"""
Payment routes - Razorpay integration
"""

from fastapi import APIRouter, HTTPException, status, Depends, Request
from fastapi.responses import JSONResponse
from typing import Dict, Any

from middleware import auth_optional, auth_required, get_current_user
from schemas.payment import (
    CreateOrderRequest, CreateOrderResponse,
    VerifyPaymentRequest
)
from services import payment_service

router = APIRouter()


@router.post("/create-order")
async def create_payment_order(
    request: CreateOrderRequest,
    payload: Dict[str, Any] = Depends(auth_optional)
):
    """Create Razorpay order for payment"""
    user = await get_current_user(payload) if payload else None
    
    # Add user info to notes
    notes = request.notes or {}
    if user:
        notes.update({
            "user_id": user["_id"],
            "user_phone": user["phone"]
        })
    
    success, result = await payment_service.create_order(
        amount=request.amount,
        order_id=request.order_id,
        reservation_id=request.reservation_id,
        notes=notes
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.get("error", "Failed to create payment order")
        )
    
    return CreateOrderResponse(**result)


@router.post("/verify")
async def verify_payment(
    request: VerifyPaymentRequest,
    payload: Dict[str, Any] = Depends(auth_optional)
):
    """Verify Razorpay payment signature"""
    success, message = await payment_service.process_payment_success(
        razorpay_payment_id=request.razorpay_payment_id,
        razorpay_order_id=request.razorpay_order_id,
        razorpay_signature=request.razorpay_signature,
        order_id=request.order_id,
        reservation_id=request.reservation_id
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message
        )
    
    return {
        "success": True,
        "message": message
    }


@router.post("/webhook")
async def razorpay_webhook(request: Request):
    """Handle Razorpay webhooks"""
    # Get webhook secret from headers
    webhook_secret = request.headers.get("X-Razorpay-Signature")
    
    # Get request body
    body = await request.body()
    
    # Verify webhook signature (implement verification)
    # Process webhook event
    
    return JSONResponse(
        content={"status": "received"},
        status_code=status.HTTP_200_OK
    )


@router.get("/order/{razorpay_order_id}")
async def get_payment_details(
    razorpay_order_id: str,
    payload: Dict[str, Any] = Depends(auth_required)
):
    """Get payment details by Razorpay order ID"""
    payment = await payment_service.get_payment_by_order(razorpay_order_id)
    
    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment not found"
        )
    
    return {
        "success": True,
        "payment": payment
    }
