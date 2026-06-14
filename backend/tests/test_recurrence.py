"""Unit tests for the pure recurrence generator.

Runnable with pytest, or standalone: `python -m tests.test_recurrence`.
"""

from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from app.schemas.activity import RecurrenceSpec
from app.services.recurrence import (
    generate_occurrences,
    local_hms,
    shift_to_local_time_of_day,
)

TZ = ZoneInfo("Europe/Brussels")


def _at(year, month, day, hour, minute=0) -> datetime:
    """A UTC-aware datetime for a wall-clock time in the club timezone."""
    return datetime.combine(
        datetime(year, month, day).date(), time(hour, minute)
    ).replace(tzinfo=TZ).astimezone(timezone.utc)


def test_count_end_condition():
    start = _at(2025, 1, 7, 18)  # a Tuesday
    end = start + timedelta(hours=2)
    spec = RecurrenceSpec(days_of_week=[1], count=4)  # Tuesdays
    occ = generate_occurrences(spec, start, end, tz=TZ)
    assert len(occ) == 4
    # Each is a Tuesday, one week apart, 18:00 local, 2h long.
    for s, e in occ:
        assert s.astimezone(TZ).weekday() == 1
        assert local_hms(s, tz=TZ) == (18, 0, 0)
        assert e - s == timedelta(hours=2)
    assert occ[1][0] - occ[0][0] == timedelta(days=7)


def test_until_end_condition_inclusive():
    start = _at(2025, 1, 7, 18)  # Tuesday
    end = start + timedelta(hours=1)
    spec = RecurrenceSpec(days_of_week=[1], until=datetime(2025, 1, 28).date())
    occ = generate_occurrences(spec, start, end, tz=TZ)
    # Tuesdays 7, 14, 21, 28 Jan — until is inclusive.
    assert len(occ) == 4
    assert occ[-1][0].astimezone(TZ).date() == datetime(2025, 1, 28).date()


def test_multiple_weekdays_sorted():
    start = _at(2025, 1, 7, 18)  # Tuesday
    end = start + timedelta(hours=1)
    spec = RecurrenceSpec(days_of_week=[3, 1], count=4)  # Tue + Thu
    occ = generate_occurrences(spec, start, end, tz=TZ)
    weekdays = [s.astimezone(TZ).weekday() for s, _ in occ]
    # Tue, Thu, Tue, Thu — chronological regardless of input order.
    assert weekdays == [1, 3, 1, 3]


def test_interval_every_two_weeks():
    start = _at(2025, 1, 7, 18)  # Tuesday
    end = start + timedelta(hours=1)
    spec = RecurrenceSpec(days_of_week=[1], interval=2, count=3)
    occ = generate_occurrences(spec, start, end, tz=TZ)
    assert occ[1][0] - occ[0][0] == timedelta(days=14)
    assert occ[2][0] - occ[1][0] == timedelta(days=14)


def test_anchor_weekday_not_forced():
    # Anchor is a Tuesday but the rule only asks for Wednesdays — the first
    # occurrence must be the following Wednesday, not the Tuesday anchor.
    start = _at(2025, 1, 7, 18)  # Tuesday
    end = start + timedelta(hours=1)
    spec = RecurrenceSpec(days_of_week=[2], count=2)  # Wednesdays
    occ = generate_occurrences(spec, start, end, tz=TZ)
    assert occ[0][0].astimezone(TZ).date() == datetime(2025, 1, 8).date()


def test_dst_crossing_keeps_local_time():
    # Belgium falls back from CEST (+2) to CET (+1) on Sun 2025-10-26.
    # A Monday 18:00 series must stay 18:00 local on both sides — the UTC
    # instant shifts by one hour, which is the whole point.
    start = _at(2025, 10, 20, 18)  # Mon, still CEST
    end = start + timedelta(hours=2)
    spec = RecurrenceSpec(days_of_week=[0], count=2)  # Mondays
    occ = generate_occurrences(spec, start, end, tz=TZ)

    before, after = occ[0][0], occ[1][0]
    assert local_hms(before, tz=TZ) == (18, 0, 0)
    assert local_hms(after, tz=TZ) == (18, 0, 0)
    # CEST 18:00 -> 16:00Z ; CET 18:00 -> 17:00Z (a wall-clock-naive +7d would
    # have produced 16:00Z and broken the local time).
    assert before.hour == 16
    assert after.hour == 17


def test_shift_to_local_time_of_day_preserves_date():
    # 18:00 local on 2025-10-27 (CET) -> retime to 20:30 local, same date.
    original = _at(2025, 10, 27, 18)
    shifted = shift_to_local_time_of_day(original, hour=20, minute=30, second=0, tz=TZ)
    local = shifted.astimezone(TZ)
    assert local.date() == datetime(2025, 10, 27).date()
    assert (local.hour, local.minute) == (20, 30)


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn()
        print(f"ok  {fn.__name__}")
    print(f"\n{len(fns)} passed")
