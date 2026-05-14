"""
Admin routes - dashboard and management
"""

from fastapi import APIRouter, Depends, Query, HTTPException, status
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
from bson import ObjectId

from middleware.admin_auth import admin_required  # ← USE THIS FOR ADMIN
from database import collections

router = APIRouter()


def serialize_doc(doc):
    """Convert Mongo ObjectIds inside common response documents."""
    if isinstance(doc, list):
        return [serialize_doc(item) for item in doc]
    if isinstance(doc, dict):
        return {key: serialize_doc(value) for key, value in doc.items()}
    if isinstance(doc, ObjectId):
        return str(doc)
    return doc


@router.get("/dashboard")
async def get_dashboard_stats(payload: Dict[str, Any] = Depends(admin_required)):  # ← Changed
    """Get admin dashboard statistics"""
    
    total_users = await collections.users.count_documents({})
    total_orders = await collections.orders.count_documents({})
    total_reservations = await collections.reservations.count_documents({})
    
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_orders = await collections.orders.count_documents({"created_at": {"$gte": today}})
    
    pipeline = [
        {"$match": {"payment_status": "paid"}},
        {"$group": {"_id": None, "total_revenue": {"$sum": "$total"}, "avg_order_value": {"$avg": "$total"}}}
    ]
    revenue_result = await collections.orders.aggregate(pipeline).to_list(length=1)
    revenue_stats = revenue_result[0] if revenue_result else {"total_revenue": 0, "avg_order_value": 0}
    
    today_pipeline = [
        {"$match": {"payment_status": "paid", "created_at": {"$gte": today}}},
        {"$group": {"_id": None, "revenue": {"$sum": "$total"}}}
    ]
    today_revenue_result = await collections.orders.aggregate(today_pipeline).to_list(length=1)
    today_revenue = today_revenue_result[0]["revenue"] if today_revenue_result else 0
    
    recent_orders = await collections.orders.find().sort("created_at", -1).limit(5).to_list(length=5)
    for order in recent_orders:
        order["_id"] = str(order["_id"])
        order["user_id"] = str(order["user_id"])
    
    return {
        "success": True,
        "stats": {
            "total_users": total_users,
            "total_orders": total_orders,
            "total_reservations": total_reservations,
            "today_orders": today_orders,
            "total_revenue": round(revenue_stats["total_revenue"], 2),
            "avg_order_value": round(revenue_stats["avg_order_value"], 2),
            "today_revenue": round(today_revenue, 2)
        },
        "recent_orders": recent_orders
    }


@router.get("/sales-summary")
async def get_sales_summary(
    payload: Dict[str, Any] = Depends(admin_required),  # ← Changed
    period: str = Query("week")
):
    """Get sales summary for charts"""
    
    now = datetime.utcnow()
    if period == "day":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        start = now - timedelta(days=7)
    else:
        start = now - timedelta(days=30)
    
    pipeline = [
        {"$match": {"payment_status": "paid", "created_at": {"$gte": start}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
            "revenue": {"$sum": "$total"},
            "orders": {"$sum": 1}
        }},
        {"$sort": {"_id": 1}}
    ]
    results = await collections.orders.aggregate(pipeline).to_list(length=30)
    
    item_pipeline = [
        {"$unwind": "$items"},
        {"$group": {
            "_id": "$items.name",
            "total_quantity": {"$sum": "$items.quantity"},
            "total_revenue": {"$sum": {"$multiply": ["$items.price", "$items.quantity"]}}
        }},
        {"$sort": {"total_quantity": -1}},
        {"$limit": 5}
    ]
    top_items = await collections.orders.aggregate(item_pipeline).to_list(length=5)
    
    return {"success": True, "period": period, "sales_data": results, "top_items": top_items}


@router.get("/users")
async def get_all_users(
    payload: Dict[str, Any] = Depends(admin_required),  # ← Changed
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None)
):
    """Get all users (admin only)"""
    query = {}
    if search:
        query["$or"] = [
            {"phone": {"$regex": search, "$options": "i"}},
            {"name": {"$regex": search, "$options": "i"}}
        ]
    
    total = await collections.users.count_documents(query)
    skip = (page - 1) * per_page
    users = await collections.users.find(query).skip(skip).limit(per_page).to_list(length=per_page)
    
    for user in users:
        user["_id"] = str(user["_id"])
        user["order_count"] = await collections.orders.count_documents({"user_id": ObjectId(user["_id"])})
    
    return {
        "success": True,
        "users": users,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page
    }


@router.get("/order-stats")
async def get_order_stats(payload: Dict[str, Any] = Depends(admin_required)):
    """Get order status counts for admin summaries."""
    pipeline = [{"$group": {"_id": "$status", "count": {"$sum": 1}}}]
    rows = await collections.orders.aggregate(pipeline).to_list(length=20)
    return {
        "success": True,
        "stats": {row["_id"]: row["count"] for row in rows},
        "total": await collections.orders.count_documents({})
    }


