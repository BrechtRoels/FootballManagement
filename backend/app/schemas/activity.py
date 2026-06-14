import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import (
    ActivityStatus,
    ActivityType,
    AvailabilityStatus,
    HomeAway,
)
from app.schemas.resource import ResourceOut
from app.schemas.user import UserOut


class ActivityBase(BaseModel):
    type: ActivityType
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    start_time: datetime
    end_time: datetime
    location_text: str | None = None
    opponent: str | None = None
    home_away: HomeAway | None = None

    @model_validator(mode="after")
    def _check_times(self):
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class ActivityCreate(ActivityBase):
    team_id: uuid.UUID
    resource_ids: list[uuid.UUID] = []


class ActivityUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    location_text: str | None = None
    opponent: str | None = None
    home_away: HomeAway | None = None
    resource_ids: list[uuid.UUID] | None = None


class ActivityOut(ActivityBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    team_id: uuid.UUID
    team_name: str | None = None
    status: ActivityStatus
    created_at: datetime
    resources: list[ResourceOut] = []


class AvailabilityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    activity_id: uuid.UUID
    status: AvailabilityStatus
    selected: bool
    note: str | None
    updated_at: datetime
    user: UserOut


class ActivityDetailOut(ActivityOut):
    availabilities: list[AvailabilityOut] = []


class SetAvailabilityRequest(BaseModel):
    status: AvailabilityStatus
    note: str | None = None


class SetSelectionRequest(BaseModel):
    user_id: uuid.UUID
    selected: bool


class SquadEntry(BaseModel):
    """A selectable player for an activity: own-team player or a call-up."""

    user: UserOut
    team_id: uuid.UUID
    team_name: str
    is_callup: bool
    shirt_number: int | None = None
    position: str | None = None
    status: AvailabilityStatus = AvailabilityStatus.unknown
    selected: bool = False
    note: str | None = None


class ConflictOut(BaseModel):
    resource: ResourceOut
    activity_id: uuid.UUID
    activity_title: str
    start_time: datetime
    end_time: datetime
