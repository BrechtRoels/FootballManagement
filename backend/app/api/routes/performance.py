import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_trainer
from app.core.database import get_db
from app.models import (
    Activity,
    ActivityStatus,
    ActivityType,
    PlayerPerformance,
    User,
)
from app.schemas.performance import (
    PerformanceEntryOut,
    PlayerPerformanceOut,
    RateSquadRequest,
    TeamPerformanceRow,
)
from app.services.access import can_manage_team, can_view_player
from app.services.performance import (
    get_activity_performance,
    get_player_aggregate,
    get_team_summary,
)
from app.services.roster import candidate_memberships

router = APIRouter(prefix="/performance", tags=["performance"])


@router.put(
    "/activities/{activity_id}/ratings",
    response_model=list[PerformanceEntryOut],
)
async def rate_squad(
    activity_id: uuid.UUID,
    payload: RateSquadRequest,
    current_user: User = Depends(require_trainer),
    db: AsyncSession = Depends(get_db),
):
    """Trainer upserts performance/mentality ratings for any subset of the squad."""
    activity = await db.get(Activity, activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if not await can_manage_team(db, current_user, activity.team_id):
        raise HTTPException(status_code=403, detail="Cannot manage this team")
    if activity.type != ActivityType.match:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ratings only apply to matches",
        )
    if activity.status == ActivityStatus.cancelled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot rate a cancelled activity",
        )

    candidate_ids = {m.user_id for m, _, _ in await candidate_memberships(db, activity)}
    for rating in payload.ratings:
        if rating.user_id not in candidate_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A rated player is not in the squad or any feeder team",
            )

    existing = await db.execute(
        select(PlayerPerformance).where(
            PlayerPerformance.activity_id == activity_id
        )
    )
    by_user = {r.user_id: r for r in existing.scalars().all()}

    for rating in payload.ratings:
        row = by_user.get(rating.user_id)
        if not row:
            row = PlayerPerformance(
                activity_id=activity_id, user_id=rating.user_id
            )
            db.add(row)
            by_user[rating.user_id] = row
        for field, value in rating.model_dump(
            exclude_unset=True, exclude={"user_id"}
        ).items():
            setattr(row, field, value)
        row.rated_by_id = current_user.id

    await db.flush()
    return await get_activity_performance(db, activity)


@router.get(
    "/activities/{activity_id}",
    response_model=list[PerformanceEntryOut],
)
async def activity_performance(
    activity_id: uuid.UUID,
    current_user: User = Depends(require_trainer),
    db: AsyncSession = Depends(get_db),
):
    """Roster + current ratings (prefills the rate-players screen)."""
    activity = await db.get(Activity, activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if not await can_manage_team(db, current_user, activity.team_id):
        raise HTTPException(status_code=403, detail="Cannot manage this team")
    return await get_activity_performance(db, activity)


@router.get("/players/{user_id}", response_model=PlayerPerformanceOut)
async def player_performance(
    user_id: uuid.UUID,
    team_id: uuid.UUID | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aggregated performance profile. Visible to admins and the player's
    trainers only (never the player)."""
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Player not found")
    if not await can_view_player(db, current_user, user_id):
        raise HTTPException(
            status_code=403, detail="Cannot view this player's performance"
        )
    return await get_player_aggregate(db, target, team_id=team_id)


@router.get("/teams/{team_id}", response_model=list[TeamPerformanceRow])
async def team_performance(
    team_id: uuid.UUID,
    current_user: User = Depends(require_trainer),
    db: AsyncSession = Depends(get_db),
):
    """Per-player performance summary for a team (trainer/admin)."""
    if not await can_manage_team(db, current_user, team_id):
        raise HTTPException(status_code=403, detail="Cannot manage this team")
    return await get_team_summary(db, team_id)
