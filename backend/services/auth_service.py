"""
Authentication service - email/mobile/password and JWT handling
"""

from datetime import datetime
from typing import Optional, Tuple
import logging

from bson import ObjectId

from config.settings import settings
from database import collections
from models.user import User
from utils.security import validate_phone, create_access_token, create_refresh_token, decode_token

logger = logging.getLogger(__name__)


class AuthService:
    """Authentication service class"""

    async def register(self, name: str, email: str, phone: str, password: str) -> Tuple[bool, str, Optional[dict]]:
        """Create a user account and return JWT tokens."""
        try:
            phone = validate_phone(phone)
            email = email.lower().strip()
        except ValueError as e:
            return False, str(e), None

        existing = await collections.users.find_one({
            "$or": [
                {"email": email},
                {"phone": phone},
            ]
        })
        if existing:
            if existing.get("email") == email:
                return False, "Email already registered", None
            return False, "Mobile number already registered", None

        password_hash, salt = User.hash_password(password)
        user = User(
            name=name.strip(),
            email=email,
            phone=phone,
            password_hash=password_hash,
            salt=salt,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )

        result = await collections.users.insert_one(user.model_dump(by_alias=True))
        user.id = result.inserted_id
        return True, "Account created successfully", self._tokens_for_user(user)

    async def login(self, identifier: str, password: str) -> Tuple[bool, str, Optional[dict]]:
        """Authenticate by email or mobile number."""
        identifier = identifier.strip()
        if "@" in identifier:
            query = {"email": identifier.lower()}
        else:
            try:
                query = {"phone": validate_phone(identifier)}
            except ValueError:
                return False, "Invalid email/mobile or password", None
        user_doc = await collections.users.find_one(query)

        if not user_doc:
            return False, "Invalid email/mobile or password", None

        user = User(**user_doc)
        if not user.is_active:
            return False, "Account is deactivated", None

        if not User.verify_password(password, user.salt, user.password_hash):
            return False, "Invalid email/mobile or password", None

        await collections.users.update_one(
            {"_id": user.id},
            {"$set": {"updated_at": datetime.utcnow()}}
        )
        return True, "Login successful", self._tokens_for_user(user)

    async def refresh_token(self, refresh_token: str) -> Tuple[bool, str, Optional[dict]]:
        """Refresh access token using refresh token."""
        payload = decode_token(refresh_token)
        if not payload or payload.get("type") != "refresh":
            return False, "Invalid refresh token", None

        user_id = payload.get("sub")
        if not user_id:
            return False, "Invalid token payload", None

        user_doc = await collections.users.find_one({"_id": ObjectId(user_id)})
        if not user_doc:
            return False, "User not found", None

        return True, "Token refreshed", self._tokens_for_user(User(**user_doc))

    def _tokens_for_user(self, user: User) -> dict:
        token_data = {
            "sub": str(user.id),
            "phone": user.phone,
            "email": user.email,
            "is_admin": user.is_admin,
        }

        return {
            "access_token": create_access_token(token_data),
            "refresh_token": create_refresh_token(token_data),
            "token_type": "bearer",
            "expires_in": settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "user_id": str(user.id),
            "phone": user.phone,
            "email": user.email,
            "name": user.name,
            "is_admin": user.is_admin,
        }


auth_service = AuthService()
