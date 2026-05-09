"""
Admin authentication service
"""

from datetime import datetime, timedelta
from typing import Optional, Tuple
import logging
from bson import ObjectId
from jose import jwt

from config.settings import settings
from database import collections
from models.admin import Admin, AdminSession

logger = logging.getLogger(__name__)


class AdminService:
    
    def __init__(self):
        self.admin_jwt_secret = getattr(settings, 'ADMIN_JWT_SECRET', settings.JWT_SECRET)
    
    async def initialize_default_admin(self):
        """Create default admin if none exists"""
        try:
            existing_admin = await collections.admins.find_one({"email": settings.ADMIN_EMAIL})
            
            if not existing_admin:
                admin = Admin.create_admin(
                    email=settings.ADMIN_EMAIL,
                    password=settings.ADMIN_PASSWORD,
                    name="Super Admin",
                    role="super_admin"
                )
                
                await collections.admins.insert_one(admin.model_dump(by_alias=True))
                logger.info(f"Default admin created: {settings.ADMIN_EMAIL}")
                print(f"DEFAULT ADMIN: {settings.ADMIN_EMAIL} / {settings.ADMIN_PASSWORD}")
        except Exception as e:
            logger.error(f"Admin init error: {e}")
    
    async def login(self, email: str, password: str) -> Tuple[bool, str, Optional[dict]]:
        try:
            admin_doc = await collections.admins.find_one({"email": email})
            
            if not admin_doc:
                return False, "Invalid email or password", None
            
            admin = Admin(**admin_doc)
            
            if not admin.is_active:
                return False, "Account is deactivated", None
            
            if not Admin.verify_password(password, admin.salt, admin.password_hash):
                return False, "Invalid email or password", None
            
            token_data = {
                "sub": str(admin.id),
                "email": admin.email,
                "name": admin.name,
                "role": admin.role,
                "type": "admin"
            }
            
            access_token = self._create_token(token_data, hours=24)
            refresh_token = self._create_token(token_data, hours=168)
            
            await collections.admins.update_one(
                {"_id": admin.id},
                {"$set": {"last_login": datetime.utcnow()}}
            )
            
            return True, "Login successful", {
                "access_token": access_token,
                "refresh_token": refresh_token,
                "token_type": "bearer",
                "expires_in": 86400,
                "admin": {
                    "id": str(admin.id),
                    "email": admin.email,
                    "name": admin.name,
                    "role": admin.role
                }
            }
        except Exception as e:
            logger.error(f"Login error: {e}")
            return False, "Internal server error", None
    
    def _create_token(self, data: dict, hours: int = 24) -> str:
        expire = datetime.utcnow() + timedelta(hours=hours)
        data.update({"exp": expire})
        return jwt.encode(data, self.admin_jwt_secret, algorithm="HS256")
    
    def verify_admin_token(self, token: str) -> Optional[dict]:
        try:
            return jwt.decode(token, self.admin_jwt_secret, algorithms=["HS256"])
        except Exception:
            return None


admin_service = AdminService()
