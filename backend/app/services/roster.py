from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Activity,
    ActivityType,
    MembershipRole,
    Team,
    TeamMembership,
)
from app.services.access import get_feeder_team_ids


async def candidate_memberships(
    db: AsyncSession, activity: Activity
) -> list[tuple[TeamMembership, Team | None, bool]]:
    """Players selectable for this activity: own-team players, plus feeder-team
    players when it is a match. Returns (membership, team, is_callup)."""
    own_team = await db.get(Team, activity.team_id)
    result = await db.execute(
        select(TeamMembership)
        .options(selectinload(TeamMembership.user))
        .where(
            TeamMembership.team_id == activity.team_id,
            TeamMembership.role == MembershipRole.player,
        )
    )
    entries: list[tuple[TeamMembership, Team | None, bool]] = [
        (m, own_team, False) for m in result.scalars().all()
    ]

    if activity.type == ActivityType.match:
        feeder_ids = await get_feeder_team_ids(db, activity.team_id)
        if feeder_ids:
            teams = {
                t.id: t
                for t in (
                    await db.execute(select(Team).where(Team.id.in_(feeder_ids)))
                ).scalars().all()
            }
            fres = await db.execute(
                select(TeamMembership)
                .options(selectinload(TeamMembership.user))
                .where(
                    TeamMembership.team_id.in_(feeder_ids),
                    TeamMembership.role == MembershipRole.player,
                )
            )
            for m in fres.scalars().all():
                entries.append((m, teams.get(m.team_id), True))
    return entries
