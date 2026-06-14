import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Activity,
    ActivityStatus,
    ActivityType,
    Availability,
    AvailabilityStatus,
    MembershipRole,
    PlayerPerformance,
    TeamMembership,
    User,
)
from app.schemas.performance import (
    PerformanceEntryOut,
    PerformancePoint,
    PlayerPerformanceOut,
    TeamPerformanceRow,
)
from app.schemas.user import UserOut
from app.services.roster import candidate_memberships

# How many recent activities feed the trend sparkline.
HISTORY_LIMIT = 20


def _avg(values: list[int]) -> float | None:
    return round(sum(values) / len(values), 2) if values else None


def _is_rated(row: PlayerPerformance) -> bool:
    return row.performance_rating is not None or row.mentality_rating is not None


def _attendance(
    av_pairs: list[tuple[Availability, Activity]], now: datetime
) -> dict:
    """Zero-burden signals derived from existing availability rows."""
    invited = len(av_pairs)
    available = sum(
        1 for a, _ in av_pairs if a.status == AvailabilityStatus.available
    )
    appearances = sum(
        1
        for a, act in av_pairs
        if act.start_time < now
        and (a.selected or a.status == AvailabilityStatus.available)
    )
    matches = [(a, act) for a, act in av_pairs if act.type == ActivityType.match]
    selected = sum(1 for a, _ in matches if a.selected)
    return {
        "appearances": appearances,
        "availability_pct": round(100 * available / invited, 1) if invited else None,
        "selection_rate": (
            round(100 * selected / len(matches), 1) if matches else None
        ),
    }


async def get_activity_performance(
    db: AsyncSession, activity: Activity
) -> list[PerformanceEntryOut]:
    """Roster for an activity merged with each player's current rating."""
    rows = await db.execute(
        select(PlayerPerformance).where(
            PlayerPerformance.activity_id == activity.id
        )
    )
    by_user = {r.user_id: r for r in rows.scalars().all()}

    out: list[PerformanceEntryOut] = []
    seen: set[uuid.UUID] = set()
    for membership, _team, _is_callup in await candidate_memberships(db, activity):
        if membership.user_id in seen:
            continue
        seen.add(membership.user_id)
        row = by_user.get(membership.user_id)
        out.append(
            PerformanceEntryOut(
                user=UserOut.model_validate(membership.user),
                activity_id=activity.id,
                performance_rating=row.performance_rating if row else None,
                mentality_rating=row.mentality_rating if row else None,
                note=row.note if row else None,
                rated=bool(row and _is_rated(row)),
                updated_at=row.updated_at if row else None,
            )
        )
    return out


async def _player_perf_pairs(
    db: AsyncSession, user_id: uuid.UUID, team_id: uuid.UUID | None
) -> list[tuple[PlayerPerformance, Activity]]:
    stmt = (
        select(PlayerPerformance, Activity)
        .join(Activity, PlayerPerformance.activity_id == Activity.id)
        .where(
            PlayerPerformance.user_id == user_id,
            Activity.status != ActivityStatus.cancelled,
        )
    )
    if team_id is not None:
        stmt = stmt.where(Activity.team_id == team_id)
    result = await db.execute(stmt)
    return list(result.all())


async def _player_av_pairs(
    db: AsyncSession, user_id: uuid.UUID, team_id: uuid.UUID | None
) -> list[tuple[Availability, Activity]]:
    stmt = (
        select(Availability, Activity)
        .join(Activity, Availability.activity_id == Activity.id)
        .where(
            Availability.user_id == user_id,
            Activity.status != ActivityStatus.cancelled,
        )
    )
    if team_id is not None:
        stmt = stmt.where(Activity.team_id == team_id)
    result = await db.execute(stmt)
    return list(result.all())


async def get_player_aggregate(
    db: AsyncSession, user: User, *, team_id: uuid.UUID | None = None
) -> PlayerPerformanceOut:
    now = datetime.now(timezone.utc)
    perf_pairs = await _player_perf_pairs(db, user.id, team_id)
    av_pairs = await _player_av_pairs(db, user.id, team_id)

    perf_vals = [
        p.performance_rating for p, _ in perf_pairs if p.performance_rating is not None
    ]
    ment_vals = [
        p.mentality_rating for p, _ in perf_pairs if p.mentality_rating is not None
    ]
    rated = [p for p, _ in perf_pairs if _is_rated(p)]
    last_rated_at = max((p.updated_at for p in rated), default=None)

    history_pairs = sorted(perf_pairs, key=lambda pa: pa[1].start_time)[-HISTORY_LIMIT:]
    history = [
        PerformancePoint(
            activity_id=act.id,
            activity_type=act.type,
            title=act.title,
            date=act.start_time,
            performance_rating=p.performance_rating,
            mentality_rating=p.mentality_rating,
        )
        for p, act in history_pairs
    ]

    att = _attendance(av_pairs, now)
    return PlayerPerformanceOut(
        user=UserOut.model_validate(user),
        rated_count=len(rated),
        avg_performance=_avg(perf_vals),
        avg_mentality=_avg(ment_vals),
        last_rated_at=last_rated_at,
        history=history,
        **att,
    )


async def get_team_summary(
    db: AsyncSession, team_id: uuid.UUID
) -> list[TeamPerformanceRow]:
    now = datetime.now(timezone.utc)

    members = await db.execute(
        select(TeamMembership)
        .options(selectinload(TeamMembership.user))
        .where(
            TeamMembership.team_id == team_id,
            TeamMembership.role == MembershipRole.player,
        )
    )
    memberships = list(members.scalars().all())
    player_ids = [m.user_id for m in memberships]
    if not player_ids:
        return []

    # One query each for ratings and availability across this team's activities.
    perf_rows = await db.execute(
        select(PlayerPerformance, Activity)
        .join(Activity, PlayerPerformance.activity_id == Activity.id)
        .where(
            Activity.team_id == team_id,
            Activity.status != ActivityStatus.cancelled,
            PlayerPerformance.user_id.in_(player_ids),
        )
    )
    av_rows = await db.execute(
        select(Availability, Activity)
        .join(Activity, Availability.activity_id == Activity.id)
        .where(
            Activity.team_id == team_id,
            Activity.status != ActivityStatus.cancelled,
            Availability.user_id.in_(player_ids),
        )
    )
    perf_by_user: dict[uuid.UUID, list] = {}
    for p, act in perf_rows.all():
        perf_by_user.setdefault(p.user_id, []).append((p, act))
    av_by_user: dict[uuid.UUID, list] = {}
    for a, act in av_rows.all():
        av_by_user.setdefault(a.user_id, []).append((a, act))

    def _sort_key(m: TeamMembership):
        return (m.shirt_number if m.shirt_number is not None else 999, m.user.full_name)

    rows: list[TeamPerformanceRow] = []
    for m in sorted(memberships, key=_sort_key):
        pps = perf_by_user.get(m.user_id, [])
        avs = av_by_user.get(m.user_id, [])
        perf_vals = [p.performance_rating for p, _ in pps if p.performance_rating is not None]
        ment_vals = [p.mentality_rating for p, _ in pps if p.mentality_rating is not None]
        rated = [p for p, _ in pps if _is_rated(p)]
        att = _attendance(avs, now)
        rows.append(
            TeamPerformanceRow(
                user=UserOut.model_validate(m.user),
                rated_count=len(rated),
                avg_performance=_avg(perf_vals),
                avg_mentality=_avg(ment_vals),
                appearances=att["appearances"],
                availability_pct=att["availability_pct"],
            )
        )
    return rows
