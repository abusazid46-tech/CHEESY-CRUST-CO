"""
Cheesy Crust Co. - FastAPI Backend
Main application entry point
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import logging

from routes import (
    auth_router,
    menu_router,
    cart_router,
    order_router,
    payment_router,
    reservation_router,
    user_router,
    admin_router,
    admin_auth_router
)
from config.settings import settings
from database import connect_to_mongo, close_mongo_connection

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle startup and shutdown events"""
    # Startup
    logger.info("Starting Cheesy Crust Co. API...")
    await connect_to_mongo()
    
    # Initialize default admin
    from services.admin_service import admin_service
    await admin_service.initialize_default_admin()
    
    logger.info("Connected to MongoDB")
    yield
    # Shutdown
    logger.info("Shutting down...")
    await close_mongo_connection()
    logger.info("Disconnected from MongoDB")


# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Premium Restaurant API for Cheesy Crust Co.",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan
)

# CORS configuration - MUST be before routes
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# ADD THIS: Handle OPTIONS preflight requests
@app.options("/{rest_of_path:path}")
async def preflight_handler(request: Request, rest_of_path: str):
    """Handle CORS preflight requests"""
    return JSONResponse(
        content={"message": "OK"},
        headers={
            "Access-Control-Allow-Origin": request.headers.get("origin", "*"),
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Credentials": "true",
        }
    )

# Include routers
app.include_router(auth_router, prefix=f"{settings.API_PREFIX}/auth", tags=["Authentication"])
app.include_router(user_router, prefix=f"{settings.API_PREFIX}/user", tags=["User"])
app.include_router(menu_router, prefix=f"{settings.API_PREFIX}/menu", tags=["Menu"])
app.include_router(cart_router, prefix=f"{settings.API_PREFIX}/cart", tags=["Cart"])
app.include_router(order_router, prefix=f"{settings.API_PREFIX}/orders", tags=["Orders"])
app.include_router(payment_router, prefix=f"{settings.API_PREFIX}/payment", tags=["Payment"])
app.include_router(reservation_router, prefix=f"{settings.API_PREFIX}/reservation", tags=["Reservation"])
app.include_router(admin_router, prefix=f"{settings.API_PREFIX}/admin", tags=["Admin"])
app.include_router(admin_auth_router, prefix=f"{settings.API_PREFIX}", tags=["Admin Auth"])


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "online",
        "environment": settings.ENVIRONMENT
    }


@app.get("/health")
async def health_check():
    """Detailed health check"""
    from database import db
    try:
        await db.command("ping")
        db_status = "connected"
    except Exception:
        db_status = "disconnected"
    
    return {
        "status": "healthy",
        "database": db_status,
        "environment": settings.ENVIRONMENT
    }