@router.get("/customer-stats")
async def get_customer_stats(payload: Dict[str, Any] = Depends(admin_required)):
    """Get customer account counts."""
    total = await collections.users.count_documents({})
    active = await collections.users.count_documents({"is_active": {"$ne": False}})
    with_orders = len(await collections.orders.distinct("user_id"))
    return {
        "success": True,
        "stats": {
            "total": total,
            "active": active,
            "inactive": total - active,
            "with_orders": with_orders
        }
    }


@router.get("/users/{user_id}/orders")
async def get_customer_orders(
    user_id: str,
    payload: Dict[str, Any] = Depends(admin_required)
):
    """Get orders for a customer."""
    if not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user id")
    orders = await collections.orders.find({"user_id": ObjectId(user_id)}).sort("created_at", -1).to_list(length=100)
    return {"success": True, "orders": serialize_doc(orders), "total": len(orders)}


@router.get("/users/{user_id}/reservations")
async def get_customer_reservations(
    user_id: str,
    payload: Dict[str, Any] = Depends(admin_required)
):
    """Get reservations for a customer."""
    if not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user id")
    reservations = await collections.reservations.find({"user_id": ObjectId(user_id)}).sort("created_at", -1).to_list(length=100)
    return {"success": True, "reservations": serialize_doc(reservations), "total": len(reservations)}


@router.patch("/users/{user_id}/status")
async def update_customer_status(
    user_id: str,
    body: Dict[str, Any],
    payload: Dict[str, Any] = Depends(admin_required)
):
    """Activate or deactivate a customer."""
    if not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user id")
    result = await collections.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"is_active": bool(body.get("is_active", True)), "updated_at": datetime.utcnow()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return {"success": True, "message": "Customer status updated"}


@router.get("/review-stats")
async def get_review_stats(payload: Dict[str, Any] = Depends(admin_required)):
    """Get review moderation counts."""
    total = await collections.reviews.count_documents({})
    pending = await collections.reviews.count_documents({"approved": {"$ne": True}})
    approved = await collections.reviews.count_documents({"approved": True})
    return {"success": True, "stats": {"total": total, "pending": pending, "approved": approved}}


@router.get("/reviews")
async def get_reviews(
    payload: Dict[str, Any] = Depends(admin_required),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100)
):
    skip = (page - 1) * per_page
    total = await collections.reviews.count_documents({})
    reviews = await collections.reviews.find().sort("created_at", -1).skip(skip).limit(per_page).to_list(length=per_page)
    return {"success": True, "reviews": serialize_doc(reviews), "total": total, "page": page, "per_page": per_page}


@router.get("/reviews/pending")
async def get_pending_reviews(payload: Dict[str, Any] = Depends(admin_required)):
    reviews = await collections.reviews.find({"approved": {"$ne": True}}).sort("created_at", -1).to_list(length=100)
    return {"success": True, "reviews": serialize_doc(reviews), "total": len(reviews)}


