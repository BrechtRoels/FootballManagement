import uuid
from datetime import datetime

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Activity,
    ActivityStatus,
    ActivityType,
    HomeAway,
    Resource,
    ResourceBooking,
    ResourceType,
    TeamDressingRoom,
)
from app.schemas.activity import ConflictOut
from app.schemas.resource import ResourceOut


async def find_resource_conflicts(
    db: AsyncSession,
    *,
    resource_ids: list[uuid.UUID],
    start_time: datetime,
    end_time: datetime,
    exclude_activity_id: uuid.UUID | None = None,
) -> list[ConflictOut]:
    """Return bookings where any requested resource overlaps the given window.

    Two intervals [a_start, a_end) and [b_start, b_end) overlap iff
    a_start < b_end AND b_start < a_end.
    """
    if not resource_ids:
        return []

    stmt = (
        select(ResourceBooking)
        .join(Activity, ResourceBooking.activity_id == Activity.id)
        .options(
            selectinload(ResourceBooking.resource),
            selectinload(ResourceBooking.activity),
        )
        .where(
            ResourceBooking.resource_id.in_(resource_ids),
            Activity.status == ActivityStatus.scheduled,
            and_(
                Activity.start_time < end_time,
                start_time < Activity.end_time,
            ),
        )
    )
    if exclude_activity_id is not None:
        stmt = stmt.where(Activity.id != exclude_activity_id)

    result = await db.execute(stmt)
    bookings = result.scalars().all()

    conflicts: list[ConflictOut] = []
    for booking in bookings:
        conflicts.append(
            ConflictOut(
                resource=ResourceOut.model_validate(booking.resource),
                activity_id=booking.activity.id,
                activity_title=booking.activity.title,
                start_time=booking.activity.start_time,
                end_time=booking.activity.end_time,
            )
        )
    return conflicts


async def get_team_dressing_room_ids(
    db: AsyncSession, team_id: uuid.UUID
) -> list[uuid.UUID]:
    """Dressing rooms an admin has assigned to a team for its home activities."""
    result = await db.execute(
        select(TeamDressingRoom.resource_id).where(
            TeamDressingRoom.team_id == team_id
        )
    )
    return list(result.scalars().all())


async def _busy_resource_ids(
    db: AsyncSession,
    *,
    start_time: datetime,
    end_time: datetime,
    exclude_activity_id: uuid.UUID | None,
) -> set[uuid.UUID]:
    stmt = (
        select(ResourceBooking.resource_id)
        .join(Activity, ResourceBooking.activity_id == Activity.id)
        .where(
            Activity.status == ActivityStatus.scheduled,
            Activity.start_time < end_time,
            start_time < Activity.end_time,
        )
    )
    if exclude_activity_id is not None:
        stmt = stmt.where(Activity.id != exclude_activity_id)
    return set((await db.execute(stmt)).scalars().all())


async def _pick_opponent_room(
    db: AsyncSession,
    *,
    exclude_ids: set[uuid.UUID],
    start_time: datetime,
    end_time: datetime,
    exclude_activity_id: uuid.UUID | None,
) -> uuid.UUID | None:
    """Choose a free dressing room for the visiting team at a home match.

    Prefers rooms not assigned to any team (so a team's own assigned rooms keep
    priority), then any other free room. Returns None if none are available.
    """
    rooms = (
        await db.execute(
            select(Resource)
            .where(Resource.type == ResourceType.dressing_room)
            .order_by(Resource.name)
        )
    ).scalars().all()
    candidates = [r for r in rooms if r.id not in exclude_ids]
    if not candidates:
        return None

    busy = await _busy_resource_ids(
        db,
        start_time=start_time,
        end_time=end_time,
        exclude_activity_id=exclude_activity_id,
    )
    free = [r for r in candidates if r.id not in busy]
    if not free:
        return None

    assigned = set(
        (await db.execute(select(TeamDressingRoom.resource_id))).scalars().all()
    )
    unassigned_free = [r for r in free if r.id not in assigned]
    return (unassigned_free or free)[0].id


async def resolve_activity_resources(
    db: AsyncSession,
    *,
    team_id: uuid.UUID,
    activity_type: ActivityType,
    home_away: HomeAway | None,
    start_time: datetime,
    end_time: datetime,
    selected_resource_ids: list[uuid.UUID],
    exclude_activity_id: uuid.UUID | None = None,
) -> list[uuid.UUID]:
    """Final resource bookings for an activity.

    Trainer-selected resources are kept EXCEPT dressing rooms (those are
    automatic). For a HOME training/match the team's assigned dressing rooms are
    added; for a HOME match an extra free room is reserved for the opponent.
    """
    final: list[uuid.UUID] = []
    if selected_resource_ids:
        rows = await db.execute(
            select(Resource).where(Resource.id.in_(selected_resource_ids))
        )
        by_id = {r.id: r for r in rows.scalars().all()}
        for rid in dict.fromkeys(selected_resource_ids):  # de-dupe, keep order
            res = by_id.get(rid)
            if res and res.type != ResourceType.dressing_room:
                final.append(rid)

    is_home = home_away == HomeAway.home
    if is_home and activity_type in (ActivityType.training, ActivityType.match):
        for rid in await get_team_dressing_room_ids(db, team_id):
            if rid not in final:
                final.append(rid)
        if activity_type == ActivityType.match:
            opponent = await _pick_opponent_room(
                db,
                exclude_ids=set(final),
                start_time=start_time,
                end_time=end_time,
                exclude_activity_id=exclude_activity_id,
            )
            if opponent and opponent not in final:
                final.append(opponent)
    return final


async def derive_location_from_resources(
    db: AsyncSession, resource_ids: list[uuid.UUID]
) -> str:
    """Build a location string from the distinct addresses of some resources."""
    if not resource_ids:
        return ""
    rows = await db.execute(
        select(Resource).where(Resource.id.in_(resource_ids))
    )
    seen: list[str] = []
    for res in rows.scalars().all():
        loc = (res.location or "").strip()
        if loc and loc not in seen:
            seen.append(loc)
    return " · ".join(seen)
