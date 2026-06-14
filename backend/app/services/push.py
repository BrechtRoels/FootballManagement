"""Send Web Push notifications to users' subscribed browsers.

Uses pywebpush (VAPID). Network sends run in a thread so they don't block the
event loop. Subscriptions the push service reports as gone (404/410) are pruned.
If VAPID isn't configured the functions are a no-op, so the app works without it.
"""

import asyncio
import json
import uuid

from py_vapid import Vapid01
from pywebpush import WebPushException, webpush
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.push_subscription import PushSubscription

# pywebpush won't accept a PKCS8 PEM string inline; it wants a Vapid instance
# (or a file path). Build it once from the configured key.
_vapid: Vapid01 | None = None


def _get_vapid() -> Vapid01:
    global _vapid
    if _vapid is None:
        _vapid = Vapid01.from_pem(settings.vapid_private_key.encode())
    return _vapid


def _send_one(sub: PushSubscription, payload: str) -> int | None:
    """Blocking send to a single subscription. Returns an HTTP status to prune
    on (404/410), or None. Runs inside a worker thread."""
    try:
        webpush(
            subscription_info={
                "endpoint": sub.endpoint,
                "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
            },
            data=payload,
            vapid_private_key=_get_vapid(),
            # Fresh claims dict per call: pywebpush mutates it (adds exp/aud).
            vapid_claims={"sub": settings.vapid_subject},
            timeout=10,
        )
        return None
    except WebPushException as exc:
        status = getattr(exc.response, "status_code", None)
        return status if status in (404, 410) else None
    except Exception:  # noqa: BLE001 - never let a push failure break the request
        return None


async def send_push_to_users(
    db: AsyncSession,
    user_ids,
    *,
    title: str,
    body: str | None = None,
    url: str = "/",
) -> None:
    """Push a notification to every browser subscribed by the given users."""
    ids = [u for u in set(user_ids) if u is not None]
    if not ids or not settings.push_enabled:
        return

    subs = (
        await db.execute(
            select(PushSubscription).where(PushSubscription.user_id.in_(ids))
        )
    ).scalars().all()
    if not subs:
        return

    payload = json.dumps({"title": title, "body": body, "url": url})
    results = await asyncio.gather(
        *(asyncio.to_thread(_send_one, sub, payload) for sub in subs)
    )

    stale = [sub.id for sub, status in zip(subs, results) if status is not None]
    if stale:
        await db.execute(
            delete(PushSubscription).where(PushSubscription.id.in_(stale))
        )


def activity_url(related_activity_id: uuid.UUID | None) -> str:
    """Deep-link for a notification that references an activity."""
    return f"/activities/{related_activity_id}" if related_activity_id else "/"
