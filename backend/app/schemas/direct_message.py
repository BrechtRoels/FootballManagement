import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.user import UserOut


class DirectMessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class DirectMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    sender_id: uuid.UUID
    recipient_id: uuid.UUID
    body: str
    created_at: datetime
    read_at: datetime | None


class ContactOut(BaseModel):
    """A person the user can hold a direct conversation with."""

    user: UserOut
    last_message: str | None = None
    last_message_at: datetime | None = None
    last_from_me: bool = False
    unread_count: int = 0
