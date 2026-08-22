"""Idempotency middleware — Redis-backed with an in-process TTL fallback.

POSTs carrying an `X-Idempotency-Key` header are cached for
IDEMPOTENCY_TTL_SECONDS. Replays return the *original* response with the
header `X-Idempotent-Replay: true`, guaranteeing exactly-once risk decisions
under webhook retries.
"""
from __future__ import annotations

import json
import threading
import time
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class _MemoryStore:
    """Thread-safe TTL dict used when Redis is not configured/reachable."""

    def __init__(self, ttl_seconds: int) -> None:
        self.ttl = ttl_seconds
        self._data: dict[str, tuple[float, int, dict[str, str], bytes]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> tuple[int, dict[str, str], bytes] | None:
        with self._lock:
            hit = self._data.get(key)
            if not hit:
                return None
            expires, status, headers, body = hit
            if expires < time.monotonic():
                del self._data[key]
                return None
            self._data[key] = (time.monotonic() + self.ttl, status, headers, body)  # touch
            return status, headers, body

    def put(self, key: str, status: int, headers: dict[str, str], body: bytes) -> None:
        with self._lock:
            self._data[key] = (time.monotonic() + self.ttl, status, headers, body)


class RedisStore(_MemoryStore):
    """Same interface, backed by Redis strings."""

    def __init__(self, url: str, ttl_seconds: int) -> None:
        super().__init__(ttl_seconds)
        import redis  # imported lazily; optional dependency

        self._redis = redis.Redis.from_url(url, socket_connect_timeout=1, decode_responses=False)
        self._redis.ping()

    def get(self, key: str) -> tuple[int, dict[str, str], bytes] | None:
        raw = self._redis.get(f"tracer:idem:{key}")
        if raw is None:
            return None
        payload = json.loads(raw)
        return payload["status"], payload["headers"], payload["body"].encode()

    def put(self, key: str, status: int, headers: dict[str, str], body: bytes) -> None:
        self._redis.setex(
            f"tracer:idem:{key}", self.ttl,
            json.dumps({"status": status, "headers": headers, "body": body.decode()}),
        )


def build_store(ttl_seconds: int):
    from backend.config import REDIS_URL

    if REDIS_URL:
        try:
            return RedisStore(REDIS_URL, ttl_seconds)
        except Exception:  # pragma: no cover - redis down at boot
            pass
    return _MemoryStore(ttl_seconds)


class IdempotencyMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, store=None, ttl_seconds: int = 600) -> None:
        super().__init__(app)
        self.store = store or build_store(ttl_seconds)

    async def dispatch(self, request: Request, call_next) -> Response:
        idem_key = request.headers.get("X-Idempotency-Key")
        if request.method != "POST" or not idem_key:
            return await call_next(request)

        cache_key = f"{request.url.path}::{idem_key}"
        cached = self.store.get(cache_key)
        if cached is not None:
            status, headers, body = cached
            replay_headers = {k: v for k, v in headers.items()
                              if k.lower() not in ("content-length",)}
            replay_headers["X-Idempotent-Replay"] = "true"
            return Response(content=body, status_code=status,
                            headers=replay_headers, media_type=headers.get("content-type", "application/json"))

        response = await call_next(request)
        if response.status_code < 500:
            body = b""
            async for chunk in response.body_iterator:  # type: ignore[attr-defined]
                body += chunk
            flat_headers = {k: v for k, v in response.headers.items()}
            self.store.put(cache_key, response.status_code, flat_headers, body)
            return Response(
                content=body, status_code=response.status_code,
                headers=flat_headers, media_type=response.media_type,
            )
        return response
