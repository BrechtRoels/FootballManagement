from pydantic import BaseModel


class GeocodeResult(BaseModel):
    """One candidate place returned by the address lookup."""

    display_name: str
    lat: float
    lon: float
    category: str | None = None
    type: str | None = None
