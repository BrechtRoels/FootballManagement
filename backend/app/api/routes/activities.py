import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, or_, select, update
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
    RecurringActivityCreate,
    RecurringCreateResult,
    SetAvailabilityRequest,
    SetSelectionRequest,
    SkippedOccurrence,
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
from app.services.recurrence import (
    generate_occurrences,
    get_club_tz,
    local_hms,
    shift_to_local_time_of_day,
)
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


async def _build_activity(
    db: AsyncSession,
    *,
    team_id: uuid.UUID,
    type: ActivityType,
    title: str,
    description: str | None,
    start_time: datetime,
    end_time: datetime,
    location_text: str | None,
    opponent: str | None,
    home_away: HomeAway | None,
    selected_resource_ids: list[uuid.UUID],
    created_by_id: uuid.UUID,
    series_id: uuid.UUID | None,
    force: bool,
) -> tuple[Activity | None, list[ConflictOut]]:
    """Resolve resources, check conflicts and persist one activity.

    Returns ``(activity, [])`` when created, or ``(None, conflicts)`` when it was
    skipped because resources were booked and ``force`` is False. Shared by the
    single-create and recurring-create paths so they behave identically.
    """
    resolved_ids = await resolve_activity_resources(
        db,
        team_id=team_id,
        activity_type=type,
        home_away=home_away,
        start_time=start_time,
        end_time=end_time,
        selected_resource_ids=selected_resource_ids,
    )
    conflicts = await find_resource_conflicts(
        db, resource_ids=resolved_ids, start_time=start_time, end_time=end_time
    )
    if conflicts and not force:
        return None, conflicts

    loc = await _home_location(
        db,
        activity_type=type,
        home_away=home_away,
        resource_ids=resolved_ids,
        fallback=location_text,
    )
    activity = Activity(
        team_id=team_id,
        type=type,
        title=title,
        description=description,
        start_time=start_time,
        end_time=end_time,
        location_text=loc,
        opponent=opponent,
        home_away=home_away,
        created_by_id=created_by_id,
        series_id=series_id,
    )
    db.add(activity)
    await db.flush()
    await _sync_bookings(db, activity, resolved_ids)
    await ensure_availability_rows(db, activity)
    return activity, conflicts


async def _apply_activity_changes(
    db: AsyncSession,
    activity: Activity,
    *,
    fields: dict,
    resource_ids: list[uuid.UUID] | None,
    force: bool,
) -> tuple[bool, list[ConflictOut]]:
    """Apply scalar field changes + re-resolve bookings for one activity.

    ``fields`` holds scalar columns to set (title/description/location_text/
    opponent/home_away/start_time/end_time). Returns ``(True, conflicts)`` when
    applied or ``(False, conflicts)`` when skipped due to a resource conflict and
    ``force`` is False (the activity is left untouched). Requires
    ``activity.bookings`` to be loaded.
    """
    new_start = fields.get("start_time", activity.start_time)
    new_end = fields.get("end_time", activity.end_time)
    if new_end <= new_start:
        raise HTTPException(status_code=400, detail="end_time must be after start_time")
    new_home_away = fields.get("home_away", activity.home_away)

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
        return False, conflicts

    for field, value in fields.items():
        setattr(activity, field, value)
    activity.location_text = await _home_location(
        db,
        activity_type=activity.type,
        home_away=new_home_away,
        resource_ids=resolved_ids,
        fallback=activity.location_text,
    )
    await _sync_bookings(db, activity, resolved_ids)
    return True, conflicts


async def _apply_series_future(
    db: AsyncSession,
    *,
    anchor: Activity,
    data: dict,
    resource_ids: list[uuid.UUID] | None,
    force: bool,
) -> None:
    """Best-effort propagation of an edit to all later siblings of a series.

    Field changes (title/description/location/opponent/home_away/resources) are
    copied as-is. A time-of-day change is applied to each sibling on ITS OWN date
    (never the anchor's date), preserving the schedule. Siblings whose new
    resources would conflict are left unchanged when ``force`` is False. Never
    re-generates the schedule or moves weekdays.
    """
    tz = get_club_tz()
    change_time = "start_time" in data or "end_time" in data
    if change_time:
        hour, minute, second = local_hms(anchor.start_time, tz=tz)
        duration = anchor.end_time - anchor.start_time

    propagate = {k: v for k, v in data.items() if k not in ("start_time", "end_time")}

    siblings = (
        await db.execute(
            select(Activity)
            .where(
                Activity.series_id == anchor.series_id,
                Activity.start_time > anchor.start_time,
            )
            .options(selectinload(Activity.bookings))
            .order_by(Activity.start_time)
        )
    ).scalars().all()

    for sib in siblings:
        sib_fields = dict(propagate)
        if change_time:
            new_start = shift_to_local_time_of_day(
                sib.start_time, hour=hour, minute=minute, second=second, tz=tz
            )
            sib_fields["start_time"] = new_start
            sib_fields["end_time"] = new_start + duration
        await _apply_activity_changes(
            db, sib, fields=sib_fields, resource_ids=resource_ids, force=force
        )


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
    activity, conflicts = await _build_activity(
        db,
        team_id=payload.team_id,
        type=payload.type,
        title=payload.title,
        description=payload.description,
        start_time=payload.start_time,
        end_time=payload.end_time,
        location_text=payload.location_text,
        opponent=payload.opponent,
        home_away=payload.home_away,
        selected_resource_ids=payload.resource_ids,
        created_by_id=current_user.id,
        series_id=None,
        force=force,
    )
    if activity is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "One or more resources are already booked for this time",
                "conflicts": [c.model_dump(mode="json") for c in conflicts],
            },
        )

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


