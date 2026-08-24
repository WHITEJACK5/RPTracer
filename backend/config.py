"""Backward-compat shim — real implementation lives in ``backend.app.core.config``.

Kept so existing import paths (tests, scripts) keep working after the
canonical restructure. Do not add new logic here.
"""
from backend.app.core.config import *  # noqa: F401,F403
from backend.app.core.config import (
    ConfigError,
    MODEL_PATH,
    MODEL_VERSION,
    PROJECT_ROOT,
    DATA_DIR,
    ARTIFACTS_DIR,
    LEDGER_PATH,
    REDIS_URL,
    NEO4J_URI,
    OPENAI_API_KEY,
    ANTHROPIC_API_KEY,
    LLM_MODEL,
    RAZORPAY_WEBHOOK_SECRET,
    REQUIRE_WEBHOOK_SECRET,
    IDEMPOTENCY_TTL_SECONDS,
    CORS_ORIGINS,
    band_for,
    settings,
)
