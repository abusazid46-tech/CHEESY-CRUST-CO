"""
Application settings and configuration
"""

from typing import List, Optional
from pydantic_settings import BaseSettings
from pydantic import Field, field_validator
import json


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # Application
    APP_NAME: str = "Cheesy Crust Co. API"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    API_PREFIX: str = "/api/v1"
    DEV_AUTH_BYPASS: bool = False
    
    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    CORS_ORIGINS: List[str] = [
        "http://localhost:5500",
        "http://localhost:8000",
        "http://127.0.0.1:5500",
        "http://127.0.0.1:8000",
        "https://cheesy-crust-co-7w5c.vercel.app",
        "https://cheesy-crust-api.onrender.com",
    ]
    
    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return [origin.strip() for origin in v.split(",")]
        return v
    
    # MongoDB
    MONGODB_URI: str = Field(..., env="MONGODB_URI")
    MONGODB_DB_NAME: str = "cheesy_crust"
    MONGODB_MAX_POOL_SIZE: int = 10
    MONGODB_MIN_POOL_SIZE: int = 2
    
    # JWT Authentication
    JWT_SECRET: str = Field(..., env="JWT_SECRET")
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    
    # OTP Settings
    OTP_LENGTH: int = 6
    OTP_EXPIRE_MINUTES: int = 5
    OTP_RESEND_COOLDOWN_SECONDS: int = 60
    OTP_DEMO_MODE: bool = False
    
    # Twilio SMS OTP
    TWILIO_ACCOUNT_SID: Optional[str] = None
    TWILIO_AUTH_TOKEN: Optional[str] = None
    TWILIO_VERIFY_SERVICE_SID: Optional[str] = None
    TWILIO_PHONE_NUMBER: Optional[str] = None
    
    # Razorpay Payment
    RAZORPAY_KEY_ID: str = Field(..., env="RAZORPAY_KEY_ID")
    RAZORPAY_KEY_SECRET: str = Field(..., env="RAZORPAY_KEY_SECRET")
    RAZORPAY_WEBHOOK_SECRET: Optional[str] = None
    
    # Restaurant Settings
    RESTAURANT_NAME: str = "Cheesy Crust Co."
    RESTAURANT_PHONE: str = "+917002012345"
    RESTAURANT_EMAIL: str = "dine@cheesycrust.co"
    RESTAURANT_ADDRESS: str = "Rangirkhari Main Road, Near SBI, Silchar, Assam - 788005"
    DELIVERY_FEE: int = 40
    DELIVERY_RADIUS_KM: int = 10
    MIN_ORDER_AMOUNT: int = 100
    FREE_DELIVERY_THRESHOLD: int = 500
    
    # Reservation Settings
    MAX_GUESTS_PER_TABLE: int = 8
    RESERVATION_SLOT_INTERVAL_MINUTES: int = 30
    RESERVATION_ADVANCE_DAYS: int = 30
    
    # Admin Authentication
    ADMIN_EMAIL: str = "admin@cheesycrust.co"
    ADMIN_PASSWORD: str = "Admin@123456"
    ADMIN_JWT_SECRET: str = Field(default="admin_secret_key_change_in_production", env="ADMIN_JWT_SECRET")
    ADMIN_PHONE_NUMBERS: List[str] = ["+917002012345"]
    
    @field_validator("ADMIN_PHONE_NUMBERS", mode="before")
    @classmethod
    def parse_admin_phones(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return [phone.strip() for phone in v.split(",")]
        return v
    
    ADMIN_EMAILS: List[str] = ["admin@cheesycrust.co"]
    
    # Logging
    LOG_LEVEL: str = "INFO"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
        extra = "ignore"


# Global settings instance
settings = Settings()
