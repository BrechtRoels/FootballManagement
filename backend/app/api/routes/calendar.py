import secrets

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import (
    Activity,
    Availability,
    CalendarSubscription,
    ResourceBooking,
    User,
    UserRole,
)
from app.services.access import get_user_team_ids
from app.services.ics import build_activity_feed

router = APIRouter(prefix="/calendar", tags=["calendar"])


def _path(token: str) -> str:
    return f"/api/calendar/feed/{token}.ics"


async def _get_or_create(db: AsyncSession, user: User) -> CalendarSubscription:
    result = await db.execute(
        select(CalendarSubscription).where(CalendarSubscription.user_id == user.id)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        sub = CalendarSubscription(user_id=user.id, token=secrets.token_urlsafe(24))
        db.add(sub)
        await db.flush()
    return sub


@router.get("/subscription")
async def get_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The current user's personal calendar feed token + relative path."""
    sub = await _get_or_create(db, current_user)
    return {"token": sub.token, "path": _path(sub.token)}


@router.post("/subscription/reset")
async def reset_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Issue a new token, revoking the old feed URL."""
    result = await db.execute(
        select(CalendarSubscription).where(
            CalendarSubscription.user_id == current_user.id
        )
    )
    sub = result.scalar_one_or_none()
    token = secrets.token_urlsafe(24)
    if sub:
        sub.token = token
    else:
        sub = CalendarSubscription(user_id=current_user.id, token=token)
        db.add(sub)
    await db.flush()
    return {"token": sub.token, "path": _path(sub.token)}


async def _user_activities(db: AsyncSession, user: User) -> list[Activity]:
    """Activities visible to a user — same rule as the in-app calendar."""
    stmt = (
        select(Activity)
        .options(
            selectinload(Activity.bookings).selectinload(ResourceBooking.resource),
            selectinload(Activity.team),
        )
        .order_by(Activity.start_time)
    )
    if user.role != UserRole.admin:
        allowed = await get_user_team_ids(db, user)
        callup_subq = select(Availability.activity_id).where(
            Availability.user_id == user.id
        )
        conds = [Activity.id.in_(callup_subq)]
        if allowed:
            conds.append(Activity.team_id.in_(allowed))
        stmt = stmt.where(or_(*conds))
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/feed/{token}.ics")
async def calendar_feed(token: str, db: AsyncSession = Depends(get_db)):
    """Public iCalendar feed (authenticated only by the secret token in the URL).

    Calendar apps subscribe to this URL and poll it for updates.
    """
    result = await db.execute(
        select(CalendarSubscription).where(CalendarSubscription.token == token)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Calendar not found")
    user = await db.get(User, sub.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Calendar not found")

    activities = await _user_activities(db, user)
    ics = build_activity_feed("KSV Jabbeke", activities)
    return Response(
        content=ics,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": 'inline; filename="ksv-jabbeke.ics"'},
    )
