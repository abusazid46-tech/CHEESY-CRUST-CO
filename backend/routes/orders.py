"""
Order routes - order creation and management
"""

from fastapi import APIRouter, HTTPException, status, Depends, Query
from typing import Dict, Any, Optional

from middleware import auth_required, get_current_user, get_current_admin_user
from schemas.order import OrderCreateRequest, OrderResponse, OrderStatusUpdateRequest
from services import order_service
from models.order import OrderStatus

router = APIRouter()


@router.post("/create")
async def create_order(
    request: OrderCreateRequest,
    payload: Dict[str, Any] = Depends(auth_required)
):
    """Create a new order"""
    user = await get_current_user(payload)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Validate address for delivery
    if request.order_type == "delivery" and not request.address:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Delivery address is required"
        )
    
    # Create order
    items = [item.model_dump() for item in request.items]
    order = await order_service.create_order(
        user_id=user["_id"],
        items=items,
        order_type=request.order_type,
        address=request.address,
        notes=request.notes
    )
    
    if not order:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to create order"
        )
    
    return {
        "success": True,
        "message": "Order created successfully",
        "order_id": str(order.id),
        "order_number": order.order_number,
        "total": order.total
    }


@router.get("/user")
async def get_user_orders(
    payload: Dict[str, Any] = Depends(auth_required),
    limit: int = Query(50, ge=1, le=100)
):
    """Get current user's orders"""
    user = await get_current_user(payload)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    orders = await order_service.get_user_orders(user["_id"], limit)
    
    return {
        "success": True,
        "orders": orders,
        "total": len(orders)
    }


@router.get("/track/{order_number}")
async def track_order(order_number: str):
    """Track order by order number (public)"""
    order = await order_service.get_order_by_number(order_number)
    
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )
    
    # Return limited info for tracking
    return {
        "success": True,
        "order_number": order["order_number"],
        "status": order["status"],
        "created_at": order["created_at"],
        "estimated_delivery": "45-60 minutes"
    }


# ========== ADMIN ROUTES ==========

@router.get("/admin/all")
async def get_all_orders(
    admin: Dict[str, Any] = Depends(get_current_admin_user),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100)
):
    """Get all orders (admin only)"""
    result = await order_service.get_all_orders(
        status=status,
        page=page,
        per_page=per_page
    )
    
    return {
        "success": True,
        **result
    }


@router.patch("/admin/{order_id}/status")
async def update_order_status(
    order_id: str,
    request: OrderStatusUpdateRequest,
    admin: Dict[str, Any] = Depends(get_current_admin_user)
):
    """Update order status (admin only)"""
    try:
        status_enum = OrderStatus(request.status)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid order status"
        )
    
    order = await order_service.update_order_status(
        order_id,
        status_enum,
        request.notes
    )
    
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )
    
    return {
        "success": True,
        "message": f"Order status updated to {request.status}",
        "order": order
    }


@router.get("/{order_id}")
async def get_order(
    order_id: str,
    payload: Dict[str, Any] = Depends(auth_required)
):
    """Get order by ID"""
    user = await get_current_user(payload)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    order = await order_service.get_order_by_id(order_id)
    
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )
    
    # Check if user owns the order (unless admin)
    if str(order["user_id"]) != user["_id"] and not user.get("is_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    return {
        "success": True,
        "order": order
    }
