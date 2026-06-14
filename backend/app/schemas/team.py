import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import MembershipRole
from app.schemas.resource import ResourceOut
from app.schemas.user import UserOut


class TeamBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    season: str | None = None
    category: str | None = None


class TeamCreate(TeamBase):
    pass


class TeamUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    season: str | None = None
    category: str | None = None


class TeamOut(TeamBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime


class MembershipCreate(BaseModel):
    user_id: uuid.UUID
    role: MembershipRole
    shirt_number: int | None = None
    position: str | None = None


class MembershipUpdate(BaseModel):
    role: MembershipRole | None = None
    shirt_number: int | None = None
    position: str | None = None


class MembershipOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    team_id: uuid.UUID
    role: MembershipRole
    shirt_number: int | None
    position: str | None
    joined_at: datetime
    user: UserOut


class FeederCreate(BaseModel):
    feeder_team_id: uuid.UUID


class DressingRoomAssign(BaseModel):
    """Replace a team's set of assigned home dressing rooms."""

    resource_ids: list[uuid.UUID] = []


class TeamDetailOut(TeamOut):
    memberships: list[MembershipOut] = []
    # Lower teams this team may call up players from (for matches).
    feeders: list[TeamOut] = []
    # Dressing rooms reserved automatically for this team's home activities.
    dressing_rooms: list[ResourceOut] = []
