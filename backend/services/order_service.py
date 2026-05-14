"""
Order service - order processing
"""

from datetime import datetime
from typing import Optional, List
from bson import ObjectId

from config.settings import settings
from database import collections
from models.order import Order, OrderItem, OrderStatus, PaymentStatus, OrderType


class OrderService:
    """Order service class"""
    
    async def create_order(
        self,
        user_id: str,
        items: List[dict],
        order_type: str,
        address: Optional[str] = None,
        notes: Optional[str] = None
    ) -> Optional[Order]:
        """Create a new order"""
        try:
            # Calculate totals
            subtotal = sum(item["price"] * item["quantity"] for item in items)
            delivery_fee = settings.DELIVERY_FEE if order_type == "delivery" else 0
            
            # Free delivery threshold
            if subtotal >= settings.FREE_DELIVERY_THRESHOLD:
                delivery_fee = 0
            
            total = subtotal + delivery_fee
            
            # Create order items
            order_items = []
            for item in items:
                order_items.append(OrderItem(
                    item_id=item["item_id"],
                    name=item["name"],
                    price=item["price"],
                    quantity=item["quantity"],
                    image_url=item.get("image_url")
                ))
            
            # Generate unique order number
            order_number = Order.generate_order_number()
            
            # Ensure order number is unique
            existing = await collections.orders.find_one({"order_number": order_number})
            while existing:
                order_number = Order.generate_order_number()
                existing = await collections.orders.find_one({"order_number": order_number})
            
            # Create order
            order = Order(
                order_number=order_number,
                user_id=ObjectId(user_id),
                items=order_items,
                subtotal=subtotal,
                delivery_fee=delivery_fee,
                total=total,
                order_type=OrderType(order_type),
                address=address,
                notes=notes,
                status=OrderStatus.PENDING,
                payment_status=PaymentStatus.PENDING
            )
            
            result = await collections.orders.insert_one(order.model_dump(by_alias=True))
            order.id = result.inserted_id
            
            return order
        except Exception as e:
            print(f"Order creation error: {e}")
            return None
    
    async def get_order_by_id(self, order_id: str) -> Optional[dict]:
        """Get order by ID"""
        try:
            order = await collections.orders.find_one({"_id": ObjectId(order_id)})
            if order:
                order["_id"] = str(order["_id"])
                order["user_id"] = str(order["user_id"])
            return order
        except Exception:
            return None
    
    async def get_order_by_number(self, order_number: str) -> Optional[dict]:
        """Get order by order number"""
        order = await collections.orders.find_one({"order_number": order_number})
        if order:
            order["_id"] = str(order["_id"])
            order["user_id"] = str(order["user_id"])
        return order
    
    async def get_user_orders(self, user_id: str, limit: int = 50) -> List[dict]:
        """Get all orders for a user"""
        orders = await collections.orders.find(
            {"user_id": ObjectId(user_id)}
        ).sort("created_at", -1).limit(limit).to_list(length=limit)
        
        for order in orders:
            order["_id"] = str(order["_id"])
            order["user_id"] = str(order["user_id"])
        
        return orders
    
    async def update_order_status(
        self,
        order_id: str,
        status: OrderStatus,
        notes: Optional[str] = None
    ) -> Optional[dict]:
        """Update order status"""
        try:
            update_data = {
                "status": status,
                "updated_at": datetime.utcnow()
            }
            
            if notes:
                update_data["notes"] = notes
            
            if status == OrderStatus.DELIVERED or status == OrderStatus.COMPLETED:
                update_data["payment_status"] = PaymentStatus.PAID
            
            result = await collections.orders.find_one_and_update(
                {"_id": ObjectId(order_id)},
                {"$set": update_data},
                return_document=True
            )
            
            if result:
                result["_id"] = str(result["_id"])
                result["user_id"] = str(result["user_id"])
            
            return result
        except Exception:
            return None
    
    async def update_payment_status(
        self,
        order_id: str,
        payment_status: PaymentStatus,
        payment_id: Optional[str] = None
    ) -> bool:
        """Update payment status"""
        try:
            update_data = {
                "payment_status": payment_status,
                "updated_at": datetime.utcnow()
            }
            
            if payment_id:
                update_data["payment_id"] = payment_id
            
            if payment_status == PaymentStatus.PAID:
                update_data["status"] = OrderStatus.CONFIRMED
            
            result = await collections.orders.update_one(
                {"_id": ObjectId(order_id)},
                {"$set": update_data}
            )
            
            return result.modified_count > 0
        except Exception:
            return False
    
    async def get_all_orders(
        self,
        status: Optional[str] = None,
        page: int = 1,
        per_page: int = 20
    ) -> dict:
        """Get all orders (admin)"""
        query = {}
        if status:
            query["status"] = status
        
        total = await collections.orders.count_documents(query)
        skip = (page - 1) * per_page
        
        orders = await collections.orders.find(query).sort(
            "created_at", -1
        ).skip(skip).limit(per_page).to_list(length=per_page)
        
        for order in orders:
            order["_id"] = str(order["_id"])
            order["user_id"] = str(order["user_id"])
        
        return {
            "orders": orders,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": (total + per_page - 1) // per_page
        }


# Singleton instance
order_service = OrderService()
