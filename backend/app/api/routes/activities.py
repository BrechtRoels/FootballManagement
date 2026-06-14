import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import (
    Activity,
    ActivityStatus,
    ActivityType,
    Availability,
    AvailabilityStatus,
    HomeAway,
    NotificationType,
    Resource,
    ResourceBooking,
    User,
    UserRole,
)
from app.schemas.activity import (
    ActivityCreate,
    ActivityDetailOut,
    ActivityOut,
    ActivityUpdate,
    AvailabilityOut,
    ConflictOut,
    SetAvailabilityRequest,
    SetSelectionRequest,
    SquadEntry,
)
from app.schemas.resource import ResourceOut
from app.schemas.user import UserOut
from app.services.access import (
    can_access_activity,
    can_manage_team,
    get_user_team_ids,
    is_team_member,
)
from app.services.notifications import ensure_availability_rows, notify_team
from app.services.roster import candidate_memberships as _candidate_memberships
from app.services.scheduling import (
    derive_location_from_resources,
    find_resource_conflicts,
    resolve_activity_resources,
)


async def _home_location(
    db: AsyncSession,
    *,
    activity_type: ActivityType,
    home_away: HomeAway | None,
    resource_ids: list[uuid.UUID],
    fallback: str | None,
) -> str | None:
    """A home training/match takes its address from the reserved facilities."""
    if home_away == HomeAway.home and activity_type in (
        ActivityType.training,
        ActivityType.match,
    ):
        derived = await derive_location_from_resources(db, resource_ids)
        if derived:
            return derived
    return fallback

router = APIRouter(prefix="/activities", tags=["activities"])


def _to_out(activity: Activity) -> ActivityOut:
    """Serialize an Activity (with loaded bookings) into ActivityOut."""
    data = ActivityOut.model_validate(activity)
    data.resources = [
        ResourceOut.model_validate(b.resource) for b in activity.bookings
    ]
    data.team_name = activity.team.name if activity.team else None
    return data


async def _load_activity(
    db: AsyncSession, activity_id: uuid.UUID, *, with_availability: bool = False
) -> Activity | None:
    stmt = (
        select(Activity)
        .where(Activity.id == activity_id)
        .options(
            selectinload(Activity.bookings).selectinload(ResourceBooking.resource),
            selectinload(Activity.team),
        )
    )
    if with_availability:
        stmt = stmt.options(
            selectinload(Activity.availabilities).selectinload(Availability.user)
        )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def _sync_bookings(
    db: AsyncSession, activity: Activity, resource_ids: list[uuid.UUID]
) -> None:
    """Replace an activity's resource bookings with the given set.

    Uses an explicit DELETE rather than iterating activity.bookings so we never
    trigger a lazy relationship load outside the async greenlet context.
    """
    await db.execute(
        delete(ResourceBooking).where(ResourceBooking.activity_id == activity.id)
    )
    for rid in dict.fromkeys(resource_ids):  # de-dupe, preserve order
        resource = await db.get(Resource, rid)
        if not resource:
            raise HTTPException(status_code=404, detail=f"Resource {rid} not found")
        db.add(ResourceBooking(activity_id=activity.id, resource_id=rid))


