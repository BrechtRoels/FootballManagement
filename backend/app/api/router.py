from fastapi import APIRouter

from app.api.routes import (
    activities,
    auth,
    calendar,
    direct_messages,
    geocode,
    messages,
    notifications,
    performance,
    resources,
    teams,
    users,
)

api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(teams.router)
api_router.include_router(resources.router)
api_router.include_router(activities.router)
api_router.include_router(messages.router)
api_router.include_router(direct_messages.router)
api_router.include_router(notifications.router)
api_router.include_router(calendar.router)
api_router.include_router(performance.router)
api_router.include_router(geocode.router)