@router.patch("/reviews/{review_id}/approve")
async def approve_review(review_id: str, payload: Dict[str, Any] = Depends(admin_required)):
    if not ObjectId.is_valid(review_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid review id")
    result = await collections.reviews.update_one(
        {"_id": ObjectId(review_id)},
        {"$set": {"approved": True, "updated_at": datetime.utcnow()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")
    return {"success": True, "message": "Review approved"}


@router.patch("/reviews/{review_id}/reject")
async def reject_review(review_id: str, payload: Dict[str, Any] = Depends(admin_required)):
    if not ObjectId.is_valid(review_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid review id")
    result = await collections.reviews.update_one(
        {"_id": ObjectId(review_id)},
        {"$set": {"approved": False, "rejected": True, "updated_at": datetime.utcnow()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")
    return {"success": True, "message": "Review rejected"}


@router.delete("/reviews/{review_id}")
async def delete_review(review_id: str, payload: Dict[str, Any] = Depends(admin_required)):
    if not ObjectId.is_valid(review_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid review id")
    result = await collections.reviews.delete_one({"_id": ObjectId(review_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")
    return {"success": True, "message": "Review deleted"}


@router.get("/settings")
async def get_settings(payload: Dict[str, Any] = Depends(admin_required)):
    doc = await collections.settings.find_one({"_id": "restaurant"})
    settings_doc = doc or {
        "_id": "restaurant",
        "restaurantName": "Cheesy Crust Co.",
        "restaurantPhone": "+917002012345",
        "restaurantEmail": "dine@cheesycrust.co",
        "deliveryFee": 40,
        "freeDeliveryThreshold": 500,
        "minOrderAmount": 100,
        "deliveryRadius": 10,
        "maxGuests": 8
    }
    return {"success": True, "settings": serialize_doc(settings_doc)}


@router.put("/settings")
async def update_settings(body: Dict[str, Any], payload: Dict[str, Any] = Depends(admin_required)):
    body["updated_at"] = datetime.utcnow()
    await collections.settings.update_one({"_id": "restaurant"}, {"$set": body}, upsert=True)
    doc = await collections.settings.find_one({"_id": "restaurant"})
    return {"success": True, "settings": serialize_doc(doc)}


@router.get("/settings/business-hours")
async def get_business_hours(payload: Dict[str, Any] = Depends(admin_required)):
    doc = await collections.settings.find_one({"_id": "business-hours"})
    return {"success": True, "business_hours": serialize_doc(doc or {"_id": "business-hours", "open": "11:00", "close": "23:00"})}


@router.put("/settings/business-hours")
async def update_business_hours(body: Dict[str, Any], payload: Dict[str, Any] = Depends(admin_required)):
    body["updated_at"] = datetime.utcnow()
    await collections.settings.update_one({"_id": "business-hours"}, {"$set": body}, upsert=True)
    return {"success": True, "business_hours": serialize_doc(await collections.settings.find_one({"_id": "business-hours"}))}


@router.get("/settings/delivery")
async def get_delivery_settings(payload: Dict[str, Any] = Depends(admin_required)):
    doc = await collections.settings.find_one({"_id": "delivery"})
    return {"success": True, "delivery": serialize_doc(doc or {"_id": "delivery", "deliveryFee": 40, "freeDeliveryThreshold": 500, "deliveryRadius": 10})}


@router.put("/settings/delivery")
async def update_delivery_settings(body: Dict[str, Any], payload: Dict[str, Any] = Depends(admin_required)):
    body["updated_at"] = datetime.utcnow()
    await collections.settings.update_one({"_id": "delivery"}, {"$set": body}, upsert=True)
    return {"success": True, "delivery": serialize_doc(await collections.settings.find_one({"_id": "delivery"}))}


@router.get("/settings/notifications")
async def get_notification_settings(payload: Dict[str, Any] = Depends(admin_required)):
    doc = await collections.settings.find_one({"_id": "notifications"})
    return {"success": True, "notifications": serialize_doc(doc or {"_id": "notifications", "email": True, "sms": False})}


@router.put("/settings/notifications")
async def update_notification_settings(body: Dict[str, Any], payload: Dict[str, Any] = Depends(admin_required)):
    body["updated_at"] = datetime.utcnow()
    await collections.settings.update_one({"_id": "notifications"}, {"$set": body}, upsert=True)
    return {"success": True, "notifications": serialize_doc(await collections.settings.find_one({"_id": "notifications"}))}


@router.get("/offers")
async def get_offers(payload: Dict[str, Any] = Depends(admin_required)):
    offers = await collections.offers.find().sort("created_at", -1).to_list(length=100)
    return {"success": True, "offers": serialize_doc(offers)}


@router.get("/offers/active")
async def get_active_offers():
    offers = await collections.offers.find({"is_active": {"$ne": False}}).sort("created_at", -1).to_list(length=100)
    return {"success": True, "offers": serialize_doc(offers)}


@router.post("/offers")
async def create_offer(body: Dict[str, Any], payload: Dict[str, Any] = Depends(admin_required)):
    body["created_at"] = datetime.utcnow()
    body["updated_at"] = datetime.utcnow()
    body.setdefault("is_active", True)
    result = await collections.offers.insert_one(body)
    offer = await collections.offers.find_one({"_id": result.inserted_id})
    return {"success": True, "offer": serialize_doc(offer)}


@router.put("/offers/{offer_id}")
async def update_offer(offer_id: str, body: Dict[str, Any], payload: Dict[str, Any] = Depends(admin_required)):
    if not ObjectId.is_valid(offer_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid offer id")
    body["updated_at"] = datetime.utcnow()
    offer = await collections.offers.find_one_and_update(
        {"_id": ObjectId(offer_id)},
        {"$set": body},
        return_document=True
    )
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    return {"success": True, "offer": serialize_doc(offer)}


@router.patch("/offers/{offer_id}/toggle")
async def toggle_offer(offer_id: str, payload: Dict[str, Any] = Depends(admin_required)):
    if not ObjectId.is_valid(offer_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid offer id")
    offer = await collections.offers.find_one({"_id": ObjectId(offer_id)})
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    updated = await collections.offers.find_one_and_update(
        {"_id": ObjectId(offer_id)},
        {"$set": {"is_active": not offer.get("is_active", True), "updated_at": datetime.utcnow()}},
        return_document=True
    )
    return {"success": True, "offer": serialize_doc(updated)}


@router.delete("/offers/{offer_id}")
async def delete_offer(offer_id: str, payload: Dict[str, Any] = Depends(admin_required)):
    if not ObjectId.is_valid(offer_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid offer id")
    result = await collections.offers.delete_one({"_id": ObjectId(offer_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    return {"success": True, "message": "Offer deleted"}
