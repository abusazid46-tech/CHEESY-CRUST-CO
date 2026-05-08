
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
    """Admin authentication and management service"""
    
    def __init__(self):
        self.admin_jwt_secret = getattr(settings, 'ADMIN_JWT_SECRET', settings.JWT_SECRET)
    
    async def initialize_default_admin(self):
        """Create default admin if none exists"""
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
            print(f"\n{'='*50}")
            print(f" DEFAULT ADMIN CREDENTIALS")
            print(f" Email: {settings.ADMIN_EMAIL}")
            print(f" Password: {settings.ADMIN_PASSWORD}")
            print(f"{'='*50}\n")
    
    async def login(self, email: str, password: str) -> Tuple[bool, str, Optional[dict]]:
        """Authenticate admin with email and password"""
        
        # Find admin
        admin_doc = await collections.admins.find_one({"email": email})
        
        if not admin_doc:
            return False, "Invalid email or password", None
        
        admin = Admin(**admin_doc)
        
        if not admin.is_active:
            return False, "Account is deactivated", None
        
        # Verify password
        if not Admin.verify_password(password, admin.salt, admin.password_hash):
            return False, "Invalid email or password", None
        
        # Generate JWT token
        token_data = {
            "sub": str(admin.id),
            "email": admin.email,
            "name": admin.name,
            "role": admin.role,
            "type": "admin"
        }
        
        access_token = self._create_admin_token(token_data)
        refresh_token = self._create_admin_refresh_token(token_data)
        
        # Update last login
        await collections.admins.update_one(
            {"_id": admin.id},
            {"$set": {"last_login": datetime.utcnow()}}
        )
        
        # Create session
        session = AdminSession(
            admin_id=admin.id,
            token=access_token,
            expires_at=datetime.utcnow() + timedelta(hours=24)
        )
        await collections.admin_sessions.insert_one(session.model_dump(by_alias=True))
        
        tokens = {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": 86400,  # 24 hours
            "admin": {
                "id": str(admin.id),
                "email": admin.email,
                "name": admin.name,
                "role": admin.role
            }
        }
        
        return True, "Login successful", tokens
    
    def _create_admin_token(self, data: dict) -> str:
        """Create admin JWT access token"""
        expire = datetime.utcnow() + timedelta(hours=24)
        data.update({"exp": expire, "type": "access"})
        return jwt.encode(data, self.admin_jwt_secret, algorithm="HS256")
    
    def _create_admin_refresh_token(self, data: dict) -> str:
        """Create admin JWT refresh token"""
        expire = datetime.utcnow() + timedelta(days=7)
        data.update({"exp": expire, "type": "refresh"})
        return jwt.encode(data, self.admin_jwt_secret, algorithm="HS256")
    
    def verify_admin_token(self, token: str) -> Optional[dict]:
        """Verify admin JWT token"""
        try:
            payload = jwt.decode(token, self.admin_jwt_secret, algorithms=["HS256"])
            if payload.get("type") != "access":
                return None
            return payload
        except Exception:
            return None
    
    async def get_admin_by_id(self, admin_id: str) -> Optional[dict]:
        """Get admin by ID"""
        try:
            admin = await collections.admins.find_one({"_id": ObjectId(admin_id)})
            if admin:
                admin["_id"] = str(admin["_id"])
                admin.pop("password_hash", None)
                admin.pop("salt", None)
            return admin
        except Exception:
            return None
    
    async def create_admin(self, email: str, password: str, name: str, role: str = "admin") -> Tuple[bool, str, Optional[dict]]:
        """Create new admin user"""
        
        # Check if email already exists
        existing = await collections.admins.find_one({"email": email})
        if existing:
            return False, "Email already exists", None
        
        admin = Admin.create_admin(
            email=email,
            password=password,
            name=name,
            role=role
        )
        
        result = await collections.admins.insert_one(admin.model_dump(by_alias=True))
        
        admin_dict = admin.model_dump(by_alias=True)
        admin_dict["_id"] = str(result.inserted_id)
        admin_dict.pop("password_hash", None)
        admin_dict.pop("salt", None)
        
        return True, "Admin created successfully", admin_dict
    
    async def update_password(self, admin_id: str, current_password: str, new_password: str) -> Tuple[bool, str]:
        """Update admin password"""
        admin_doc = await collections.admins.find_one({"_id": ObjectId(admin_id)})
        
        if not admin_doc:
            return False, "Admin not found"
        
        admin = Admin(**admin_doc)
        
        if not Admin.verify_password(current_password, admin.salt, admin.password_hash):
            return False, "Current password is incorrect"
        
        new_hash, new_salt = Admin.hash_password(new_password)
        
        await collections.admins.update_one(
            {"_id": ObjectId(admin_id)},
            {"$set": {
                "password_hash": new_hash,
                "salt": new_salt,
                "updated_at": datetime.utcnow()
            }}
        )
        
        return True, "Password updated successfully"
    
    async def logout(self, admin_id: str, token: str):
        """Invalidate admin session"""
        await collections.admin_sessions.update_one(
            {"admin_id": ObjectId(admin_id), "token": token},
            {"$set": {"is_active": False}}
        )


# Singleton instance
admin_service = AdminService()
