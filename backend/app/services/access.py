import uuid

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import aliased
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Availability,
    MembershipRole,
    TeamFeeder,
    TeamMembership,
    User,
    UserRole,
)


async def get_user_team_ids(
    db: AsyncSession, user: User, *, as_trainer: bool = False
) -> set[uuid.UUID]:
    """Team ids the user belongs to. If as_trainer, only teams they coach."""
    stmt = select(TeamMembership.team_id).where(TeamMembership.user_id == user.id)
    if as_trainer:
        stmt = stmt.where(TeamMembership.role == MembershipRole.trainer)
    result = await db.execute(stmt)
    return set(result.scalars().all())


async def is_team_member(db: AsyncSession, user: User, team_id: uuid.UUID) -> bool:
    if user.role == UserRole.admin:
        return True
    result = await db.execute(
        select(TeamMembership.id).where(
            TeamMembership.user_id == user.id,
            TeamMembership.team_id == team_id,
        )
    )
    return result.first() is not None


async def get_contactable_user_ids(db: AsyncSession, user: User) -> set[uuid.UUID]:
    """Users the given user may direct-message.

    Direct messages are allowed only between a **trainer (coach) and a player**
    who share a team:
      - a player can message the trainers of teams they play in,
      - a trainer can message the players of teams they coach.
    Player-to-player and trainer-to-trainer DMs are not allowed. (Team-wide group
    chat is handled separately via team channels.)

    The rule is expressed on team *membership* roles, so a user who is a trainer
    in one team and a player in another gets the correct contacts for each. A
    pure admin with no team memberships therefore has no DM contacts; an admin
    added to a team as a trainer can DM that team's players.
    """
    me = aliased(TeamMembership)
    other = aliased(TeamMembership)
    result = await db.execute(
        select(other.user_id)
        .join(me, me.team_id == other.team_id)
        .where(
            me.user_id == user.id,
            other.user_id != user.id,
            or_(
                and_(
                    me.role == MembershipRole.trainer,
                    other.role == MembershipRole.player,
                ),
                and_(
                    me.role == MembershipRole.player,
                    other.role == MembershipRole.trainer,
                ),
            ),
        )
        .distinct()
    )
    return set(result.scalars().all())


async def can_dm(db: AsyncSession, user: User, other_id: uuid.UUID) -> bool:
    if other_id == user.id:
        return False
    return other_id in await get_contactable_user_ids(db, user)


async def get_feeder_team_ids(db: AsyncSession, team_id: uuid.UUID) -> set[uuid.UUID]:
    """Lower / feeder teams that `team_id` may call up players from."""
    result = await db.execute(
        select(TeamFeeder.feeder_team_id).where(TeamFeeder.team_id == team_id)
    )
    return set(result.scalars().all())


async def can_access_activity(db: AsyncSession, user: User, activity) -> bool:
    """A user can view/respond to an activity if they're an admin, a member of
    its team, or have been called up (they have an availability row for it)."""
    if await is_team_member(db, user, activity.team_id):
        return True
    result = await db.execute(
        select(Availability.id).where(
            Availability.activity_id == activity.id,
            Availability.user_id == user.id,
        )
    )
    return result.first() is not None


async def can_manage_team(db: AsyncSession, user: User, team_id: uuid.UUID) -> bool:
    """Admins manage any team; trainers manage teams they coach."""
    if user.role == UserRole.admin:
        return True
    if user.role != UserRole.trainer:
        return False
    result = await db.execute(
        select(TeamMembership.id).where(
            TeamMembership.user_id == user.id,
            TeamMembership.team_id == team_id,
            TeamMembership.role == MembershipRole.trainer,
        )
    )
    return result.first() is not None


async def can_view_player(
    db: AsyncSession, viewer: User, target_user_id: uuid.UUID
) -> bool:
    """Who may see a player's performance profile: admins, or a trainer who
    coaches a team the target player belongs to. Players never see it (not even
    their own)."""
    if viewer.role == UserRole.admin:
        return True
    if viewer.role != UserRole.trainer:
        return False
    me = aliased(TeamMembership)
    target = aliased(TeamMembership)
    result = await db.execute(
        select(me.id)
        .join(target, target.team_id == me.team_id)
        .where(
            me.user_id == viewer.id,
            me.role == MembershipRole.trainer,
            target.user_id == target_user_id,
            target.role == MembershipRole.player,
        )
    )
    return result.first() is not None
