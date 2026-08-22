"""Environment-driven configuration. Everything has a safe local default so
the platform boots with zero external services (Redis/Neo4j/LLM optional)."""
from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent

ARTIFACTS_DIR = PROJECT_ROOT / "backend" / "artifacts"
DATA_DIR = PROJECT_ROOT / "data"
LEDGER_PATH = DATA_DIR / "ledger.jsonl"
MODEL_PATH = ARTIFACTS_DIR / "risk_model.json"

MODEL_VERSION = "tracer-gbdt-1.0.0"

# --- Optional infrastructure (graceful fallbacks wired in code) -------------
REDIS_URL: str | None = os.getenv("TRACER_REDIS_URL")            # e.g. redis://localhost:6379/0
NEO4J_URI: str | None = os.getenv("TRACER_NEO4J_URI")            # e.g. bolt://localhost:7687
OPENAI_API_KEY: str | None = os.getenv("OPENAI_API_KEY")
ANTHROPIC_API_KEY: str | None = os.getenv("ANTHROPIC_API_KEY")
LLM_MODEL: str = os.getenv("TRACER_LLM_MODEL", "gpt-4o-mini")

RAZORPAY_WEBHOOK_SECRET: str | None = os.getenv("RAZORPAY_WEBHOOK_SECRET")

IDEMPOTENCY_TTL_SECONDS: int = int(os.getenv("TRACER_IDEMPOTENCY_TTL", "600"))

# --- Bounded agent policy bands ----------------------------------------------
BAND_APPROVE_MAX = 30     # 0-30   -> AUTO_APPROVE
BAND_STEPUP_MAX = 70      # 31-70  -> STEP_UP_AUTHENTICATION
                          # 71-100 -> PAUSE_PAYOUT + DISPUTE_DOSSIER

CORS_ORIGINS: list[str] = [
    o.strip() for o in os.getenv(
        "TRACER_CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",") if o.strip()
]


def band_for(score: float) -> str:
    if score <= BAND_APPROVE_MAX:
        return "LOW"
    if score <= BAND_STEPUP_MAX:
        return "MEDIUM"
    return "HIGH"
