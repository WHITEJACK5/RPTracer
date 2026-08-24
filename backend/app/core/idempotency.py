"""Idempotency middleware — exactly-once risk decisions under webhook retries.

Two-phase, NX-style contract:
  * ``begin(key)`` claims an in-flight slot atomically.
      - ``proceed``   : caller may run the request.
      - ``in_progress``: another identical request is mid-flight -> 429 Retry-After.
      - ``completed`` : a prior identical request finished -> replay 200.
  * On success ``finish(key, ...)`` stores the response (Redis SETEX / memory).
  * On 5xx ``abort(key)`` releases the slot so a retry can proceed.

Redis is used when available (SET NX + EX/TTL); otherwise a thread-safe
in-memory store emulates the same semantics.
"""
from __future__ import annotations

import json
import threading
import time
from typing import Any

from starlette.datastructures import Headers

_INFLIGHT_TTL = 120  # seconds; long enough to cover the longest legitimate call
_SENTINEL = "__in_progress__"


class _MemoryStore:
    """Thread-safe TTL dict emulating NX idempotency semantics."""

    def __init__(self, ttl_seconds: int) -> None:
        self.ttl = ttl_seconds
        self._data: dict[str, tuple[str, float, Any]] = {}
        self._lock = threading.Lock()

    def begin(self, key: str) -> tuple[str, Any]:
        now = time.monotonic()
        with self._lock:
            cur = self._data.get(key)
            if cur is None or cur[1] < now:
                self._data[key] = ("in_progress", now + _INFLIGHT_TTL, None)
                return "proceed", None
            state, _, value = cur
            if state == "in_progress":
                return "in_progress", None
            return "completed", value

    def finish(self, key: str, status: int, headers: dict[str, str], body: bytes) -> None:
        with self._lock:
            self._data[key] = (
                "completed", time.monotonic() + self.ttl,
                (status, headers, body))

    def abort(self, key: str) -> None:
        with self._lock:
            self._data.pop(key, None)


class RedisStore(_MemoryStore):
    """Same interface, backed by Redis (SET NX for the in-flight slot)."""

    def __init__(self, url: str, ttl_seconds: int) -> None:
        super().__init__(ttl_seconds)
        import redis  # optional dependency

        self._redis = redis.Redis.from_url(
            url, socket_connect_timeout=1, socket_timeout=1, decode_responses=True)
        self._redis.ping()

    def begin(self, key: str) -> tuple[str, Any]:
        full = f"tracer:idem:{key}"
        if self._redis.set(full, _SENTINEL, nx=True, ex=_INFLIGHT_TTL):
            return "proceed", None
        val = self._redis.get(full)
        if val is None:  # expired between calls; reclaim
            if self._redis.set(full, _SENTINEL, nx=True, ex=_INFLIGHT_TTL):
                return "proceed", None
            val = self._redis.get(full)
        if val == _SENTINEL:
            return "in_progress", None
        try:
            payload = json.loads(val)
            return "completed", (payload["status"], payload["headers"],
                                 payload["body"].encode())
        except (ValueError, KeyError):
            return "proceed", None

    def finish(self, key: str, status: int, headers: dict[str, str], body: bytes) -> None:
        self._redis.setex(
            f"tracer:idem:{key}", self.ttl,
            json.dumps({"status": status, "headers": headers,
                        "body": body.decode("utf-8", "replace")}))

    def abort(self, key: str) -> None:
        self._redis.delete(f"tracer:idem:{key}")


def build_store(ttl_seconds: int) -> _MemoryStore | RedisStore:
    from backend.app.core.config import settings

    if settings.redis_url:
        try:
            return RedisStore(settings.redis_url, ttl_seconds)
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
        state, cached = self.store.begin(cache_key)
        if state == "completed":
            status, headers, body = cached
            out = [(k.lower().encode("latin-1"), str(v).encode("latin-1"))
                   for k, v in headers.items()
                   if k.lower() not in ("content-length", "x-idempotent-replay")]
            out.append((b"x-idempotent-replay", b"true"))
            await send({"type": "http.response.start", "status": status, "headers": out})
            await send({"type": "http.response.body", "body": body})
            return
        if state == "in_progress":
            await send({
                "type": "http.response.start", "status": 429,
                "headers": [(b"content-type", b"application/json"),
                            (b"retry-after", b"2"),
                            (b"x-idempotent-replay", b"false")]})
            await send({"type": "http.response.body",
                        "body": json.dumps({
                            "detail": "Concurrent identical request in flight",
                            "type": "https://tools.ietf.org/html/rfc6585#section-4"}).encode()})
            return

        captured: dict[str, Any] = {"chunks": []}

        async def send_wrapper(message) -> None:
            if message["type"] == "http.response.start":
                captured["status"] = message["status"]
                captured["headers"] = {k.decode("latin-1"): v.decode("latin-1")
                                       for k, v in message.get("headers", [])}
            elif message["type"] == "http.response.body":
                captured["chunks"].append(message.get("body", b""))
                if not message.get("more_body", False):
                    status = captured.get("status", 500)
                    if status < 500:
                        self.store.finish(
                            cache_key, status, captured["headers"],
                            b"".join(captured["chunks"]))
                    else:
                        self.store.abort(cache_key)
            await send(message)

        await self.app(scope, receive, send_wrapper)
