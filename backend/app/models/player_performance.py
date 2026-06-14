import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class PlayerPerformance(Base):
    """A trainer's rating of one player for one activity.

    One row per (activity, player). Holds two optional 1-5 star ratings set by
    the trainer (performance and mentality) plus an optional note. Players never
    set or see these. Follows the Availability precedent (unique per
    activity+user, CASCADE FKs, updated_at).
    """

    __tablename__ = "player_performances"
    __table_args__ = (
        UniqueConstraint("activity_id", "user_id", name="uq_perf_activity_user"),
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
    # Trainer-set ratings, 1-5 (range enforced in the Pydantic schema).
    performance_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mentality_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Which trainer left the rating (optional, for multi-trainer teams).
    rated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user: Mapped["User"] = relationship(foreign_keys=[user_id])  # noqa: F821
