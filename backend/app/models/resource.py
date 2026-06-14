import uuid

from sqlalchemy import Enum, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.enums import ResourceType


class Resource(Base):
    """A bookable facility: pitch, dressing room, meeting room, etc."""

    __tablename__ = "resources"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    type: Mapped[ResourceType] = mapped_column(
        Enum(ResourceType, name="resource_type"), nullable=False
    )
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    location: Mapped[str | None] = mapped_column(String(200), nullable=True)
