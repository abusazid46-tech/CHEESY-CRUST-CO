"""
Reservation service - table booking management
"""

from datetime import datetime, date, time, timedelta
from typing import Optional, List, Tuple
from bson import ObjectId

from config.settings import settings
from database import collections
from models.reservation import Reservation, PreOrderItem, ReservationStatus, PaymentStatus


class ReservationService:
    """Reservation service class"""
    
    async def check_availability(self, reservation_date: date, reservation_time: str, guests: int) -> Tuple[bool, dict]:
        """Check table availability"""
        try:
            time_obj = datetime.strptime(reservation_time, "%H:%M").time()
        except ValueError:
            return False, {"error": "Invalid time format"}
        
        # Check restaurant hours
        opening = time(11, 0)
        closing = time(22, 30)
        if time_obj < opening or time_obj > closing:
            return False, {"error": "Restaurant closed at this time"}
        
        # Check max guests
        if guests > settings.MAX_GUESTS_PER_TABLE:
            return False, {"error": f"Maximum {settings.MAX_GUESTS_PER_TABLE} guests per table"}
        
        # Get existing reservations for this date/time
        start_time = datetime.combine(reservation_date, time_obj)
        end_time = start_time + timedelta(minutes=90)
        
        existing = await collections.reservations.count_documents({
            "date": reservation_date.isoformat(),
            "status": {"$in": ["confirmed", "pending"]},
            "$or": [
                {"time": reservation_time},
                {"time": {"$gte": (start_time - timedelta(minutes=60)).strftime("%H:%M")}}
            ]
        })
        
        # Assume 10 tables available
        total_tables = 10
        available = total_tables - existing
        
        return available > 0, {
            "available": available > 0,
            "tables_available": max(0, available),
            "total_tables": total_tables
        }
    
    async def create_reservation(
        self,
        name: str,
        phone: str,
        reservation_date: date,
        reservation_time: str,
        guests: int,
        special_requests: Optional[str] = None,
        preorder_items: List[dict] = None,
        user_id: Optional[str] = None
    ) -> Tuple[bool, Optional[Reservation], str]:
        """Create a new reservation"""
        
        # Check availability
        available, availability_info = await self.check_availability(
            reservation_date, reservation_time, guests
        )
        
        if not available:
            return False, None, availability_info.get("error", "No tables available")
        
        # Create pre-order items
        preorder = []
        preorder_total = 0.0
        
        if preorder_items:
            for item in preorder_items:
                preorder.append(PreOrderItem(
                    item_id=item["item_id"],
                    name=item["name"],
                    price=item["price"],
                    quantity=item["quantity"]
                ))
                preorder_total += item["price"] * item["quantity"]
        
        # Create reservation
        reservation = Reservation(
            user_id=ObjectId(user_id) if user_id else None,
            name=name,
            phone=phone,
            date=reservation_date,
            time=datetime.strptime(reservation_time, "%H:%M").time(),
            guests=guests,
            special_requests=special_requests,
            preorder_items=preorder,
            preorder_total=preorder_total,
            status=ReservationStatus.PENDING,
            payment_status=PaymentStatus.PENDING if preorder_total > 0 else PaymentStatus.PAID
        )
        
        try:
            reservation_doc = reservation.model_dump(by_alias=True)
            reservation_doc["date"] = reservation_date.isoformat()
            reservation_doc["time"] = reservation_time
            
            result = await collections.reservations.insert_one(
                reservation_doc
            )
            reservation.id = result.inserted_id
            return True, reservation, "Reservation created successfully"
        except Exception as e:
            return False, None, str(e)
    
    async def get_reservation_by_id(self, reservation_id: str) -> Optional[dict]:
        """Get reservation by ID"""
        try:
            res = await collections.reservations.find_one({"_id": ObjectId(reservation_id)})
            if res:
                res["_id"] = str(res["_id"])
                if res.get("user_id"):
                    res["user_id"] = str(res["user_id"])
                # Convert date and time to strings
                if isinstance(res.get("date"), date):
                    res["date"] = res["date"].isoformat()
                if isinstance(res.get("time"), time):
                    res["time"] = res["time"].strftime("%H:%M")
            return res
        except Exception:
            return None
    
    async def get_user_reservations(self, user_id: str) -> List[dict]:
        """Get all reservations for a user"""
        reservations = await collections.reservations.find(
            {"user_id": ObjectId(user_id)}
        ).sort("created_at", -1).to_list(length=50)
        
        for res in reservations:
            res["_id"] = str(res["_id"])
            if res.get("user_id"):
                res["user_id"] = str(res["user_id"])
            if isinstance(res.get("date"), date):
                res["date"] = res["date"].isoformat()
            if isinstance(res.get("time"), time):
                res["time"] = res["time"].strftime("%H:%M")
        
        return reservations
    
    async def get_reservations_by_phone(self, phone: str) -> List[dict]:
        """Get reservations by phone number"""
        reservations = await collections.reservations.find(
            {"phone": phone}
        ).sort("created_at", -1).to_list(length=50)
        
        for res in reservations:
            res["_id"] = str(res["_id"])
            if res.get("user_id"):
                res["user_id"] = str(res["user_id"])
            if isinstance(res.get("date"), date):
                res["date"] = res["date"].isoformat()
            if isinstance(res.get("time"), time):
                res["time"] = res["time"].strftime("%H:%M")
        
        return reservations
    
    async def update_reservation_status(
        self,
        reservation_id: str,
        status: ReservationStatus
    ) -> bool:
        """Update reservation status"""
        try:
            result = await collections.reservations.update_one(
                {"_id": ObjectId(reservation_id)},
                {"$set": {
                    "status": status,
                    "updated_at": datetime.utcnow()
                }}
            )
            return result.modified_count > 0
        except Exception:
            return False
    
    async def get_all_reservations(
        self,
        date_filter: Optional[date] = None,
        status: Optional[str] = None,
        page: int = 1,
        per_page: int = 20
    ) -> dict:
        """Get all reservations (admin)"""
        query = {}
        
        if date_filter:
            query["date"] = date_filter.isoformat()
        if status:
            query["status"] = status
        
        total = await collections.reservations.count_documents(query)
        skip = (page - 1) * per_page
        
        reservations = await collections.reservations.find(query).sort(
            [("date", -1), ("time", -1)]
        ).skip(skip).limit(per_page).to_list(length=per_page)
        
        for res in reservations:
            res["_id"] = str(res["_id"])
            if res.get("user_id"):
                res["user_id"] = str(res["user_id"])
            if isinstance(res.get("date"), date):
                res["date"] = res["date"].isoformat()
            if isinstance(res.get("time"), time):
                res["time"] = res["time"].strftime("%H:%M")
        
        return {
            "reservations": reservations,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": (total + per_page - 1) // per_page
        }
    
    async def get_available_slots(self, reservation_date: date, guests: int) -> List[dict]:
        """Get available time slots for a date"""
        slots = []
        current = datetime.combine(reservation_date, time(11, 0))
        end = datetime.combine(reservation_date, time(22, 0))
        
        while current <= end:
            time_str = current.strftime("%H:%M")
            available, info = await self.check_availability(reservation_date, time_str, guests)
            
            slots.append({
                "time": time_str,
                "available": available,
                "tables_available": info.get("tables_available", 0)
            })
            
            current += timedelta(minutes=settings.RESERVATION_SLOT_INTERVAL_MINUTES)
        
        return slots


# Singleton instance
reservation_service = ReservationService()
