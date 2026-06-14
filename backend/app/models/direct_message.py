import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class DirectMessage(Base):
    """A private 1-to-1 message between two users (e.g. coach <-> player)."""

    __tablename__ = "direct_messages"
    __table_args__ = (
        Index("ix_dm_pair", "sender_id", "recipient_id"),
        Index("ix_dm_recipient_unread", "recipient_id", "read_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    sender_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    recipient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    # Null until the recipient has read the message.
    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    sender: Mapped["User"] = relationship(foreign_keys=[sender_id])  # noqa: F821
    recipient: Mapped["User"] = relationship(foreign_keys=[recipient_id])  # noqa: F821
