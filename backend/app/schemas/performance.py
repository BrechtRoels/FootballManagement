import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import ActivityType
from app.schemas.user import UserOut


class RatingInput(BaseModel):
    """One player's rating for an activity. Both ratings optional (partial)."""

    user_id: uuid.UUID
    performance_rating: int | None = Field(default=None, ge=1, le=5)
    mentality_rating: int | None = Field(default=None, ge=1, le=5)
    note: str | None = Field(default=None, max_length=255)


class RateSquadRequest(BaseModel):
    """Bulk upsert: rate any subset of the squad in one save."""

    ratings: list[RatingInput] = []


class PerformanceEntryOut(BaseModel):
    """One roster row with its current rating (used to prefill the rate screen)."""

    model_config = ConfigDict(from_attributes=True)

    user: UserOut
    activity_id: uuid.UUID
    performance_rating: int | None = None
    mentality_rating: int | None = None
    note: str | None = None
    rated: bool = False
    updated_at: datetime | None = None


class PerformancePoint(BaseModel):
    """A single activity in a player's rating history (for trend sparklines)."""

    activity_id: uuid.UUID
    activity_type: ActivityType
    title: str
    date: datetime
    performance_rating: int | None = None
    mentality_rating: int | None = None


class PlayerPerformanceOut(BaseModel):
    """Aggregated performance profile for one player (trainer/admin view)."""

    user: UserOut
    rated_count: int = 0
    avg_performance: float | None = None
    avg_mentality: float | None = None
    # Free attendance signals derived from existing availability data.
    appearances: int = 0
    availability_pct: float | None = None
    selection_rate: float | None = None
    last_rated_at: datetime | None = None
    history: list[PerformancePoint] = []


class TeamPerformanceRow(BaseModel):
    """One player's lean summary in a team performance table."""

    user: UserOut
    rated_count: int = 0
    avg_performance: float | None = None
    avg_mentality: float | None = None
    appearances: int = 0
    availability_pct: float | None = None
