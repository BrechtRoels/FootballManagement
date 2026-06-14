from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import is_serverless, settings
from app.core.database import Base, engine

# Import models so they are registered on the metadata before create_all.
import app.models  # noqa: F401,E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    # The schema is created once by `python -m app.seed`. For a persistent server
    # / local dev we also create any missing tables on startup as a convenience.
    # On serverless (Vercel/Lambda) this is skipped, and either way it is wrapped
    # so a startup DB hiccup can never crash the function (which would make every
    # route fail). For ongoing schema changes, switch to Alembic (see README).
    if not is_serverless():
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
                # create_all never adds columns to existing tables, so apply
                # additive migrations idempotently here. No-op once applied.
                # (On serverless this whole block is skipped — run the same
                # statements manually on the managed DB before deploying.)
                await conn.exec_driver_sql(
                    "ALTER TABLE activities "
                    "ADD COLUMN IF NOT EXISTS series_id uuid"
                )
                await conn.exec_driver_sql(
                    "CREATE INDEX IF NOT EXISTS ix_activities_series_id "
                    "ON activities (series_id)"
                )
        except Exception as exc:  # noqa: BLE001
            print(f"[startup] skipped create_all: {exc}")
    yield
    try:
        await engine.dispose()
    except Exception:  # noqa: BLE001
        pass


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
