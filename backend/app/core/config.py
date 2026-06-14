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

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_cors(cls, value):
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
