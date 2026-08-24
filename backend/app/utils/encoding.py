"""Shared encoding / redaction helpers.

These are intentionally dependency-free so they can be imported anywhere in the
backend without risk of import cycles.
"""
from __future__ import annotations

import hashlib


def short_hash(value: str) -> str:
    """Return a stable 16-char hex digest of ``value`` (used for alert ids)."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


def redact_secret(value: str | None, visible: int = 4) -> str:
    """Mask a secret, keeping a few leading/trailing chars for debugging.

    Empty/None returns ``""``; very short secrets are fully masked.
    """
    if not value:
        return ""
    if len(value) <= visible * 2:
        return "*" * len(value)
    return value[:visible] + "*" * (len(value) - visible * 2) + value[-visible:]
