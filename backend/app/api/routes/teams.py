import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, require_admin
from app.core.database import get_db
from app.models import (
    MembershipRole,
    Resource,
    ResourceType,
    Team,
    TeamDressingRoom,
    TeamFeeder,
    TeamMembership,
    User,
    UserRole,
)
from app.repositories import users as user_repo
from app.schemas.resource import ResourceOut
from app.schemas.team import (
    DressingRoomAssign,
    FeederCreate,
    MembershipCreate,
    MembershipOut,
    MembershipUpdate,
    TeamCreate,
    TeamDetailOut,
    TeamOut,
    TeamUpdate,
)
from app.services.access import get_user_team_ids, is_team_member

router = APIRouter(prefix="/teams", tags=["teams"])


async def _get_team_or_404(db: AsyncSession, team_id: uuid.UUID) -> Team:
    team = await db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return team


@router.get("", response_model=list[TeamOut])
async def list_teams(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admins see all teams; trainers and players see only their own."""
    stmt = select(Team).order_by(Team.name)
    if current_user.role != UserRole.admin:
        team_ids = await get_user_team_ids(db, current_user)
        if not team_ids:
            return []
        stmt = stmt.where(Team.id.in_(team_ids))
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=TeamOut, status_code=status.HTTP_201_CREATED)
async def create_team(
    payload: TeamCreate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    team = Team(**payload.model_dump())
    db.add(team)
    await db.flush()
    await db.refresh(team)
    return team


@router.get("/{team_id}", response_model=TeamDetailOut)
async def get_team(
    team_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not await is_team_member(db, current_user, team_id):
        raise HTTPException(status_code=403, detail="Not a member of this team")
    result = await db.execute(
        select(Team)
        .where(Team.id == team_id)
        .options(
            selectinload(Team.memberships).selectinload(TeamMembership.user)
        )
    )
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    feeder_teams = await _get_feeder_teams(db, team_id)
    dressing_rooms = await _get_team_dressing_rooms(db, team_id)
    out = TeamDetailOut.model_validate(team)
    out.feeders = [TeamOut.model_validate(t) for t in feeder_teams]
    out.dressing_rooms = [ResourceOut.model_validate(r) for r in dressing_rooms]
    return out


async def _get_feeder_teams(db: AsyncSession, team_id: uuid.UUID) -> list[Team]:
    result = await db.execute(
        select(Team)
        .join(TeamFeeder, TeamFeeder.feeder_team_id == Team.id)
        .where(TeamFeeder.team_id == team_id)
        .order_by(Team.name)
    )
    return list(result.scalars().all())


async def _get_team_dressing_rooms(
    db: AsyncSession, team_id: uuid.UUID
) -> list[Resource]:
    result = await db.execute(
        select(Resource)
        .join(TeamDressingRoom, TeamDressingRoom.resource_id == Resource.id)
        .where(TeamDressingRoom.team_id == team_id)
        .order_by(Resource.name)
    )
    return list(result.scalars().all())


@router.patch("/{team_id}", response_model=TeamOut)
async def update_team(
    team_id: uuid.UUID,
    payload: TeamUpdate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    team = await _get_team_or_404(db, team_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(team, field, value)
    db.add(team)
    await db.flush()
    await db.refresh(team)
    return team


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_team(
    team_id: uuid.UUID,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    team = await _get_team_or_404(db, team_id)
    await db.delete(team)


# ---- Membership management (admin only) ----


@router.post(
    "/{team_id}/members",
    response_model=MembershipOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_member(
    team_id: uuid.UUID,
    payload: MembershipCreate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    await _get_team_or_404(db, team_id)
    user = await user_repo.get_by_id(db, payload.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    existing = await db.execute(
        select(TeamMembership).where(
            TeamMembership.team_id == team_id,
            TeamMembership.user_id == payload.user_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already in this team",
        )

    membership = TeamMembership(
        team_id=team_id,
        user_id=payload.user_id,
        role=payload.role,
        shirt_number=payload.shirt_number,
        position=payload.position,
    )
    db.add(membership)
    await db.flush()
    result = await db.execute(
        select(TeamMembership)
        .where(TeamMembership.id == membership.id)
        .options(selectinload(TeamMembership.user))
    )
    return result.scalar_one()


@router.patch("/{team_id}/members/{membership_id}", response_model=MembershipOut)
async def update_member(
    team_id: uuid.UUID,
    membership_id: uuid.UUID,
    payload: MembershipUpdate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TeamMembership)
        .where(
            TeamMembership.id == membership_id,
            TeamMembership.team_id == team_id,
        )
        .options(selectinload(TeamMembership.user))
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(membership, field, value)
    db.add(membership)
    await db.flush()
    return membership


@router.delete(
    "/{team_id}/members/{membership_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def remove_member(
    team_id: uuid.UUID,
    membership_id: uuid.UUID,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    membership = await db.get(TeamMembership, membership_id)
    if not membership or membership.team_id != team_id:
        raise HTTPException(status_code=404, detail="Membership not found")

    # A player must always belong to at least one team. Block removing their
    # last team here — assign them elsewhere first, or delete the account.
    if membership.role == MembershipRole.player:
        count = await db.scalar(
            select(func.count())
            .select_from(TeamMembership)
            .where(TeamMembership.user_id == membership.user_id)
        )
        if (count or 0) <= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "A player must belong to a team. Assign them to another "
                    "team first, or delete the account from People."
                ),
            )
    await db.delete(membership)


# ---- Feeder / call-up links (admin only) ----


@router.post(
    "/{team_id}/feeders", response_model=TeamOut, status_code=status.HTTP_201_CREATED
)
async def add_feeder(
    team_id: uuid.UUID,
    payload: FeederCreate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Link a lower team as a feeder this team can call up players from."""
    await _get_team_or_404(db, team_id)
    if payload.feeder_team_id == team_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A team cannot be its own feeder",
        )
    feeder = await db.get(Team, payload.feeder_team_id)
    if not feeder:
        raise HTTPException(status_code=404, detail="Feeder team not found")

    existing = await db.execute(
        select(TeamFeeder).where(
            TeamFeeder.team_id == team_id,
            TeamFeeder.feeder_team_id == payload.feeder_team_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That team is already a feeder",
        )
    db.add(TeamFeeder(team_id=team_id, feeder_team_id=payload.feeder_team_id))
    return feeder


@router.delete(
    "/{team_id}/feeders/{feeder_team_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def remove_feeder(
    team_id: uuid.UUID,
    feeder_team_id: uuid.UUID,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TeamFeeder).where(
            TeamFeeder.team_id == team_id,
            TeamFeeder.feeder_team_id == feeder_team_id,
        )
    )
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Feeder link not found")
    await db.delete(link)


# ---- Home dressing-room assignment (admin only) ----


@router.put("/{team_id}/dressing-rooms", response_model=list[ResourceOut])
async def set_dressing_rooms(
    team_id: uuid.UUID,
    payload: DressingRoomAssign,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Replace the dressing rooms reserved automatically for this team's home
    activities. Only dressing-room facilities may be assigned."""
    await _get_team_or_404(db, team_id)
    room_ids = list(dict.fromkeys(payload.resource_ids))  # de-dupe, keep order

    if room_ids:
        res = await db.execute(select(Resource).where(Resource.id.in_(room_ids)))
        by_id = {r.id: r for r in res.scalars().all()}
        for rid in room_ids:
            room = by_id.get(rid)
            if not room:
                raise HTTPException(status_code=404, detail=f"Resource {rid} not found")
            if room.type != ResourceType.dressing_room:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Only dressing rooms can be assigned to a team",
                )

    await db.execute(
        delete(TeamDressingRoom).where(TeamDressingRoom.team_id == team_id)
    )
    for rid in room_ids:
        db.add(TeamDressingRoom(team_id=team_id, resource_id=rid))
    await db.flush()
    return await _get_team_dressing_rooms(db, team_id)
