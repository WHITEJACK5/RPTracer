"""Lazy Redis client — never raises at boot.

Returns a connected ``redis.Redis`` or ``None`` when Redis is unconfigured or
unreachable. Callers MUST handle the ``None`` case with an in-process fallback.
"""
from __future__ import annotations

import redis  # optional dependency; imported lazily by callers too

from backend.app.core.config import settings

_client: redis.Redis | None = None
_available: bool | None = None


def get_redis() -> redis.Redis | None:
    """Return a Redis client, or ``None`` if Redis is absent/unreachable."""
    global _client, _available
    if not settings.redis_url:
        return None
    if _available is True and _client is not None:
        return _client
    if _available is False:
        return None
    try:
        c = redis.Redis.from_url(
            settings.redis_url, socket_connect_timeout=1, socket_timeout=1,
            decode_responses=False,
        )
        c.ping()
        _client, _available = c, True
        return _client
    except Exception:
        _available = False
        return None
