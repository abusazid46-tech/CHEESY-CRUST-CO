"""
Reservation routes - table booking
"""

from fastapi import APIRouter, HTTPException, status, Depends, Query
from typing import Dict, Any, Optional
from datetime import date

from middleware import auth_optional, auth_required, get_current_user, get_current_admin_user
from schemas.reservation import (
    ReservationCreateRequest, ReservationResponse,
    ReservationAvailabilityRequest
)
from services import reservation_service
from models.reservation import ReservationStatus

router = APIRouter()


@router.post("")
async def create_reservation(
    request: ReservationCreateRequest,
    payload: Optional[Dict[str, Any]] = Depends(auth_optional)
):
    """Create a new table reservation"""
    user = await get_current_user(payload) if payload else None
    
    preorder_items = [item.model_dump() for item in request.preorder_items]
    
    success, reservation, message = await reservation_service.create_reservation(
        name=request.name,
        phone=request.phone,
        reservation_date=request.date,
        reservation_time=request.time,
        guests=request.guests,
        special_requests=request.special_requests,
        preorder_items=preorder_items,
        user_id=user["_id"] if user else None
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message
        )
    
    return {
        "success": True,
        "message": message,
        "reservation_id": str(reservation.id),
        "preorder_total": reservation.preorder_total
    }


@router.get("/availability")
async def check_availability(
    reservation_date: str = Query(..., alias="date", description="Date in YYYY-MM-DD format"),
    time: str = Query(..., description="Time in HH:MM format"),
    guests: int = Query(..., ge=1)
):
    """Check table availability"""
    try:
        parsed_date = date.fromisoformat(reservation_date)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid date format. Use YYYY-MM-DD"
        )
    
    available, info = await reservation_service.check_availability(
        parsed_date, time, guests
    )
    
    return {
        "success": True,
        "available": available,
        **info
    }


@router.get("/slots/{date_str}")
async def get_available_slots(
    date_str: str,
    guests: int = Query(2, ge=1)
):
    """Get available time slots for a date"""
    try:
        reservation_date = date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid date format. Use YYYY-MM-DD"
        )
    
    slots = await reservation_service.get_available_slots(reservation_date, guests)
    
    return {
        "success": True,
        "date": date_str,
        "guests": guests,
        "slots": slots
    }


@router.get("/user")
async def get_user_reservations(
    payload: Dict[str, Any] = Depends(auth_required)
):
    """Get current user's reservations"""
    user = await get_current_user(payload)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    reservations = await reservation_service.get_user_reservations(user["_id"])
    
    return {
        "success": True,
        "reservations": reservations,
        "total": len(reservations)
    }


@router.get("/lookup/{phone}")
async def lookup_reservations(phone: str):
    """Look up reservations by phone number"""
    reservations = await reservation_service.get_reservations_by_phone(phone)
    
    return {
        "success": True,
        "reservations": reservations,
        "total": len(reservations)
    }


# ========== ADMIN ROUTES ==========

@router.get("/admin/all")
async def get_all_reservations(
    admin: Dict[str, Any] = Depends(get_current_admin_user),
    date_filter: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100)
):
    """Get all reservations (admin only)"""
    filter_date = None
    if date_filter:
        try:
            filter_date = date.fromisoformat(date_filter)
        except ValueError:
            pass
    
    result = await reservation_service.get_all_reservations(
        date_filter=filter_date,
        status=status,
        page=page,
        per_page=per_page
    )
    
    return {
        "success": True,
        **result
    }


@router.patch("/admin/{reservation_id}/status")
async def update_reservation_status(
    reservation_id: str,
    reservation_status: str = Query(..., alias="status"),
    admin: Dict[str, Any] = Depends(get_current_admin_user)
):
    """Update reservation status (admin only)"""
    try:
        status_enum = ReservationStatus(reservation_status)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reservation status"
        )
    
    success = await reservation_service.update_reservation_status(
        reservation_id,
        status_enum
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reservation not found"
        )
    
    return {
        "success": True,
        "message": f"Reservation status updated to {reservation_status}"
    }


@router.get("/{reservation_id}")
async def get_reservation(reservation_id: str):
    """Get reservation by ID (public)"""
    reservation = await reservation_service.get_reservation_by_id(reservation_id)
    
    if not reservation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reservation not found"
        )
    
    return {
        "success": True,
        "reservation": reservation
    }
