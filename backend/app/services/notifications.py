import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Activity,
    MembershipRole,
    Notification,
    NotificationType,
    TeamMembership,
)


async def notify_team(
    db: AsyncSession,
    *,
    team_id: uuid.UUID,
    type: NotificationType,
    title: str,
    body: str | None = None,
    related_activity_id: uuid.UUID | None = None,
    exclude_user_id: uuid.UUID | None = None,
    players_only: bool = False,
) -> None:
    """Create a notification for every member of a team."""
    stmt = select(TeamMembership.user_id).where(TeamMembership.team_id == team_id)
    if players_only:
        stmt = stmt.where(TeamMembership.role == MembershipRole.player)
    result = await db.execute(stmt)
    user_ids = set(result.scalars().all())
    if exclude_user_id:
        user_ids.discard(exclude_user_id)

    for user_id in user_ids:
        db.add(
            Notification(
                user_id=user_id,
                type=type,
                title=title,
                body=body,
                related_activity_id=related_activity_id,
            )
        )


async def ensure_availability_rows(db: AsyncSession, activity: Activity) -> None:
    """Create blank availability rows for every player in the activity's team."""
    result = await db.execute(
        select(TeamMembership.user_id).where(
            TeamMembership.team_id == activity.team_id,
            TeamMembership.role == MembershipRole.player,
        )
    )
    player_ids = set(result.scalars().all())

    from app.models import Availability  # local import to avoid cycle

    existing = await db.execute(
        select(Availability.user_id).where(Availability.activity_id == activity.id)
    )
    have = set(existing.scalars().all())

    for user_id in player_ids - have:
        db.add(Availability(activity_id=activity.id, user_id=user_id))
