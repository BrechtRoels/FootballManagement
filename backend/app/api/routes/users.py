import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin
from app.core.database import get_db
from app.core.security import hash_password
from app.models import MembershipRole, Team, TeamMembership, User, UserRole
from app.repositories import users as user_repo
from app.schemas.user import (
    UserCreate,
    UserCreatedOut,
    UserOut,
    UserUpdate,
)

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserOut])
async def list_users(
    role: UserRole | None = Query(default=None),
    search: str | None = Query(default=None),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(User).order_by(User.full_name)
    if role is not None:
        stmt = stmt.where(User.role == role)
    if search:
        like = f"%{search.lower()}%"
        stmt = stmt.where(User.full_name.ilike(like) | User.email.ilike(like))
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=UserCreatedOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin creates a player/trainer/admin account.

    If no password is supplied a temporary one is generated and returned once.
    """
    existing = await user_repo.get_by_email(db, payload.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        )

    # A player must be assigned to a team at creation time.
    if payload.role == UserRole.player and payload.team_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A player must be assigned to a team",
        )

    # Validate the team up front (so we don't create an orphaned account).
    team: Team | None = None
    if payload.team_id is not None and payload.role != UserRole.admin:
        team = await db.get(Team, payload.team_id)
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")

    temp_password: str | None = None
    raw_password = payload.password
    if not raw_password:
        raw_password = secrets.token_urlsafe(9)
        temp_password = raw_password

    user = User(
        email=payload.email.lower(),
        full_name=payload.full_name,
        phone=payload.phone,
        role=payload.role,
        password_hash=hash_password(raw_password),
    )
    db.add(user)
    await db.flush()

    if team is not None:
        membership_role = (
            MembershipRole.trainer
            if payload.role == UserRole.trainer
            else MembershipRole.player
        )
        db.add(
            TeamMembership(
                team_id=team.id,
                user_id=user.id,
                role=membership_role,
                shirt_number=payload.shirt_number,
                position=payload.position,
            )
        )
        await db.flush()

    await db.refresh(user)
    return UserCreatedOut(
        user=UserOut.model_validate(user), temporary_password=temp_password
    )


@router.get("/{user_id}", response_model=UserOut)
async def get_user(
    user_id: uuid.UUID,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    user = await user_repo.get_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: uuid.UUID,
    payload: UserUpdate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    user = await user_repo.get_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(user, field, value)
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@router.post("/{user_id}/reset-password", response_model=UserCreatedOut)
async def reset_password(
    user_id: uuid.UUID,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    user = await user_repo.get_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    temp_password = secrets.token_urlsafe(9)
    user.password_hash = hash_password(temp_password)
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return UserCreatedOut(
        user=UserOut.model_validate(user), temporary_password=temp_password
    )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: uuid.UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own account",
        )
    user = await user_repo.get_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.delete(user)
