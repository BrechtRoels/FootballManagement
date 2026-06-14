import os
from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


def is_serverless() -> bool:
    """True when running on Vercel / AWS Lambda.

    Vercel's Python runtime executes on AWS Lambda, which always sets
    `AWS_LAMBDA_FUNCTION_NAME` — a more reliable signal than the `VERCEL` var,
    which isn't always exposed to the runtime.
    """
    return bool(os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"))


class Settings(BaseSettings):
    """Application configuration, loaded from environment / .env file."""

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # Database
    database_url: str = "postgresql+psycopg://football:football@localhost:5432/football"

    # Security
    secret_key: str = "change-me-please-generate-a-long-random-secret"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 480

    # The club's local timezone. Recurring activities step by wall-clock time in
    # this zone (so "18:00" stays 18:00 across DST), not by UTC offset.
    club_timezone: str = "Europe/Brussels"

    # First admin (used by the seed script)
    first_admin_email: str = "admin@ksvjabbeke.be"
    first_admin_password: str = "ChangeMe123!"
    first_admin_name: str = "KSV Jabbeke Secretariaat"

    # CORS (NoDecode: keep pydantic-settings from JSON-parsing the env value so
    # our comma-splitting validator below can handle "a,b,c" style lists)
    cors_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    # --- Web Push (VAPID). Empty keys disable push silently. ---
    vapid_subject: str = "mailto:admin@ksvjabbeke.be"
    vapid_public_key: str = ""
    vapid_private_key_b64: str = ""

    @property
    def vapid_private_key(self) -> str:
        """The private key PEM, decoded from its single-line base64 env form."""
        import base64

        if not self.vapid_private_key_b64:
            return ""
        return base64.b64decode(self.vapid_private_key_b64).decode()

    @property
    def push_enabled(self) -> bool:
        return bool(self.vapid_public_key and self.vapid_private_key_b64)

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_cors(cls, value):
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("database_url", mode="before")
    @classmethod
    def _normalise_db_url(cls, value):
        """Tolerate common copy/paste slips in the env value (surrounding quotes,
        whitespace/newlines, a `DATABASE_URL=` prefix) and accept a plain
        Supabase `postgresql://` string by selecting the psycopg driver."""
        if not isinstance(value, str):
            return value
        v = value.strip()
        # Drop an accidental `DATABASE_URL=` / `DATABASE_URL =` prefix.
        for prefix in ("DATABASE_URL=", "DATABASE_URL ="):
            if v.upper().startswith(prefix):
                v = v[len(prefix):].strip()
        v = v.strip().strip('"').strip("'").strip()  # surrounding quotes
        if v.startswith("postgresql://"):
            v = "postgresql+psycopg://" + v[len("postgresql://"):]
        elif v.startswith("postgres://"):
            v = "postgresql+psycopg://" + v[len("postgres://"):]
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
