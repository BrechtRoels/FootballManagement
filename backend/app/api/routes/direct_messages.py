import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import DirectMessage, Notification, NotificationType, User
from app.repositories import users as user_repo
from app.schemas.direct_message import (
    ContactOut,
    DirectMessageCreate,
    DirectMessageOut,
)
from app.schemas.user import UserOut
from app.services.access import can_dm, get_contactable_user_ids
from app.services.push import send_push_to_users

router = APIRouter(prefix="/dm", tags=["direct-messages"])


def _pair(a: uuid.UUID, b: uuid.UUID):
    """SQL filter matching messages exchanged between users a and b."""
    return or_(
        and_(DirectMessage.sender_id == a, DirectMessage.recipient_id == b),
        and_(DirectMessage.sender_id == b, DirectMessage.recipient_id == a),
    )


@router.get("/contacts", response_model=list[ContactOut])
async def list_contacts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    contact_ids = await get_contactable_user_ids(db, current_user)
    if not contact_ids:
        return []

    users = (
        await db.execute(select(User).where(User.id.in_(contact_ids)))
    ).scalars().all()

    # Unread counts grouped by the person who sent them.
    unread_rows = await db.execute(
        select(DirectMessage.sender_id, func.count())
        .where(
            DirectMessage.recipient_id == current_user.id,
            DirectMessage.read_at.is_(None),
        )
        .group_by(DirectMessage.sender_id)
    )
    unread = {row[0]: row[1] for row in unread_rows.all()}

    # Most recent message per peer (scan a bounded recent window).
    recent = (
        await db.execute(
            select(DirectMessage)
            .where(
                or_(
                    DirectMessage.sender_id == current_user.id,
                    DirectMessage.recipient_id == current_user.id,
                )
            )
            .order_by(DirectMessage.created_at.desc())
            .limit(500)
        )
    ).scalars().all()

    last_by_peer: dict[uuid.UUID, DirectMessage] = {}
    for m in recent:
        peer = m.recipient_id if m.sender_id == current_user.id else m.sender_id
        if peer not in last_by_peer:
            last_by_peer[peer] = m

    contacts: list[ContactOut] = []
    for u in users:
        last = last_by_peer.get(u.id)
        contacts.append(
            ContactOut(
                user=UserOut.model_validate(u),
                last_message=last.body if last else None,
                last_message_at=last.created_at if last else None,
                last_from_me=bool(last and last.sender_id == current_user.id),
                unread_count=unread.get(u.id, 0),
            )
        )

    contacts.sort(
        key=lambda c: (
            c.last_message_at is None,  # people with history first
            -(c.last_message_at.timestamp() if c.last_message_at else 0),
            c.user.full_name.lower(),
        )
    )
    return contacts


@router.get("/unread-count")
async def unread_count(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(func.count()).where(
            DirectMessage.recipient_id == current_user.id,
            DirectMessage.read_at.is_(None),
        )
    )
    return {"count": result.scalar_one()}


@router.get("/conversation/{user_id}", response_model=list[DirectMessageOut])
async def get_conversation(
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not await can_dm(db, current_user, user_id):
        raise HTTPException(
            status_code=403, detail="You cannot message this person"
        )

    result = await db.execute(
        select(DirectMessage)
        .where(_pair(current_user.id, user_id))
        .order_by(DirectMessage.created_at.asc())
    )
    messages = result.scalars().all()

    # Mark messages they sent us as read. synchronize_session=False keeps the
    # already-loaded rows from being expired (which would trigger a lazy reload
    # during response serialization, outside the async greenlet).
    await db.execute(
        update(DirectMessage)
        .where(
            DirectMessage.sender_id == user_id,
            DirectMessage.recipient_id == current_user.id,
            DirectMessage.read_at.is_(None),
        )
        .values(read_at=func.now())
        .execution_options(synchronize_session=False)
    )
    return messages


@router.post(
    "/conversation/{user_id}",
    response_model=DirectMessageOut,
    status_code=status.HTTP_201_CREATED,
)
async def send_direct_message(
    user_id: uuid.UUID,
    payload: DirectMessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not await can_dm(db, current_user, user_id):
        raise HTTPException(
            status_code=403, detail="You cannot message this person"
        )
    recipient = await user_repo.get_by_id(db, user_id)
    if not recipient or not recipient.is_active:
        raise HTTPException(status_code=404, detail="Recipient not found")

    message = DirectMessage(
        sender_id=current_user.id,
        recipient_id=user_id,
        body=payload.body,
    )
    db.add(message)

    preview = payload.body if len(payload.body) <= 80 else payload.body[:77] + "…"
    title = f"Message from {current_user.full_name}"
    db.add(
        Notification(
            user_id=user_id,
            type=NotificationType.message,
            title=title,
            body=preview,
        )
    )
    await send_push_to_users(db, [user_id], title=title, body=preview, url="/messages")

    await db.flush()
    await db.refresh(message)
    return message
