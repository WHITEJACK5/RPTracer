"""Security helpers: constant-time HMAC, prompt sanitization, Cypher guard.

These are the defensive primitives that keep attacker-controlled webhook and
graph payloads from hijacking the bounded agent or the (optional) Neo4j mirror.
"""
from __future__ import annotations

import hashlib
import hmac
import re
import unicodedata
from collections.abc import Mapping
from typing import Any

from backend.app.core.constants import SANITIZE_MAX_LEN

# Injection markers stripped from any text that could be echoed into an LLM
# prompt or a Cypher string template (case-insensitive).
_INJECTION_MARKERS = [
    r"ignore\s+(?:all|any|the\s+)?(?:above|previous|previous\s+instructions)",
    r"system\s*prompt",
    r"###",
    r"\{\{",
    r"\{%",
    r"<script",
    r"javascript:",
]
_INJECTION_RE = re.compile("|".join(_INJECTION_MARKERS), re.IGNORECASE)

# Zero-width / directional overrides that are invisible but carry instructions.
_ZERO_WIDTH = {"\u200b", "\u200c", "\u200d", "\u200e", "\u200f", "\ufeff"}
_CONTROL_ALLOWED = {"\n", "\t"}


def constant_time_compare(a: str, b: str) -> bool:
    """Constant-time string comparison (HMAC signatures, tokens)."""
    return hmac.compare_digest(a, b)


def verify_signature(raw: bytes, secret: str, signature: str | None) -> bool:
    """Constant-time HMAC-SHA256 verification for Razorpay webhooks.

    Returns ``False`` if no signature or no secret is supplied; callers decide
    whether that is a 401/403 based on their enforcement posture.
    """
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def sanitize_prompt(text: Any, max_len: int = SANITIZE_MAX_LEN) -> Any:
    """Neutralize prompt-injection / control-character carriers in a string.

    Applied to every attacker-influenced value before it can be echoed into an
    LLM prompt or a graph query. Strips:
      * zero-width / directional chars (U+200B–U+200F, U+FEFF),
      * control characters (0x00–0x1F) except ``\\n`` and ``\\t``,
      * known injection markers (ignore previous, system prompt, ``###``,
        ``{{``, ``{%``, ``<script``, ``javascript:``),
    then truncates to ``max_len`` characters.
    """
    if not isinstance(text, str):
        return text
    # Normalize compatibility equivalents so homoglyph tricks collapse.
    v = unicodedata.normalize("NFKC", text)
    # Drop zero-width / directional overrides.
    v = "".join(ch for ch in v if ch not in _ZERO_WIDTH)
    # Drop disallowed control characters.
    v = "".join(
        ch for ch in v
        if unicodedata.category(ch)[0] != "C" or ch in _CONTROL_ALLOWED
    )
    # Strip injection markers.
    v = _INJECTION_RE.sub("", v)
    return v[:max_len]


def guard_cypher_query(query: str, parameters: Mapping[str, Any]) -> str:
    """Ensure a Cypher statement is fully parameterized.

    Rejects bare brace / template interpolation and any ``$param`` reference
    that is missing from ``parameters``. Raises ``ValueError`` on violation so
    a malformed mirror write can never open an injection surface.
    """
    if "{{" in query or "{%" in query:
        raise ValueError("Cypher must not contain template interpolation")
    refs = set(re.findall(r"\$([A-Za-z_][A-Za-z0-9_]*)", query))
    missing = refs - set(parameters.keys())
    if missing:
        raise ValueError(f"Cypher references unbound parameters: {sorted(missing)}")
    return query
