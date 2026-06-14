"""Address lookup / validation via OpenStreetMap Nominatim.

Used to turn a typed address (or an opponent's town) into a verified,
map-routable place. Kept dependency-light: stdlib urllib run in a worker thread
(so the event loop never blocks), with certifi for the CA bundle. Results are
cached per query and the feature degrades to an empty list on any failure, so a
geocoder outage never blocks scheduling.
"""

import asyncio
import json
import ssl
import urllib.parse
import urllib.request
from functools import lru_cache

import certifi

from app.schemas.geocode import GeocodeResult

_NOMINATIM = "https://nominatim.openstreetmap.org/search"
# Nominatim's usage policy requires an identifying User-Agent.
_USER_AGENT = "KSVJabbekeClubManager/1.0 (https://ksvjabbeke.be)"
_SSL_CTX = ssl.create_default_context(cafile=certifi.where())


@lru_cache(maxsize=512)
def _fetch(query: str, limit: int) -> str:
    params = urllib.parse.urlencode(
        {
            "q": query,
            "format": "jsonv2",
            "limit": str(limit),
            "addressdetails": "1",
        }
    )
    req = urllib.request.Request(
        f"{_NOMINATIM}?{params}", headers={"User-Agent": _USER_AGENT}
    )
    with urllib.request.urlopen(req, timeout=8, context=_SSL_CTX) as resp:
        return resp.read().decode("utf-8")


async def geocode_search(query: str, *, limit: int = 5) -> list[GeocodeResult]:
    query = " ".join(query.split())  # normalise whitespace
    if len(query) < 3:
        return []
    try:
        raw = await asyncio.to_thread(_fetch, query, limit)
        items = json.loads(raw)
    except Exception:
        # Network/timeout/parse failure: advisory feature, return nothing.
        return []
    out: list[GeocodeResult] = []
    for it in items:
        try:
            out.append(
                GeocodeResult(
                    display_name=it["display_name"],
                    lat=float(it["lat"]),
                    lon=float(it["lon"]),
                    category=it.get("category"),
                    type=it.get("type"),
                )
            )
        except (KeyError, ValueError, TypeError):
            continue
    return out


async def geocode_multi(
    queries: list[str], *, per_query: int = 5, total: int = 8
) -> list[GeocodeResult]:
    """Run several queries (e.g. a club name and its town) and merge unique
    places, preserving query order so the most specific match comes first.

    Queries run sequentially to respect Nominatim's fair-use rate limit; the
    per-query lru cache makes repeats free.
    """
    seen: set[tuple[float, float]] = set()
    out: list[GeocodeResult] = []
    for q in queries:
        for r in await geocode_search(q, limit=per_query):
            key = (round(r.lat, 4), round(r.lon, 4))
            if key in seen:
                continue
            seen.add(key)
            out.append(r)
            if len(out) >= total:
                return out
    return out
