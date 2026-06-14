import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import ResourceType


class ResourceBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    type: ResourceType
    capacity: int | None = None
    location: str | None = None


class ResourceCreate(ResourceBase):
    pass


class ResourceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    type: ResourceType | None = None
    capacity: int | None = None
    location: str | None = None


class ResourceOut(ResourceBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
