"""Seed the database for KSV Jabbeke.

Usage:
    python -m app.seed            # create the first admin only
    python -m app.seed --demo     # also create demo teams, staff, players,
                                  # facilities and activities for KSV Jabbeke
"""

import asyncio
import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal, Base, engine
from app.core.security import hash_password
from app.models import (
    Activity,
    ActivityType,
    Availability,
    AvailabilityStatus,
    MembershipRole,
    PlayerPerformance,
    Resource,
    ResourceBooking,
    ResourceType,
    Team,
    TeamDressingRoom,
    TeamFeeder,
    TeamMembership,
    User,
    UserRole,
)
import app.models  # noqa: F401  (register metadata)

DEMO_PASSWORD = "ChangeMe123!"


async def _get_or_create_user(db, *, email, full_name, role, password) -> User:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user:
        return user
    user = User(
        email=email,
        full_name=full_name,
        role=role,
        password_hash=hash_password(password),
    )
    db.add(user)
    await db.flush()
    return user


async def _get_or_create_team(db, *, name, season, category) -> Team:
    result = await db.execute(select(Team).where(Team.name == name))
    team = result.scalar_one_or_none()
    if team:
        return team
    team = Team(name=name, season=season, category=category)
    db.add(team)
    await db.flush()
    return team


async def _ensure_membership(db, team, user, role, number=None, position=None):
    result = await db.execute(
        select(TeamMembership).where(
            TeamMembership.team_id == team.id,
            TeamMembership.user_id == user.id,
        )
    )
    if not result.scalar_one_or_none():
        db.add(
            TeamMembership(
                team_id=team.id,
                user_id=user.id,
                role=role,
                shirt_number=number,
                position=position,
            )
        )


def _next_weekday(base: datetime, weekday: int, hour: int, minute: int) -> datetime:
    """Next strictly-future date that falls on `weekday` (Mon=0..Sun=6)."""
    days_ahead = (weekday - base.weekday()) % 7 or 7
    target = base + timedelta(days=days_ahead)
    return target.replace(hour=hour, minute=minute, second=0, microsecond=0)


async def seed_admin(db) -> User:
    admin = await _get_or_create_user(
        db,
        email=settings.first_admin_email.lower(),
        full_name=settings.first_admin_name,
        role=UserRole.admin,
        password=settings.first_admin_password,
    )
    print(f"  admin: {admin.email}")
    return admin


