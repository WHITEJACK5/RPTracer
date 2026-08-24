"""Pydantic Settings — single strict source of configuration for TRACER.

Everything that used to be read via ``os.getenv`` in ``backend.config`` now
flows through one validated :class:`Settings` instance. The platform still
boots with **zero** external services: Redis / Neo4j / LLM keys are optional
and every integration degrades gracefully when unset or unreachable.

Strictness
----------
* ``ENVIRONMENT=production`` enforces ``RAZORPAY_WEBHOOK_SECRET >= 32`` chars;
  misconfiguration raises :class:`ConfigError` at import time (fail fast, never
  serve traffic with an unsafe posture).
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import Field, ValidationError, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from backend.app.core.constants import (
    BAND_APPROVE_MAX,
    BAND_STEPUP_MAX,
    DEFAULT_IDEMPOTENCY_TTL_SECONDS,
    DEFAULT_IP_LIMIT_PER_MIN,
    DEFAULT_MERCHANT_LIMIT_PER_MIN,
    FEATURE_STORE_TTL_SECONDS,
)

BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_DIR.parent
ARTIFACTS_DIR = PROJECT_ROOT / "backend" / "artifacts"
DATA_DIR = PROJECT_ROOT / "data"
LEDGER_PATH = DATA_DIR / "ledger.jsonl"
MODEL_PATH = ARTIFACTS_DIR / "risk_model.json"

MODEL_VERSION = "tracer-gbdt-1.0.0"
MODEL_TRAINING_DATE = "2026-01-15"


class ConfigError(RuntimeError):
    """Raised when configuration is invalid (e.g. weak webhook secret in prod)."""


class Settings(BaseSettings):
    """Validated application configuration.

    Environment variables map to field names uppercased with no global prefix,
    preserving the original / spec convention: ``REDIS_URL``, ``NEO4J_URI``,
    ``RAZORPAY_WEBHOOK_SECRET``, ``OPENAI_API_KEY``, ``ANTHROPIC_API_KEY``,
    ``ENVIRONMENT``, ``DOCS_ENABLED``, ``CORS_ORIGINS``, ``LLM_MODEL``,
    ``IDEMPOTENCY_TTL_SECONDS``, ``REQUIRE_WEBHOOK_SECRET``.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
    )

    environment: str = Field(default="development", description="development|staging|production")
    docs_enabled: bool = Field(default=True, description="Expose /docs and /openapi.json")
    cors_origins: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000",
        description="Comma separated allowed CORS origins (no wildcards).",
    )

    # --- Optional infrastructure (graceful fallbacks wired in code) ---------
    redis_url: str | None = Field(default=None, description="redis://host:port/db")
    neo4j_uri: str | None = Field(default=None, description="bolt://host:7687")
    neo4j_user: str | None = Field(default=None)
    neo4j_password: str | None = Field(default=None)
    openai_api_key: str | None = Field(default=None)
    anthropic_api_key: str | None = Field(default=None)
    llm_model: str = Field(default="gpt-4o-mini")
    anthropic_model: str = Field(default="claude-3-haiku-20240307")

    # --- Razorpay webhook posture -------------------------------------------
    razorpay_webhook_secret: str | None = Field(default=None)
    require_webhook_secret: bool = Field(default=False)

    # --- Idempotency / caching ----------------------------------------------
    idempotency_ttl_seconds: int = Field(default=DEFAULT_IDEMPOTENCY_TTL_SECONDS)
    feature_store_ttl_seconds: int = Field(default=FEATURE_STORE_TTL_SECONDS)

    # --- Rate limits (requests per minute) ----------------------------------
    rate_limit_ip_per_min: int = Field(default=DEFAULT_IP_LIMIT_PER_MIN)
    rate_limit_merchant_per_min: int = Field(default=DEFAULT_MERCHANT_LIMIT_PER_MIN)

    # --- Bounded-agent policy bands ----------------------------------------
    band_approve_max: int = Field(default=BAND_APPROVE_MAX)
    band_stepup_max: int = Field(default=BAND_STEPUP_MAX)

    # --- Observability ------------------------------------------------------
    log_json: bool = Field(default=False, description="Emit structlog JSON in prod")
    prometheus_namespace: str = Field(default="tracer")

    def cors_origin_list(self) -> list[str]:
        """Return CORS origins with no empty/ wildcard entries."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @field_validator("environment")
    @classmethod
    def _env_lower(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("cors_origins")
    @classmethod
    def _no_wildcard(cls, v: str) -> str:
        if "*" in v.split(","):
            raise ValueError("CORS origins must not contain '*' (use explicit hosts)")
        return v

    def model_post_init(self, _: Any) -> None:
        if self.environment == "production":
            secret = self.razorpay_webhook_secret
            if not secret or len(secret) < 32:
                raise ConfigError(
                    "RAZORPAY_WEBHOOK_SECRET must be >= 32 chars when "
                    "ENVIRONMENT=production (got "
                    f"{'unset' if not secret else str(len(secret)) + ' chars'})"
                )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached Settings instance — import-time validation once per process."""
    try:
        return Settings()
    except ValidationError as exc:  # pragma: no cover - defensive
        raise ConfigError(f"Invalid configuration: {exc}") from exc


# Module-level singleton used throughout the app.
settings = get_settings()


# --- Convenience re-exports (kept for drop-in compatibility) -----------------
MODEL_PATH = MODEL_PATH
LEDGER_PATH = LEDGER_PATH
DATA_DIR = DATA_DIR
ARTIFACTS_DIR = ARTIFACTS_DIR
PROJECT_ROOT = PROJECT_ROOT
MODEL_VERSION = MODEL_VERSION
MODEL_TRAINING_DATE = MODEL_TRAINING_DATE
REDIS_URL = settings.redis_url
NEO4J_URI = settings.neo4j_uri
OPENAI_API_KEY = settings.openai_api_key
ANTHROPIC_API_KEY = settings.anthropic_api_key
LLM_MODEL = settings.llm_model
RAZORPAY_WEBHOOK_SECRET = settings.razorpay_webhook_secret
REQUIRE_WEBHOOK_SECRET = settings.require_webhook_secret
IDEMPOTENCY_TTL_SECONDS = settings.idempotency_ttl_seconds
CORS_ORIGINS = settings.cors_origin_list()


def band_for(score: float) -> str:
    """Map a 0-100 risk score onto the canonical LOW / MEDIUM / HIGH band."""
    if score <= settings.band_approve_max:
        return "LOW"
    if score <= settings.band_stepup_max:
        return "MEDIUM"
    return "HIGH"
