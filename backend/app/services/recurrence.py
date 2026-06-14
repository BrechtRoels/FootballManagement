"""Pure helpers for generating and editing recurring activity occurrences.

These functions are deliberately DB-free and side-effect-free so they can be
unit-tested in isolation. The orchestration (creating rows, conflict checks,
notifications) lives in the activities route, which composes these helpers with
the scheduling/notification services.

DST note: a weekly series must step by *wall-clock time-of-day* in the club's
local zone, not by adding a fixed UTC offset. Adding ``timedelta(weeks=...)`` to
a UTC instant would make an 18:00 session drift to 17:00 or 19:00 across a DST
boundary. We therefore recompose each occurrence from its local date + local
time and convert back to UTC.
"""

from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from app.core.config import settings

# Hard cap on how many weeks to scan, a safety net independent of the spec's own
# occurrence cap (e.g. an `until` far in the future with sparse weekdays).
_MAX_WEEKS = 600


def get_club_tz() -> ZoneInfo:
    """The club's configured local timezone."""
    return ZoneInfo(settings.club_timezone)


def local_hms(dt_utc: datetime, *, tz: ZoneInfo) -> tuple[int, int, int]:
    """Local (hour, minute, second) of a UTC-aware datetime."""
    local = dt_utc.astimezone(tz)
    return local.hour, local.minute, local.second


def shift_to_local_time_of_day(
    dt_utc: datetime, *, hour: int, minute: int, second: int, tz: ZoneInfo
) -> datetime:
    """Return a UTC datetime on the same *local date* as ``dt_utc`` but at the
    given local time-of-day. Used to retime series siblings while preserving
    each one's own calendar date."""
    local_date = dt_utc.astimezone(tz).date()
    naive = datetime.combine(local_date, time(hour, minute, second))
    return naive.replace(tzinfo=tz).astimezone(timezone.utc)


def generate_occurrences(
    spec,
    first_start: datetime,
    first_end: datetime,
    *,
    tz: ZoneInfo,
    cap: int = 200,
) -> list[tuple[datetime, datetime]]:
    """Generate (start, end) UTC pairs for a weekly recurrence.

    ``first_start``/``first_end`` define the time-of-day and duration; the local
    date of ``first_start`` is the series anchor. Occurrences are generated
    strictly by the rule (the anchor's own weekday is only included if it is in
    ``spec.days_of_week``). Bounded by ``spec.until`` (inclusive) or
    ``spec.count``, and never exceeds ``cap``.
    """
    duration = first_end - first_start
    local_start = first_start.astimezone(tz)
    anchor_date = local_start.date()
    hour, minute, second = local_start.hour, local_start.minute, local_start.second

    # Monday of the anchor's calendar week; weeks step by `interval` from here.
    week_monday = anchor_date - timedelta(days=anchor_date.weekday())
    target_weekdays = sorted(set(spec.days_of_week))

    results: list[tuple[datetime, datetime]] = []
    for week_index in range(_MAX_WEEKS):
        block_monday = week_monday + timedelta(weeks=week_index * spec.interval)
        for weekday in target_weekdays:
            occ_date = block_monday + timedelta(days=weekday)
            if occ_date < anchor_date:
                continue
            if spec.until is not None and occ_date > spec.until:
                return results
            naive = datetime.combine(occ_date, time(hour, minute, second))
            start_utc = naive.replace(tzinfo=tz).astimezone(timezone.utc)
            results.append((start_utc, start_utc + duration))
            if spec.count is not None and len(results) >= spec.count:
                return results
            if len(results) >= cap:
                return results
    return results
