"""
MongoDB connection setup using Motor (async driver)
"""

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING, IndexModel
import logging

from config.settings import settings

logger = logging.getLogger(__name__)

client: AsyncIOMotorClient | None = None
db: AsyncIOMotorDatabase | None = None


async def connect_to_mongo():
    """Initialize MongoDB connection and create indexes"""
    global client, db
    
    try:
        client = AsyncIOMotorClient(
            settings.MONGODB_URI,
            maxPoolSize=settings.MONGODB_MAX_POOL_SIZE,
            minPoolSize=settings.MONGODB_MIN_POOL_SIZE,
            serverSelectionTimeoutMS=5000
        )
        db = client[settings.MONGODB_DB_NAME]
        
        # Test connection
        await client.admin.command("ping")
        logger.info("MongoDB connection established")
        
        # Create indexes
        await create_indexes()
        
    except Exception as e:
        logger.error(f"MongoDB connection failed: {e}")
        raise


async def close_mongo_connection():
    """Close MongoDB connection"""
    global client
    if client:
        client.close()
        logger.info("MongoDB connection closed")


async def create_indexes():
    """Create all necessary indexes for collections"""
    try:
        # Users collection indexes
        await db.users.create_index("phone", unique=True)
        await db.users.create_index("email", unique=True, sparse=True)
        await db.admins.create_index("email", unique=True)
        await db.admin_sessions.create_index("admin_id")
        # Menu items indexes
        await db.menu_items.create_index("slug", unique=True)
        await db.menu_items.create_index("category")
        await db.menu_items.create_index("is_available")
        
        # Carts index
        await db.carts.create_index("user_id", unique=True)
        
        # Orders indexes
        await db.orders.create_index("order_number", unique=True)
        await db.orders.create_index("user_id")
        await db.orders.create_index("status")
        await db.orders.create_index([("created_at", DESCENDING)])
        
        # Reservations indexes
        await db.reservations.create_index("phone")
        await db.reservations.create_index([("date", DESCENDING)])
        await db.reservations.create_index("status")
        
        # Payments index
        await db.payments.create_index("razorpay_order_id", unique=True)
        await db.payments.create_index("order_id")
        
        # Reviews indexes
        await db.reviews.create_index("item_id")
        await db.reviews.create_index("user_id")
        await db.reviews.create_index("order_id")
        await db.offers.create_index("is_active")
        await db.offers.create_index([("created_at", DESCENDING)])
        await db.notifications.create_index([("created_at", DESCENDING)])
        
        logger.info("Database indexes created successfully")
        
    except Exception as e:
        logger.warning(f"Index creation warning: {e}")


def get_database() -> AsyncIOMotorDatabase:
    """Dependency to get database instance"""
    if db is None:
        raise RuntimeError("Database not initialized")
    return db


# Collection helper properties
class Collections:
    @property
    def users(self):
        return db.users
    
    @property
    @property
    def menu_items(self):
        return db.menu_items
    
    @property
    def carts(self):
        return db.carts
    
    @property
    def orders(self):
        return db.orders
    
    @property
    def reservations(self):
        return db.reservations
    
    @property
    def payments(self):
        return db.payments
    
    @property
    def reviews(self):
        return db.reviews
    
    @property
    def admins(self):
        return db.admins
    
    @property
    def admin_sessions(self):
        return db.admin_sessions

    @property
    def offers(self):
        return db.offers

    @property
    def settings(self):
        return db.settings

    @property
    def notifications(self):
        return db.notifications

collections = Collections()