@router.post(
    "/recurring",
    response_model=RecurringCreateResult,
    status_code=status.HTTP_201_CREATED,
)
async def create_recurring_activities(
    payload: RecurringActivityCreate,
    force: bool = Query(default=False, description="Create despite resource conflicts"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a series of activities from a weekly recurrence rule.

    Each occurrence runs the same resolve/conflict pipeline as a single create.
    With ``force=False`` occurrences whose resources are booked are skipped (not
    a 409 for the whole batch) and reported back; with ``force=True`` all are
    created. All rows share one ``series_id`` and the team gets a single
    summarising notification.
    """
    if not await can_manage_team(db, current_user, payload.team_id):
        raise HTTPException(status_code=403, detail="Cannot schedule for this team")

    occurrences = generate_occurrences(
        payload.recurrence,
        payload.start_time,
        payload.end_time,
        tz=get_club_tz(),
    )
    if not occurrences:
        raise HTTPException(
            status_code=400, detail="Recurrence produced no occurrences"
        )

    series_id = uuid.uuid4()
    created: list[Activity] = []
    skipped: list[SkippedOccurrence] = []
    for start_time, end_time in occurrences:
        activity, conflicts = await _build_activity(
            db,
            team_id=payload.team_id,
            type=payload.type,
            title=payload.title,
            description=payload.description,
            start_time=start_time,
            end_time=end_time,
            location_text=payload.location_text,
            opponent=payload.opponent,
            home_away=payload.home_away,
            selected_resource_ids=payload.resource_ids,
            created_by_id=current_user.id,
            series_id=series_id,
            force=force,
        )
        if activity is None:
            skipped.append(
                SkippedOccurrence(
                    start_time=start_time, end_time=end_time, conflicts=conflicts
                )
            )
        else:
            created.append(activity)

    if not created:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Every occurrence conflicts with an existing booking",
                "skipped": [s.model_dump(mode="json") for s in skipped],
            },
        )

    first = created[0]
    await notify_team(
        db,
        team_id=payload.team_id,
        type=NotificationType.activity_created,
        title=f"New recurring {payload.type.value}: {payload.title}",
        body=(
            f"{len(created)} sessions from "
            f"{first.start_time.strftime('%a %d %b %Y, %H:%M')}"
        ),
        related_activity_id=first.id,
        exclude_user_id=current_user.id,
    )

    await db.flush()
    rows = await db.execute(
        select(Activity)
        .where(Activity.id.in_([a.id for a in created]))
        .options(
            selectinload(Activity.bookings).selectinload(ResourceBooking.resource),
            selectinload(Activity.team),
        )
        .order_by(Activity.start_time)
    )
    return RecurringCreateResult(
        series_id=series_id,
        created=[_to_out(a) for a in rows.scalars().all()],
        skipped=skipped,
    )


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
    scope: Literal["one", "future"] = Query(
        default="one",
        description="'future' also applies the edit to later siblings of the series",
    ),
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

    # Re-resolve the full booking set: the trainer's picks (pitch) keep, dressing
    # rooms are re-derived from the team assignment / opponent automatically.
    applied, conflicts = await _apply_activity_changes(
        db, activity, fields=data, resource_ids=resource_ids, force=force
    )
    if not applied:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Resource conflict",
                "conflicts": [c.model_dump(mode="json") for c in conflicts],
            },
        )

    # Best-effort propagation to later occurrences of the same series.
    if scope == "future" and activity.series_id is not None:
        await _apply_series_future(
            db, anchor=activity, data=data, resource_ids=resource_ids, force=force
        )

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
    scope: Literal["one", "series_future"] = Query(
        default="one",
        description="'series_future' also cancels this + later siblings",
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    activity = await _load_activity(db, activity_id, with_availability=True)
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if not await can_manage_team(db, current_user, activity.team_id):
        raise HTTPException(status_code=403, detail="Cannot manage this team")

    if scope == "series_future" and activity.series_id is not None:
        await db.execute(
            update(Activity)
            .where(
                Activity.series_id == activity.series_id,
                Activity.start_time >= activity.start_time,
            )
            .values(status=ActivityStatus.cancelled)
        )
        title = f"Cancelled series: {activity.title}"
    else:
        activity.status = ActivityStatus.cancelled
        title = f"Cancelled: {activity.title}"

    await notify_team(
        db,
        team_id=activity.team_id,
        type=NotificationType.activity_cancelled,
        title=title,
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
    scope: Literal["one", "series_future"] = Query(
        default="one",
        description="'series_future' also deletes this + later siblings",
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    activity = await db.get(Activity, activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if not await can_manage_team(db, current_user, activity.team_id):
        raise HTTPException(status_code=403, detail="Cannot manage this team")

    if scope == "series_future" and activity.series_id is not None:
        # Past occurrences (which may carry ratings) are preserved; FK cascade
        # removes each row's bookings/availabilities.
        await db.execute(
            delete(Activity).where(
                Activity.series_id == activity.series_id,
                Activity.start_time >= activity.start_time,
            )
        )
    else:
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
        from app.services.push import activity_url, send_push_to_users

        title = f"You are selected: {activity.title}"
        body = activity.start_time.strftime("%a %d %b %Y, %H:%M")
        db.add(
            Notification(
                user_id=payload.user_id,
                type=NotificationType.selected,
                title=title,
                body=body,
                related_activity_id=activity.id,
            )
        )
        await send_push_to_users(
            db,
            [payload.user_id],
            title=title,
            body=body,
            url=activity_url(activity.id),
        )

    result = await db.execute(
        select(Availability)
        .where(Availability.id == availability.id)
        .options(selectinload(Availability.user))
    )
    return result.scalar_one()
