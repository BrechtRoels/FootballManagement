"""Build iCalendar (.ics) feeds for calendar subscriptions."""

from datetime import datetime, timezone

from app.models import Activity, ActivityStatus, ActivityType


def _utc(dt: datetime) -> str:
    """datetime -> iCalendar UTC basic format, e.g. 20260614T150000Z."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _esc(text: str) -> str:
    """Escape a text value per RFC 5545."""
    return (
        text.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r", "")
        .replace("\n", "\\n")
    )


_TYPE_LABEL = {
    ActivityType.training: "Training",
    ActivityType.match: "Match",
    ActivityType.meeting: "Meeting",
    ActivityType.event: "Event",
}


def _event_lines(activity: Activity) -> list[str]:
    summary = activity.title
    team_name = activity.team.name if activity.team else None
    if team_name:
        summary = f"{summary} · {team_name}"

    desc_parts: list[str] = [_TYPE_LABEL.get(activity.type, activity.type.value)]
    if activity.opponent:
        desc_parts.append(f"vs {activity.opponent}")
    if activity.description:
        desc_parts.append(activity.description)
    description = " — ".join(desc_parts)

    lines = [
        "BEGIN:VEVENT",
        f"UID:{activity.id}@ksvjabbeke",
        f"DTSTAMP:{_utc(activity.created_at)}",
        f"DTSTART:{_utc(activity.start_time)}",
        f"DTEND:{_utc(activity.end_time)}",
        f"SUMMARY:{_esc(summary)}",
        f"DESCRIPTION:{_esc(description)}",
    ]
    if activity.location_text:
        lines.append(f"LOCATION:{_esc(activity.location_text)}")
    lines.append(
        "STATUS:"
        + (
            "CANCELLED"
            if activity.status == ActivityStatus.cancelled
            else "CONFIRMED"
        )
    )
    lines.append("END:VEVENT")
    return lines


def build_activity_feed(calendar_name: str, activities: list[Activity]) -> str:
    """A subscribable VCALENDAR. Calendar apps poll it and auto-update."""
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//KSV Jabbeke//Clubplatform//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_esc(calendar_name)}",
        "X-PUBLISHED-TTL:PT12H",
        "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
    ]
    for activity in activities:
        lines.extend(_event_lines(activity))
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"
