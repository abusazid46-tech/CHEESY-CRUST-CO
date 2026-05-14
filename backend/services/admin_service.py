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
        payload = {**data, "exp": expire}
        return jwt.encode(payload, self.admin_jwt_secret, algorithm="HS256")
    
    def verify_admin_token(self, token: str) -> Optional[dict]:
        try:
            return jwt.decode(token, self.admin_jwt_secret, algorithms=["HS256"])
        except Exception:
            return None

    async def refresh_token(self, refresh_token: str) -> Tuple[bool, str, Optional[dict]]:
        payload = self.verify_admin_token(refresh_token)
        if not payload or payload.get("type") != "admin":
            return False, "Invalid refresh token", None

        admin = await self.get_admin_by_id(payload.get("sub"))
        if not admin or not admin.get("is_active", False):
            return False, "Admin not found or inactive", None

        token_data = {
            "sub": str(admin["_id"]),
            "email": admin["email"],
            "name": admin["name"],
            "role": admin.get("role", "admin"),
            "type": "admin"
        }
        return True, "Token refreshed", {
            "access_token": self._create_token(token_data, hours=24),
            "refresh_token": self._create_token(token_data, hours=168),
            "token_type": "bearer",
            "expires_in": 86400,
            "admin": self.public_admin(admin)
        }

    async def get_admin_by_id(self, admin_id: str) -> Optional[dict]:
        try:
            admin = await collections.admins.find_one({"_id": ObjectId(admin_id)})
            if admin:
                admin["_id"] = str(admin["_id"])
            return admin
        except Exception:
            return None

    async def create_admin(self, email: str, password: str, name: str, role: str = "admin") -> Tuple[bool, str, Optional[dict]]:
        existing = await collections.admins.find_one({"email": email.lower().strip()})
        if existing:
            return False, "Admin email already exists", None
        admin = Admin.create_admin(
            email=email.lower().strip(),
            password=password,
            name=name.strip(),
            role=role
        )
        await collections.admins.insert_one(admin.model_dump(by_alias=True))
        return True, "Admin created", self.public_admin(admin.model_dump(by_alias=True))

    async def update_admin_profile(self, admin_id: str, update_data: dict) -> Optional[dict]:
        allowed = {key: value for key, value in update_data.items() if key in {"name", "email"} and value}
        if not allowed:
            return await self.get_admin_by_id(admin_id)
        allowed["updated_at"] = datetime.utcnow()
        if "email" in allowed:
            allowed["email"] = allowed["email"].lower().strip()
        try:
            result = await collections.admins.find_one_and_update(
                {"_id": ObjectId(admin_id)},
                {"$set": allowed},
                return_document=True
            )
            if result:
                result["_id"] = str(result["_id"])
            return result
        except Exception as e:
            logger.error(f"Profile update error: {e}")
            return None

    async def change_password(self, admin_id: str, current_password: str, new_password: str) -> Tuple[bool, str]:
        admin_doc = await collections.admins.find_one({"_id": ObjectId(admin_id)})
        if not admin_doc:
            return False, "Admin not found"
        admin = Admin(**admin_doc)
        if not Admin.verify_password(current_password, admin.salt, admin.password_hash):
            return False, "Current password is incorrect"
        password_hash, salt = Admin.hash_password(new_password)
        await collections.admins.update_one(
            {"_id": admin.id},
            {"$set": {"password_hash": password_hash, "salt": salt, "updated_at": datetime.utcnow()}}
        )
        return True, "Password changed successfully"

    async def list_admins(self) -> list:
        admins = await collections.admins.find().sort("created_at", -1).to_list(length=100)
        return [self.public_admin(admin) for admin in admins]

    def public_admin(self, admin: dict) -> dict:
        admin_id = admin.get("_id") or admin.get("id")
        return {
            "id": str(admin_id),
            "email": admin.get("email"),
            "name": admin.get("name"),
            "role": admin.get("role", "admin"),
            "is_active": admin.get("is_active", True),
            "last_login": admin.get("last_login"),
            "created_at": admin.get("created_at")
        }


admin_service = AdminService()
