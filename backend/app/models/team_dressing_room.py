import uuid

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class TeamDressingRoom(Base):
    """A dressing room assigned to a team for its HOME activities.

    A team may have more than one (e.g. two rooms). These rooms are reserved
    automatically for the team's home trainings/matches — trainers never pick
    dressing rooms. For a home match an extra free room is reserved for the
    opponent, and a team's assigned rooms take priority over other teams'.
    """

    __tablename__ = "team_dressing_rooms"
    __table_args__ = (
        UniqueConstraint("team_id", "resource_id", name="uq_team_dressing_room"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False
    )
    resource_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("resources.id", ondelete="CASCADE"),
        nullable=False,
    )
