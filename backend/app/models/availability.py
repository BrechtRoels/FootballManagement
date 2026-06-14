import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import AvailabilityStatus


class Availability(Base):
    """A player's attendance status for an activity, plus selection by trainer."""

    __tablename__ = "availabilities"
    __table_args__ = (
        UniqueConstraint("activity_id", "user_id", name="uq_activity_user"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    activity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("activities.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[AvailabilityStatus] = mapped_column(
        Enum(AvailabilityStatus, name="availability_status"),
        default=AvailabilityStatus.unknown,
        nullable=False,
    )
    # Set by the trainer: is this player in the selected squad?
    selected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    activity: Mapped["Activity"] = relationship(  # noqa: F821
        back_populates="availabilities"
    )
    user: Mapped["User"] = relationship()  # noqa: F821
