"""Integration test for recurring create/edit/delete against the real DB.

Everything runs inside a single session that is rolled back at the end, so no
data is persisted. Calls the route handlers directly (they are plain async
functions) to exercise the full resolve/conflict/notify pipeline.

Run standalone: `python -m tests.test_recurring_integration`
"""

import asyncio
import uuid
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select, text

from app.api.routes.activities import (
    cancel_activity,
    create_recurring_activities,
    delete_activity,
    update_activity,
)
from app.core.database import AsyncSessionLocal
from app.models import (
    Activity,
    ActivityStatus,
    ActivityType,
    Availability,
    MembershipRole,
    Resource,
    ResourceBooking,
    ResourceType,
    Team,
    TeamMembership,
    User,
    UserRole,
)
from app.schemas.activity import (
    ActivityUpdate,
    RecurrenceSpec,
    RecurringActivityCreate,
)

TZ = ZoneInfo("Europe/Brussels")


def _at(y, m, d, hour) -> datetime:
    return datetime.combine(datetime(y, m, d).date(), time(hour)).replace(
        tzinfo=TZ
    ).astimezone(timezone.utc)


async def _seed(db):
    tag = uuid.uuid4().hex[:8]
    admin = User(
        email=f"admin-{tag}@test.local",
        full_name="Test Admin",
        password_hash="x",
        role=UserRole.admin,
    )
    team = Team(name=f"Team {tag}")
    db.add_all([admin, team])
    await db.flush()
    players = [
        User(
            email=f"p{i}-{tag}@test.local",
            full_name=f"Player {i}",
            password_hash="x",
            role=UserRole.player,
        )
        for i in range(3)
    ]
    db.add_all(players)
    await db.flush()
    for p in players:
        db.add(
            TeamMembership(team_id=team.id, user_id=p.id, role=MembershipRole.player)
        )
    pitch = Resource(name=f"Pitch {tag}", type=ResourceType.pitch, location="Field A")
    db.add(pitch)
    await db.flush()
    return admin, team, players, pitch


async def main():
    db = AsyncSessionLocal()
    try:
        # Ensure the additive migration is applied (mirrors main.py lifespan).
        await db.execute(
            text("ALTER TABLE activities ADD COLUMN IF NOT EXISTS series_id uuid")
        )
        admin, team, players, pitch = await _seed(db)

        # --- recurring create with one pre-booked occurrence -> skipped ---
        start = _at(2025, 9, 2, 18)  # Tuesday
        end = start + timedelta(hours=2)
        # Pre-book the pitch for the 2nd Tuesday (2025-09-09) to force a skip.
        blocker = Activity(
            team_id=team.id,
            type=ActivityType.training,
            title="Blocker",
            start_time=_at(2025, 9, 9, 18),
            end_time=_at(2025, 9, 9, 20),
            status=ActivityStatus.scheduled,
        )
        db.add(blocker)
        await db.flush()
        db.add(ResourceBooking(activity_id=blocker.id, resource_id=pitch.id))
        await db.flush()

        payload = RecurringActivityCreate(
            team_id=team.id,
            type="training",
            title="Tuesday Training",
            start_time=start,
            end_time=end,
            resource_ids=[pitch.id],
            recurrence=RecurrenceSpec(days_of_week=[1], count=4),
        )
        result = await create_recurring_activities(
            payload, force=False, current_user=admin, db=db
        )
        assert len(result.created) == 3, result.created
        assert len(result.skipped) == 1, result.skipped
        assert result.skipped[0].start_time.astimezone(TZ).date() == datetime(
            2025, 9, 9
        ).date()
        # All created rows share the one series_id.
        assert {c.series_id for c in result.created} == {result.series_id}
        print("ok  recurring create skips conflicting occurrence")

        # Availability rows were created for each occurrence (3 players each).
        created_ids = [c.id for c in result.created]
        av = (
            await db.execute(
                select(Availability).where(Availability.activity_id.in_(created_ids))
            )
        ).scalars().all()
        assert len(av) == 3 * len(players), len(av)
        print("ok  availability rows created per occurrence")

        # --- edit series future: retime from the first occurrence ---
        first_id = sorted(result.created, key=lambda c: c.start_time)[0].id
        await update_activity(
            first_id,
            ActivityUpdate(title="Renamed Training", start_time=_at(2025, 9, 2, 19)),
            force=True,
            scope="future",
            current_user=admin,
            db=db,
        )
        siblings = (
            await db.execute(
                select(Activity)
                .where(Activity.series_id == result.series_id)
                .order_by(Activity.start_time)
            )
        ).scalars().all()
        assert all(s.title == "Renamed Training" for s in siblings), [
            s.title for s in siblings
        ]
        # Every sibling now starts at 19:00 local on its own date.
        for s in siblings:
            assert s.start_time.astimezone(TZ).hour == 19
            assert s.start_time.astimezone(TZ).weekday() == 1
        print("ok  series-future edit retimes & renames all, dates preserved")

        # --- cancel series_future from the middle ---
        mid = siblings[1]
        await cancel_activity(
            mid.id, scope="series_future", current_user=admin, db=db
        )
        after = (
            await db.execute(
                select(Activity)
                .where(Activity.series_id == result.series_id)
                .order_by(Activity.start_time)
            )
        ).scalars().all()
        assert after[0].status == ActivityStatus.scheduled  # earlier untouched
        assert all(
            a.status == ActivityStatus.cancelled for a in after[1:]
        ), [a.status for a in after]
        print("ok  series_future cancel affects this + later only")

        # --- delete series_future from the first -> all gone ---
        await delete_activity(
            after[0].id, scope="series_future", current_user=admin, db=db
        )
        remaining = (
            await db.execute(
                select(Activity).where(Activity.series_id == result.series_id)
            )
        ).scalars().all()
        assert remaining == [], remaining
        print("ok  series_future delete removes this + later")

        print("\nintegration: all checks passed")
    finally:
        await db.rollback()
        await db.close()


if __name__ == "__main__":
    asyncio.run(main())
