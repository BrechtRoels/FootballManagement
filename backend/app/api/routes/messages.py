import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import Message, User
from app.schemas.message import MessageCreate, MessageOut
from app.services.access import is_team_member

router = APIRouter(prefix="/teams/{team_id}/messages", tags=["messages"])


@router.get("", response_model=list[MessageOut])
async def list_messages(
    team_id: uuid.UUID,
    limit: int = Query(default=100, le=300),
    before: uuid.UUID | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not await is_team_member(db, current_user, team_id):
        raise HTTPException(status_code=403, detail="Not a member of this team")
    stmt = (
        select(Message)
        .where(Message.team_id == team_id)
        .options(selectinload(Message.sender))
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    messages = list(result.scalars().all())
    messages.reverse()  # return chronological order
    return messages


@router.post("", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
async def post_message(
    team_id: uuid.UUID,
    payload: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not await is_team_member(db, current_user, team_id):
        raise HTTPException(status_code=403, detail="Not a member of this team")
    message = Message(
        team_id=team_id, sender_id=current_user.id, body=payload.body
    )
    db.add(message)
    await db.flush()
    result = await db.execute(
        select(Message)
        .where(Message.id == message.id)
        .options(selectinload(Message.sender))
    )
    return result.scalar_one()
