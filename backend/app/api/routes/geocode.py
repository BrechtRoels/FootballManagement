from fastapi import APIRouter, Depends, Query

from app.api.deps import get_current_user
from app.models import User
from app.schemas.geocode import GeocodeResult
from app.services.geocode import geocode_multi

router = APIRouter(prefix="/geocode", tags=["geocode"])


@router.get("", response_model=list[GeocodeResult])
async def geocode(
    q: list[str] = Query(..., description="One or more queries (address, club, town)"),
    _: User = Depends(get_current_user),
):
    """Search by address, club name and/or town. Pass several `q` values to look
    up a club by name AND by town in one call; verified candidates are merged
    with the most specific match first."""
    queries = [s.strip() for s in q if s and len(s.strip()) >= 2][:4]
    if not queries:
        return []
    return await geocode_multi(queries)
