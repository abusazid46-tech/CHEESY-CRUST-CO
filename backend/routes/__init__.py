# backend/routes/__init__.py

from .auth import router as auth_router
from .user import router as user_router
from .menu import router as menu_router
from .cart import router as cart_router
from .orders import router as order_router
from .payment import router as payment_router
from .reservation import router as reservation_router
from .admin import router as admin_router
from .admin_auth import router as admin_auth_router  # Use relative import like others

__all__ = [
    "auth_router",
    "user_router",
    "menu_router",
    "cart_router",
    "order_router",
    "payment_router",
    "reservation_router",
    "admin_router",  # ADDED MISSING COMMA HERE
    "admin_auth_router"
]