@router.get("/{activity_id}/squad", response_model=list[SquadEntry])
async def get_squad(
    activity_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Full selectable roster for an activity (own players + match call-ups),
    merged with each player's availability/selection."""
    activity = await db.get(Activity, activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if not await can_access_activity(db, current_user, activity):
        raise HTTPException(status_code=403, detail="Cannot view this activity")

    av_rows = await db.execute(
        select(Availability).where(Availability.activity_id == activity_id)
    )
    av_by_user = {a.user_id: a for a in av_rows.scalars().all()}

    squad: list[SquadEntry] = []
    seen: set[uuid.UUID] = set()
    for membership, team, is_callup in await _candidate_memberships(db, activity):
        if membership.user_id in seen:
            continue
        seen.add(membership.user_id)
        av = av_by_user.get(membership.user_id)
        squad.append(
            SquadEntry(
                user=UserOut.model_validate(membership.user),
                team_id=membership.team_id,
                team_name=team.name if team else "",
                is_callup=is_callup,
                shirt_number=membership.shirt_number,
                position=membership.position,
                status=av.status if av else AvailabilityStatus.unknown,
                selected=av.selected if av else False,
                note=av.note if av else None,
            )
        )
    return squad


@router.get("", response_model=list[ActivityOut])
async def list_activities(
    team_id: uuid.UUID | None = Query(default=None),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Activity)
        .options(
            selectinload(Activity.bookings).selectinload(ResourceBooking.resource),
            selectinload(Activity.team),
        )
        .order_by(Activity.start_time)
    )

    if current_user.role == UserRole.admin:
        if team_id:
            stmt = stmt.where(Activity.team_id == team_id)
    else:
        allowed = await get_user_team_ids(db, current_user)
        # Activities where this user was called up (they have an availability row).
        callup_subq = select(Availability.activity_id).where(
            Availability.user_id == current_user.id
        )
        if team_id:
            if team_id not in allowed:
                raise HTTPException(status_code=403, detail="Not a member of this team")
            stmt = stmt.where(Activity.team_id == team_id)
        else:
            conds = [Activity.id.in_(callup_subq)]
            if allowed:
                conds.append(Activity.team_id.in_(allowed))
            stmt = stmt.where(or_(*conds))

    if date_from:
        stmt = stmt.where(Activity.start_time >= date_from)
    if date_to:
        stmt = stmt.where(Activity.start_time <= date_to)

    result = await db.execute(stmt)
    return [_to_out(a) for a in result.scalars().all()]


@router.post("/check-conflicts", response_model=list[ConflictOut])
async def check_conflicts(
    payload: ActivityCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Preview resource conflicts before creating an activity."""
    if not await can_manage_team(db, current_user, payload.team_id):
        raise HTTPException(status_code=403, detail="Cannot schedule for this team")
    return await find_resource_conflicts(
        db,
        resource_ids=payload.resource_ids,
        start_time=payload.start_time,
        end_time=payload.end_time,
    )


@router.post("", response_model=ActivityDetailOut, status_code=status.HTTP_201_CREATED)
async def create_activity(
    payload: ActivityCreate,
    force: bool = Query(default=False, description="Create despite resource conflicts"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not await can_manage_team(db, current_user, payload.team_id):
        raise HTTPException(status_code=403, detail="Cannot schedule for this team")

    # Dressing rooms are added automatically (team's assigned rooms + an opponent
    # room for home matches); trainers only pick the pitch.
    resolved_ids = await resolve_activity_resources(
        db,
        team_id=payload.team_id,
        activity_type=payload.type,
        home_away=payload.home_away,
        start_time=payload.start_time,
        end_time=payload.end_time,
        selected_resource_ids=payload.resource_ids,
    )

    conflicts = await find_resource_conflicts(
        db,
        resource_ids=resolved_ids,
        start_time=payload.start_time,
        end_time=payload.end_time,
    )
    if conflicts and not force:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "One or more resources are already booked for this time",
                "conflicts": [c.model_dump(mode="json") for c in conflicts],
            },
        )

    location_text = await _home_location(
        db,
        activity_type=payload.type,
        home_away=payload.home_away,
        resource_ids=resolved_ids,
        fallback=payload.location_text,
    )

    activity = Activity(
        team_id=payload.team_id,
        type=payload.type,
        title=payload.title,
        description=payload.description,
        start_time=payload.start_time,
        end_time=payload.end_time,
        location_text=location_text,
        opponent=payload.opponent,
        home_away=payload.home_away,
        created_by_id=current_user.id,
    )
    db.add(activity)
    await db.flush()

    await _sync_bookings(db, activity, resolved_ids)
    await ensure_availability_rows(db, activity)
    await notify_team(
        db,
        team_id=activity.team_id,
        type=NotificationType.activity_created,
        title=f"New {activity.type.value}: {activity.title}",
        body=activity.start_time.strftime("%a %d %b %Y, %H:%M"),
        related_activity_id=activity.id,
        exclude_user_id=current_user.id,
    )

    await db.flush()
    loaded = await _load_activity(db, activity.id, with_availability=True)
    return _detail_out(loaded)


def _detail_out(activity: Activity) -> ActivityDetailOut:
    out = ActivityDetailOut.model_validate(activity)
    out.team_name = activity.team.name if activity.team else None
    out.resources = [ResourceOut.model_validate(b.resource) for b in activity.bookings]
    out.availabilities = [
        AvailabilityOut.model_validate(a) for a in activity.availabilities
    ]
    return out


@router.get("/{activity_id}", response_model=ActivityDetailOut)
async def get_activity(
    activity_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    activity = await _load_activity(db, activity_id, with_availability=True)
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if not await can_access_activity(db, current_user, activity):
        raise HTTPException(status_code=403, detail="Cannot view this activity")
    return _detail_out(activity)


@router.patch("/{activity_id}", response_model=ActivityDetailOut)
async def update_activity(
    activity_id: uuid.UUID,
    payload: ActivityUpdate,
    force: bool = Query(default=False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    activity = await _load_activity(db, activity_id, with_availability=True)
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if not await can_manage_team(db, current_user, activity.team_id):
        raise HTTPException(status_code=403, detail="Cannot manage this team")

    data = payload.model_dump(exclude_unset=True)
    resource_ids = data.pop("resource_ids", None)

    new_start = data.get("start_time", activity.start_time)
    new_end = data.get("end_time", activity.end_time)
    if new_end <= new_start:
        raise HTTPException(status_code=400, detail="end_time must be after start_time")
    new_home_away = data.get("home_away", activity.home_away)

    # Re-resolve the full booking set: the trainer's picks (pitch) keep, dressing
    # rooms are re-derived from the team assignment / opponent automatically.
    selected = (
        resource_ids
        if resource_ids is not None
        else [b.resource_id for b in activity.bookings]
    )
    resolved_ids = await resolve_activity_resources(
        db,
        team_id=activity.team_id,
        activity_type=activity.type,
        home_away=new_home_away,
        start_time=new_start,
        end_time=new_end,
        selected_resource_ids=selected,
        exclude_activity_id=activity.id,
    )
    conflicts = await find_resource_conflicts(
        db,
        resource_ids=resolved_ids,
        start_time=new_start,
        end_time=new_end,
        exclude_activity_id=activity.id,
    )
    if conflicts and not force:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Resource conflict",
                "conflicts": [c.model_dump(mode="json") for c in conflicts],
            },
        )

    for field, value in data.items():
        setattr(activity, field, value)
    activity.location_text = await _home_location(
        db,
        activity_type=activity.type,
        home_away=new_home_away,
        resource_ids=resolved_ids,
        fallback=activity.location_text,
    )
    await _sync_bookings(db, activity, resolved_ids)

    await notify_team(
        db,
        team_id=activity.team_id,
        type=NotificationType.activity_updated,
        title=f"Updated: {activity.title}",
        body=activity.start_time.strftime("%a %d %b %Y, %H:%M"),
        related_activity_id=activity.id,
        exclude_user_id=current_user.id,
    )

    await db.flush()
    loaded = await _load_activity(db, activity.id, with_availability=True)
    return _detail_out(loaded)


@router.post("/{activity_id}/cancel", response_model=ActivityDetailOut)
async def cancel_activity(
    activity_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    activity = await _load_activity(db, activity_id, with_availability=True)
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if not await can_manage_team(db, current_user, activity.team_id):
        raise HTTPException(status_code=403, detail="Cannot manage this team")

    activity.status = ActivityStatus.cancelled
    await notify_team(
        db,
        team_id=activity.team_id,
        type=NotificationType.activity_cancelled,
        title=f"Cancelled: {activity.title}",
        body=activity.start_time.strftime("%a %d %b %Y, %H:%M"),
        related_activity_id=activity.id,
        exclude_user_id=current_user.id,
    )
    await db.flush()
    loaded = await _load_activity(db, activity.id, with_availability=True)
    return _detail_out(loaded)


@router.delete("/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_activity(
    activity_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    activity = await db.get(Activity, activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if not await can_manage_team(db, current_user, activity.team_id):
        raise HTTPException(status_code=403, detail="Cannot manage this team")
    await db.delete(activity)


# ---- Availability (player marks themselves) ----


@router.put("/{activity_id}/availability", response_model=AvailabilityOut)
async def set_availability(
    activity_id: uuid.UUID,
    payload: SetAvailabilityRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    activity = await db.get(Activity, activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if not await can_access_activity(db, current_user, activity):
        raise HTTPException(status_code=403, detail="Cannot respond to this activity")

    result = await db.execute(
        select(Availability).where(
            Availability.activity_id == activity_id,
            Availability.user_id == current_user.id,
        )
    )
    availability = result.scalar_one_or_none()
    if not availability:
        availability = Availability(activity_id=activity_id, user_id=current_user.id)
        db.add(availability)
    availability.status = payload.status
    availability.note = payload.note
    await db.flush()
    result = await db.execute(
        select(Availability)
        .where(Availability.id == availability.id)
        .options(selectinload(Availability.user))
    )
    return result.scalar_one()


# ---- Selection (trainer picks the squad) ----


@router.put("/{activity_id}/selection", response_model=AvailabilityOut)
async def set_selection(
    activity_id: uuid.UUID,
    payload: SetSelectionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    activity = await db.get(Activity, activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if not await can_manage_team(db, current_user, activity.team_id):
        raise HTTPException(status_code=403, detail="Cannot manage this team")
    if activity.type != ActivityType.match:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Squad selection only applies to matches",
        )

    # Only own-team players or players from a feeder team may be selected.
    candidate_ids = {m.user_id for m, _, _ in await _candidate_memberships(db, activity)}
    if payload.user_id not in candidate_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This player is not in the squad or any feeder team",
        )

    result = await db.execute(
        select(Availability).where(
            Availability.activity_id == activity_id,
            Availability.user_id == payload.user_id,
        )
    )
    availability = result.scalar_one_or_none()
    if not availability:
        availability = Availability(activity_id=activity_id, user_id=payload.user_id)
        db.add(availability)
    availability.selected = payload.selected
    await db.flush()

    if payload.selected:
        from app.models import Notification

        db.add(
            Notification(
                user_id=payload.user_id,
                type=NotificationType.selected,
                title=f"You are selected: {activity.title}",
                body=activity.start_time.strftime("%a %d %b %Y, %H:%M"),
                related_activity_id=activity.id,
            )
        )

    result = await db.execute(
        select(Availability)
        .where(Availability.id == availability.id)
        .options(selectinload(Availability.user))
    )
    return result.scalar_one()
