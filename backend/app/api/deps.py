import uuid
from collections.abc import Callable

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models import User, UserRole
from app.repositories import users as user_repo

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

_credentials_exc = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
        if user_id is None:
            raise _credentials_exc
    except jwt.PyJWTError:
        raise _credentials_exc

    user = await user_repo.get_by_id(db, uuid.UUID(user_id))
    if user is None or not user.is_active:
        raise _credentials_exc
    return user


def require_roles(*roles: UserRole) -> Callable:
    """Dependency factory: allow only users whose role is in `roles`."""

    async def _dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return user

    return _dependency


# Convenience dependencies
require_admin = require_roles(UserRole.admin)
require_trainer = require_roles(UserRole.admin, UserRole.trainer)
