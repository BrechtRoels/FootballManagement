import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin
from app.core.database import get_db
from app.models import Resource, User
from app.schemas.resource import ResourceCreate, ResourceOut, ResourceUpdate

router = APIRouter(prefix="/resources", tags=["resources"])


@router.get("", response_model=list[ResourceOut])
async def list_resources(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Resource).order_by(Resource.type, Resource.name))
    return result.scalars().all()


@router.post("", response_model=ResourceOut, status_code=status.HTTP_201_CREATED)
async def create_resource(
    payload: ResourceCreate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    resource = Resource(**payload.model_dump())
    db.add(resource)
    await db.flush()
    await db.refresh(resource)
    return resource


@router.patch("/{resource_id}", response_model=ResourceOut)
async def update_resource(
    resource_id: uuid.UUID,
    payload: ResourceUpdate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    resource = await db.get(Resource, resource_id)
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(resource, field, value)
    db.add(resource)
    await db.flush()
    await db.refresh(resource)
    return resource


@router.delete("/{resource_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resource(
    resource_id: uuid.UUID,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    resource = await db.get(Resource, resource_id)
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    await db.delete(resource)
