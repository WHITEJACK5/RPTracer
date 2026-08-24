"""Redis-backed idempotency store + IdempotencyMiddleware behavior."""
from __future__ import annotations

import asyncio
import json

import pytest

import redis as real_redis

from backend.app.core.idempotency import (
    IdempotencyMiddleware,
    RedisStore,
    _MemoryStore,
)


class FakeRedis:
    """Tiny in-memory stand-in for redis.Redis used by RedisStore."""

    def __init__(self, fail_first_set: bool = False) -> None:
        self._data: dict[str, str] = {}
        self._fail_first_set = fail_first_set
        self.ping_called = False

    def ping(self) -> bool:
        self.ping_called = True
        return True

    def set(self, key, value, nx=False, ex=None):
        if nx:
            if key in self._data:
                return False
            self._data[key] = value
            return True
        self._data[key] = value
        return True

    def get(self, key):
        return self._data.get(key)

    def setex(self, key, ttl, value):
        self._data[key] = value

    def delete(self, key):
        self._data.pop(key, None)


@pytest.fixture()
def fake_redis(monkeypatch):
    fr = FakeRedis()

    def _from_url(*args, **kwargs):
        return fr

    monkeypatch.setattr(real_redis.Redis, "from_url", staticmethod(_from_url))
    return fr


def test_redis_store_proceed_and_in_progress(fake_redis) -> None:
    store = RedisStore("redis://test", ttl_seconds=600)
    state, cached = store.begin("k")
    assert state == "proceed" and cached is None
    state2, _ = store.begin("k")
    assert state2 == "in_progress"


def test_redis_store_finish_replay(fake_redis) -> None:
    store = RedisStore("redis://test", ttl_seconds=600)
    store.begin("k")
    store.finish("k", 200, {"content-type": "application/json"}, b'{"ok":true}')
    state, cached = store.begin("k")
    assert state == "completed"
    assert cached[0] == 200
    assert cached[2] == b'{"ok":true}'


def test_redis_store_expired_then_reclaim(fake_redis) -> None:
    fr = fake_redis
    # first set fails (as if already occupied by another process), then get
    # returns None (expired) and the reclaim set succeeds.
    calls = {"n": 0}

    def _set(key, value, nx=False, ex=None):
        calls["n"] += 1
        if calls["n"] == 1:
            return False
        fr._data[key] = value
        return True

    fr.set = _set
    store = RedisStore("redis://test", ttl_seconds=600)
    state, _ = store.begin("k")
    assert state == "proceed"  # reclaimed after expired get


def test_redis_store_completed_payload(fake_redis) -> None:
    fr = fake_redis
    payload = json.dumps({"status": 201, "headers": {"x": "1"},
                         "body": "YWJj"})
    fr._data["tracer:idem:k"] = payload
    store = RedisStore("redis://test", ttl_seconds=600)
    state, cached = store.begin("k")
    assert state == "completed"
    assert cached[0] == 201
    assert cached[2] == b"YWJj"


def test_redis_store_corrupt_payload_falls_back(fake_redis) -> None:
    fr = fake_redis
    fr._data["tracer:idem:k"] = "not-json"
    store = RedisStore("redis://test", ttl_seconds=600)
    state, cached = store.begin("k")
    # unparseable payload -> treat as proceed (re-run safely)
    assert state == "proceed"
    assert cached is None


def test_redis_store_abort(fake_redis) -> None:
    store = RedisStore("redis://test", ttl_seconds=600)
    store.begin("k")
    store.abort("k")
    state, _ = store.begin("k")
    assert state == "proceed"


def _invoke(mw, scope, messages):
    sent: list[dict] = []

    async def receive():
        return {}

    async def send(msg):
        sent.append(msg)

    asyncio.run(mw(scope, receive, send))
    return sent


def test_middleware_non_post_passes_through():
    downstream = lambda scope, receive, send: send(  # noqa: E731
        {"type": "http.response.start", "status": 200, "headers": []})
    mw = IdempotencyMiddleware(downstream, store=_MemoryStore(600))
    scope = {"type": "http", "method": "GET", "path": "/x", "headers": []}
    sent = _invoke(mw, scope, None)
    assert sent[0]["status"] == 200


def test_middleware_no_key_passes_through():
    flag = {}

    async def downstream(scope, receive, send):
        flag["ran"] = True
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    mw = IdempotencyMiddleware(downstream, store=_MemoryStore(600))
    scope = {"type": "http", "method": "POST", "path": "/x", "headers": []}
    sent = _invoke(mw, scope, None)
    assert flag.get("ran") is True
    assert sent[0]["status"] == 200


def test_middleware_replay_completed():
    store = _MemoryStore(600)
    store.begin("/x::key1")
    store.finish("/x::key1", 200, {"content-type": "application/json"},
                 b'{"status":200}')

    async def downstream(scope, receive, send):
        raise AssertionError("downstream must not run on replay")

    mw = IdempotencyMiddleware(downstream, store=store)
    scope = {"type": "http", "method": "POST", "path": "/x",
             "headers": [(b"x-idempotency-key", b"key1")]}
    sent = _invoke(mw, scope, None)
    assert sent[0]["status"] == 200
    assert (b"x-idempotent-replay", b"true") in sent[0]["headers"]


def test_middleware_concurrent_in_progress_returns_429():
    store = _MemoryStore(600)
    store.begin("/x::key2")  # in-flight

    async def downstream(scope, receive, send):
        raise AssertionError("downstream must not run on in_progress")

    mw = IdempotencyMiddleware(downstream, store=store)
    scope = {"type": "http", "method": "POST", "path": "/x",
             "headers": [(b"x-idempotency-key", b"key2")]}
    sent = _invoke(mw, scope, None)
    assert sent[0]["status"] == 429
    assert (b"retry-after", b"2") in sent[0]["headers"]


def test_middleware_caches_successful_response():
    store = _MemoryStore(600)

    async def downstream(scope, receive, send):
        await send({"type": "http.response.start", "status": 200,
                    "headers": [(b"content-type", b"application/json")]})
        await send({"type": "http.response.body", "body": b'{"a":1}',
                    "more_body": False})

    mw = IdempotencyMiddleware(downstream, store=store)
    scope = {"type": "http", "method": "POST", "path": "/x",
             "headers": [(b"x-idempotency-key", b"key3")]}
    sent = _invoke(mw, scope, None)
    assert sent[0]["status"] == 200
    # second identical -> replay from store
    sent2 = _invoke(mw, scope, None)
    assert (b"x-idempotent-replay", b"true") in sent2[0]["headers"]


def test_middleware_aborts_on_5xx():
    store = _MemoryStore(600)

    async def downstream(scope, receive, send):
        await send({"type": "http.response.start", "status": 500,
                    "headers": []})
        await send({"type": "http.response.body", "body": b"err",
                    "more_body": False})

    mw = IdempotencyMiddleware(downstream, store=store)
    scope = {"type": "http", "method": "POST", "path": "/x",
             "headers": [(b"x-idempotency-key", b"key4")]}
    _invoke(mw, scope, None)
    # after 5xx the slot is released -> next call proceeds again
    state, _ = store.begin("/x::key4")
    assert state == "proceed"
