"""Per-client rate limiting — sliding window by IP and by merchant_id.

In-memory, single-process by design. Production horizontal scaling would front
this with Redis; the engine degrades gracefully and still enforces a local
ceiling when Redis is unavailable. Defaults: 100 req/min per IP, 1000/min
per merchant (configurable via ``TRACER_RATE_LIMIT_*`` env vars).

On exceed the endpoint returns 429 with a ``Retry-After`` header.
"""
from __future__ import annotations

import time
from collections import deque
from typing import Any

from fastapi import HTTPException, Request
from starlette.status import HTTP_429_TOO_MANY_REQUESTS

from backend.app.core.config import settings
from backend.app.core.constants import DEFAULT_IP_LIMIT_PER_MIN, DEFAULT_MERCHANT_LIMIT_PER_MIN

_WINDOW_SECONDS = 60


class RateLimiter:
    def __init__(self) -> None:
        self.ip_max: int = settings.rate_limit_ip_per_min or DEFAULT_IP_LIMIT_PER_MIN
        self.merchant_max: int = (
            settings.rate_limit_merchant_per_min or DEFAULT_MERCHANT_LIMIT_PER_MIN)
        self._ip: dict[str, deque[float]] = {}
        self._merchant: dict[str, deque[float]] = {}

    def _allowed(self, store: dict[str, deque[float]], key: str, limit: int) -> bool:
        now = time.monotonic()
        buf = store.get(key)
        if buf is None:
            buf = deque()
            store[key] = buf
        while buf and buf[0] < now - _WINDOW_SECONDS:
            buf.popleft()
        if len(buf) >= limit:
            return False
        buf.append(now)
        return True

    def check(self, ip: str, merchant_id: str | None) -> bool:
        if not self._allowed(self._ip, ip, self.ip_max):
            return False
        if merchant_id is not None:
            return self._allowed(self._merchant, merchant_id, self.merchant_max)
        return True

    def reset(self) -> None:
        self._ip.clear()
        self._merchant.clear()


limiter = RateLimiter()


async def rate_limit(request: Request) -> None:
    """FastAPI dependency enforcing IP + merchant sliding-window limits."""
    ip = request.client.host if request.client else "unknown"
    merchant_id: str | None = None
    if request.method == "POST":
        ctype = request.headers.get("content-type", "")
        if "application/json" in ctype:
            try:
                body: Any = await request.json()
                if isinstance(body, dict):
                    merchant_id = body.get("merchant_id")
            except Exception:
                merchant_id = None
    if not limiter.check(ip, merchant_id):
        raise HTTPException(
            status_code=HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded",
            headers={"Retry-After": "60"},
        )
