from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.core.database import Base, engine

# Import models so they are registered on the metadata before create_all.
import app.models  # noqa: F401,E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    # For the foundation we create tables on startup. For production-grade
    # schema management, switch to Alembic migrations (see README).
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(
    title="Club Manager API",
    version="0.1.0",
    description="Backend for the football club management platform.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health", tags=["meta"])
async def health():
    return {"status": "ok"}