async def seed_demo(db) -> None:
    # --- Facilities at Sportpark Jabbeke ---
    # `location` holds a map-routable address: for a home activity it is copied to
    # the activity's location so players can open it in Google Maps/Waze/Apple Maps.
    SPORTPARK = "Sportpark Jabbeke, Krukkelstraat, 8490 Jabbeke"
    resource_specs = [
        ("Hoofdterrein", ResourceType.pitch, 22, SPORTPARK),
        ("Terrein B (training)", ResourceType.pitch, 22, SPORTPARK),
        ("Kunstgrasveld", ResourceType.pitch, 22, SPORTPARK),
        ("Kleedkamer 1", ResourceType.dressing_room, 18, SPORTPARK),
        ("Kleedkamer 2", ResourceType.dressing_room, 18, SPORTPARK),
        ("Kantine / Vergaderzaal", ResourceType.room, 40, SPORTPARK),
    ]
    resources: dict[str, Resource] = {}
    for name, rtype, cap, loc in resource_specs:
        existing = await db.execute(select(Resource).where(Resource.name == name))
        r = existing.scalar_one_or_none()
        if not r:
            r = Resource(name=name, type=rtype, capacity=cap, location=loc)
            db.add(r)
            await db.flush()
        else:
            r.location = loc  # refresh the address that drives home-activity locations
        resources[name] = r

    # --- Teams across the club ---
    eerste = await _get_or_create_team(
        db, name="Eerste Ploeg", season="2025/26", category="Heren"
    )
    beloften = await _get_or_create_team(
        db, name="Beloften", season="2025/26", category="Heren"
    )
    u17 = await _get_or_create_team(
        db, name="U17", season="2025/26", category="Jeugd"
    )
    dames = await _get_or_create_team(
        db, name="Dames", season="2025/26", category="Dames"
    )

    # --- Staff ---
    koen = await _get_or_create_user(
        db, email="koen@ksvjabbeke.be", full_name="Koen Vandenberghe",
        role=UserRole.trainer, password=DEMO_PASSWORD,
    )
    bart = await _get_or_create_user(
        db, email="bart@ksvjabbeke.be", full_name="Bart Vlietinck",
        role=UserRole.trainer, password=DEMO_PASSWORD,
    )
    niels = await _get_or_create_user(
        db, email="niels@ksvjabbeke.be", full_name="Niels Ramboer",
        role=UserRole.trainer, password=DEMO_PASSWORD,
    )
    lien = await _get_or_create_user(
        db, email="lien@ksvjabbeke.be", full_name="Lien Decloedt",
        role=UserRole.trainer, password=DEMO_PASSWORD,
    )
    await _ensure_membership(db, eerste, koen, MembershipRole.trainer)
    await _ensure_membership(db, beloften, bart, MembershipRole.trainer)
    await _ensure_membership(db, u17, niels, MembershipRole.trainer)
    await _ensure_membership(db, dames, lien, MembershipRole.trainer)

    # --- Eerste Ploeg squad ---
    squad = [
        ("wout@ksvjabbeke.be", "Wout Decadt", 1, "Doel"),
        ("senne@ksvjabbeke.be", "Senne Vanhecke", 2, "Verdediger"),
        ("lars@ksvjabbeke.be", "Lars De Meyer", 3, "Verdediger"),
        ("jens@ksvjabbeke.be", "Jens Verhaeghe", 4, "Verdediger"),
        ("ward@ksvjabbeke.be", "Ward Coucke", 5, "Verdediger"),
        ("thibault@ksvjabbeke.be", "Thibault Maes", 6, "Middenvelder"),
        ("arne@ksvjabbeke.be", "Arne Dewulf", 8, "Middenvelder"),
        ("seppe@ksvjabbeke.be", "Seppe Claeys", 10, "Middenvelder"),
        ("milan@ksvjabbeke.be", "Milan Depoorter", 7, "Aanvaller"),
        ("brecht@ksvjabbeke.be", "Brecht Vermeulen", 9, "Aanvaller"),
        ("robbe@ksvjabbeke.be", "Robbe Lievens", 11, "Aanvaller"),
    ]
    players: list[User] = []
    for email, name, number, position in squad:
        p = await _get_or_create_user(
            db, email=email, full_name=name, role=UserRole.player,
            password=DEMO_PASSWORD,
        )
        await _ensure_membership(
            db, eerste, p, MembershipRole.player, number=number, position=position
        )
        players.append(p)

    # A couple of Beloften players too, for realism.
    for email, name, number in [
        ("lowie@ksvjabbeke.be", "Lowie Vanden Bussche", 14),
        ("vince@ksvjabbeke.be", "Vince Tytgat", 17),
    ]:
        p = await _get_or_create_user(
            db, email=email, full_name=name, role=UserRole.player,
            password=DEMO_PASSWORD,
        )
        await _ensure_membership(db, beloften, p, MembershipRole.player, number=number)

    # Call-up link: the Eerste Ploeg may select players from the Beloften.
    link_exists = await db.execute(
        select(TeamFeeder).where(
            TeamFeeder.team_id == eerste.id,
            TeamFeeder.feeder_team_id == beloften.id,
        )
    )
    if not link_exists.scalar_one_or_none():
        db.add(TeamFeeder(team_id=eerste.id, feeder_team_id=beloften.id))

    # Eerste Ploeg's home dressing room (reserved automatically; opponents get a
    # free room such as Kleedkamer 2 for home matches).
    tdr_exists = await db.execute(
        select(TeamDressingRoom).where(TeamDressingRoom.team_id == eerste.id)
    )
    if not tdr_exists.scalar_one_or_none():
        db.add(
            TeamDressingRoom(
                team_id=eerste.id, resource_id=resources["Kleedkamer 1"].id
            )
        )

    await db.flush()

    # --- Activities for the Eerste Ploeg (only if none exist) ---
    result = await db.execute(select(Activity).where(Activity.team_id == eerste.id))
    if not result.scalars().first():
        base = datetime.now(timezone.utc)
        training_tue = _next_weekday(base, 1, 19, 30)   # Tuesday 19:30
        training_thu = _next_weekday(base, 3, 19, 30)   # Thursday 19:30
        matchday = _next_weekday(base, 6, 15, 0)        # Sunday 15:00
        meeting = matchday.replace(hour=13, minute=30)  # pre-match briefing

        dinsdag = Activity(
            team_id=eerste.id, type=ActivityType.training,
            title="Dinsdagtraining",
            description="Algemene training. Iedereen aanwezig om 19u15.",
            start_time=training_tue, end_time=training_tue + timedelta(hours=1, minutes=30),
            location_text=SPORTPARK, created_by_id=koen.id,
        )
        donderdag = Activity(
            team_id=eerste.id, type=ActivityType.training,
            title="Donderdagtraining",
            description="Laatste training voor de wedstrijd.",
            start_time=training_thu, end_time=training_thu + timedelta(hours=1, minutes=30),
            location_text=SPORTPARK, created_by_id=koen.id,
        )
        bespreking = Activity(
            team_id=eerste.id, type=ActivityType.meeting,
            title="Tactische bespreking",
            description="Wedstrijdvoorbereiding tegen SK Varsenare.",
            start_time=meeting, end_time=meeting + timedelta(hours=1),
            location_text="Kantine / Vergaderzaal", created_by_id=koen.id,
        )
        wedstrijd = Activity(
            team_id=eerste.id, type=ActivityType.match,
            title="Competitie: KSV Jabbeke – SK Varsenare",
            description="Thuiswedstrijd. Verzamelen 1u30 voor aftrap.",
            opponent="SK Varsenare", home_away=None,
            start_time=matchday, end_time=matchday + timedelta(hours=1, minutes=45),
            location_text=SPORTPARK, created_by_id=koen.id,
        )
        # A past away match, so performance ratings show a trend over two games.
        prev_match = matchday - timedelta(days=7)
        vorige = Activity(
            team_id=eerste.id, type=ActivityType.match,
            title="Competitie: KSC Blankenberge – KSV Jabbeke",
            description="Uitwedstrijd, vorige speeldag.",
            opponent="KSC Blankenberge", home_away=None,
            start_time=prev_match, end_time=prev_match + timedelta(hours=1, minutes=45),
            location_text="Sportpark De Kluiten, Blankenberge", created_by_id=koen.id,
        )
        db.add_all([dinsdag, donderdag, bespreking, wedstrijd, vorige])
        await db.flush()
        # Belgian football: home/away enum lives on the model; set it explicitly.
        # The home trainings and the home match all take place at Sportpark Jabbeke.
        from app.models import HomeAway

        dinsdag.home_away = HomeAway.home
        donderdag.home_away = HomeAway.home
        wedstrijd.home_away = HomeAway.home
        vorige.home_away = HomeAway.away

        # Resource bookings
        db.add(ResourceBooking(activity_id=dinsdag.id,
                               resource_id=resources["Terrein B (training)"].id))
        db.add(ResourceBooking(activity_id=donderdag.id,
                               resource_id=resources["Terrein B (training)"].id))
        db.add(ResourceBooking(activity_id=bespreking.id,
                               resource_id=resources["Kantine / Vergaderzaal"].id))
        db.add(ResourceBooking(activity_id=wedstrijd.id,
                               resource_id=resources["Hoofdterrein"].id))
        db.add(ResourceBooking(activity_id=wedstrijd.id,
                               resource_id=resources["Kleedkamer 1"].id))   # home
        db.add(ResourceBooking(activity_id=wedstrijd.id,
                               resource_id=resources["Kleedkamer 2"].id))   # opponent

        # Availability: trainings & meeting -> availability only (no selection).
        for activity in (dinsdag, donderdag, bespreking):
            for i, p in enumerate(players):
                db.add(
                    Availability(
                        activity_id=activity.id, user_id=p.id,
                        status=(
                            AvailabilityStatus.available if i % 3 != 0
                            else AvailabilityStatus.unknown
                        ),
                    )
                )
        # Matches -> availability + a selected matchday squad of 11.
        for match in (wedstrijd, vorige):
            for i, p in enumerate(players):
                db.add(
                    Availability(
                        activity_id=match.id, user_id=p.id,
                        status=(
                            AvailabilityStatus.unavailable if i == 10
                            else AvailabilityStatus.available
                        ),
                        selected=(i < 11 and i != 10),
                    )
                )

        # Performance ratings (trainer-only, matches only). The past match is
        # rated; rating both games gives a visible trend. Players never see these.
        for i, p in enumerate(players):
            if i >= 11 or i == 10:  # only the selected matchday squad
                continue
            db.add(
                PlayerPerformance(
                    activity_id=vorige.id, user_id=p.id,
                    performance_rating=2 + (i % 4),              # 2..5
                    mentality_rating=3 + (i % 3),                # 3..5
                    rated_by_id=koen.id,
                )
            )
            db.add(
                PlayerPerformance(
                    activity_id=wedstrijd.id, user_id=p.id,
                    performance_rating=3 + (i % 3),              # 3..5
                    mentality_rating=3 + ((i + 1) % 3),          # 3..5
                    rated_by_id=koen.id,
                    note="Sterke partij, veel inzet." if i == 9 else None,
                )
            )

    print("  club:    KSV Jabbeke")
    print(f"  teams:   Eerste Ploeg ({len(players)} spelers), Beloften, U17, Dames")
    print("  trainer login: koen@ksvjabbeke.be / " + DEMO_PASSWORD)
    print("  speler login:  wout@ksvjabbeke.be / " + DEMO_PASSWORD)


async def main(demo: bool) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        print("Seeding database...")
        await seed_admin(db)
        if demo:
            await seed_demo(db)
        await db.commit()
    await engine.dispose()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main(demo="--demo" in sys.argv))
