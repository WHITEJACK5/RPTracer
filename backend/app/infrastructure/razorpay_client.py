"""Razorpay client — thin, safe wrapper around webhook verification.

The full Razorpay SDK is NOT required for the risk engine. This module exposes
the single operation we depend on (HMAC-SHA256 signature verification) using the
configured ``RAZORPAY_WEBHOOK_SECRET`` and constant-time comparison. If no
secret is configured it degrades to a no-op signal so local dev keeps working.
"""
from __future__ import annotations

from backend.app.core.config import RAZORPAY_WEBHOOK_SECRET
from backend.app.core.security import verify_signature


def verify_webhook_signature(raw: bytes, signature: str | None) -> bool:
    """Constant-time HMAC verification against the configured secret."""
    return verify_signature(raw, RAZORPAY_WEBHOOK_SECRET or "", signature)


def is_secret_configured() -> bool:
    return bool(RAZORPAY_WEBHOOK_SECRET)
