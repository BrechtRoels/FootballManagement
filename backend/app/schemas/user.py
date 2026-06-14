import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import UserRole


class UserBase(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    phone: str | None = None


class UserCreate(UserBase):
    role: UserRole
    # Optional: if omitted, the API generates a temporary password and returns it once.
    password: str | None = Field(default=None, min_length=8, max_length=128)
    # Team assignment performed together with account creation. Required for
    # players (a player must belong to a team); optional for trainers.
    team_id: uuid.UUID | None = None
    shirt_number: int | None = None
    position: str | None = None


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = None
    is_active: bool | None = None
    role: UserRole | None = None


class UserOut(UserBase):
    model_config = ConfigDict(from_attributes=True)

    # Plain str on output: the value was validated on creation; re-validating
    # here would reject internal/reserved domains (e.g. *.local) on read.
    email: str
    id: uuid.UUID
    role: UserRole
    is_active: bool
    created_at: datetime


class UserCreatedOut(BaseModel):
    """Returned when an admin creates an account; includes the temp password once."""

    user: UserOut
    temporary_password: str | None = None
