import enum


class UserRole(str, enum.Enum):
    admin = "admin"
    trainer = "trainer"
    player = "player"


class MembershipRole(str, enum.Enum):
    """Role a user holds within a specific team."""

    trainer = "trainer"
    player = "player"


class ActivityType(str, enum.Enum):
    training = "training"
    match = "match"
    meeting = "meeting"
    event = "event"


class ActivityStatus(str, enum.Enum):
    scheduled = "scheduled"
    cancelled = "cancelled"


class HomeAway(str, enum.Enum):
    home = "home"
    away = "away"


class ResourceType(str, enum.Enum):
    pitch = "pitch"
    dressing_room = "dressing_room"
    room = "room"
    other = "other"


class AvailabilityStatus(str, enum.Enum):
    unknown = "unknown"
    available = "available"
    unavailable = "unavailable"
    maybe = "maybe"


class NotificationType(str, enum.Enum):
    activity_created = "activity_created"
    activity_cancelled = "activity_cancelled"
    activity_updated = "activity_updated"
    selected = "selected"
    message = "message"
    general = "general"
