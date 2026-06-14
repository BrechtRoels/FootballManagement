import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import ActivityStatus, ActivityType, HomeAway


class Activity(Base):
    """A scheduled game, training session, meeting or club event."""

    __tablename__ = "activities"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[ActivityType] = mapped_column(
        Enum(ActivityType, name="activity_type"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    end_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    location_text: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Match-specific
    opponent: Mapped[str | None] = mapped_column(String(120), nullable=True)
    home_away: Mapped[HomeAway | None] = mapped_column(
        Enum(HomeAway, name="home_away"), nullable=True
    )

    status: Mapped[ActivityStatus] = mapped_column(
        Enum(ActivityStatus, name="activity_status"),
        default=ActivityStatus.scheduled,
        nullable=False,
    )
    # Non-null when this activity is one occurrence of a recurring series; the
    # same UUID is shared across all sibling occurrences. NULL = standalone.
    series_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    team: Mapped["Team"] = relationship(back_populates="activities")  # noqa: F821
    bookings: Mapped[list["ResourceBooking"]] = relationship(
        back_populates="activity", cascade="all, delete-orphan"
    )
    availabilities: Mapped[list["Availability"]] = relationship(  # noqa: F821
        back_populates="activity", cascade="all, delete-orphan"
    )


class ResourceBooking(Base):
    """Reservation of a resource (pitch/room) for a specific activity."""

    __tablename__ = "resource_bookings"
    __table_args__ = (
        UniqueConstraint("activity_id", "resource_id", name="uq_activity_resource"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    activity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("activities.id", ondelete="CASCADE"),
        nullable=False,
    )
    resource_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("resources.id", ondelete="CASCADE"),
        nullable=False,
    )

    activity: Mapped["Activity"] = relationship(back_populates="bookings")
    resource: Mapped["Resource"] = relationship()  # noqa: F821
