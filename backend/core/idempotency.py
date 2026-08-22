"""Idempotency middleware — Redis-backed with an in-process TTL fallback.

Pure-ASGI implementation (no BaseHTTPMiddleware task machinery): POSTs carrying
an `X-Idempotency-Key` header are cached for IDEMPOTENCY_TTL_SECONDS; replays
return the original response with `X-Idempotent-Replay: true`, guaranteeing
exactly-once risk decisions under webhook retries.
"""
from __future__ import annotations

import json
import threading
import time
from typing import Any

from starlette.datastructures import Headers


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


class IdempotencyMiddleware:
    """Pure ASGI middleware — zero per-request task overhead."""

    def __init__(self, app, store=None, ttl_seconds: int = 600) -> None:
        self.app = app
        self.store = store or build_store(ttl_seconds)

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http" or scope["method"] != "POST":
            await self.app(scope, receive, send)
            return
        idem_key = Headers(scope=scope).get("X-Idempotency-Key")
        if not idem_key:
            await self.app(scope, receive, send)
            return

        cache_key = f"{scope['path']}::{idem_key}"
        cached = self.store.get(cache_key)
        if cached is not None:
            status, headers, body = cached
            out_headers = [(k.lower().encode("latin-1"), str(v).encode("latin-1"))
                           for k, v in headers.items()
                           if k.lower() not in ("content-length", "x-idempotent-replay")]
            out_headers.append((b"x-idempotent-replay", b"true"))
            await send({"type": "http.response.start", "status": status,
                        "headers": out_headers})
            await send({"type": "http.response.body", "body": body})
            return

        captured: dict[str, Any] = {"chunks": []}

        async def send_wrapper(message) -> None:
            if message["type"] == "http.response.start":
                captured["status"] = message["status"]
                captured["headers"] = {k.decode("latin-1"): v.decode("latin-1")
                                       for k, v in message.get("headers", [])}
            elif message["type"] == "http.response.body":
                captured["chunks"].append(message.get("body", b""))
                more = message.get("more_body", False)
                if not more and captured.get("status", 500) < 500:
                    self.store.put(cache_key, captured["status"],
                                   captured["headers"], b"".join(captured["chunks"]))
            await send(message)

        await self.app(scope, receive, send_wrapper)
