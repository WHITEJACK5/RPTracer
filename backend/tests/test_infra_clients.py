"""Infrastructure clients: lazy constructors degrade to None; guard helper."""
from __future__ import annotations

import asyncio
import sys
import types

import pytest

import redis as real_redis

from backend.app.core import security
from backend.app.infrastructure import razorpay_client, redis_client


def _fake_neo4j(monkeypatch, boom=False):
    """Inject a fake `neo4j` module into sys.modules (neo4j isn't installed)."""

    class FakeDriver:
        def verify_connectivity(self):
            return True

        def session(self):
            return None

    class FakeNeo4j(types.ModuleType):
        GraphDatabase = type(
            "GraphDatabase", (), {
                "driver": staticmethod(
                    lambda *a, **k: (_ for _ in ()).throw(RuntimeError("no neo4j"))
                    if boom else FakeDriver())})

    mod = FakeNeo4j("neo4j")
    monkeypatch.setitem(sys.modules, "neo4j", mod)
    return mod


def test_redis_none_when_unconfigured(monkeypatch):
    monkeypatch.setattr(redis_client.settings, "redis_url", None)
    monkeypatch.setattr(redis_client, "_available", None)
    monkeypatch.setattr(redis_client, "_client", None)
    assert redis_client.get_redis() is None


def test_redis_connect_success(monkeypatch):
    monkeypatch.setattr(redis_client.settings, "redis_url", "redis://x")
    monkeypatch.setattr(redis_client, "_available", None)
    monkeypatch.setattr(redis_client, "_client", None)

    class FakeRedis:
        def ping(self):
            return True

    monkeypatch.setattr(real_redis.Redis, "from_url", staticmethod(lambda *a, **k: FakeRedis()))
    client = redis_client.get_redis()
    assert isinstance(client, FakeRedis)


def test_redis_connect_failure_returns_none(monkeypatch):
    monkeypatch.setattr(redis_client.settings, "redis_url", "redis://x")
    monkeypatch.setattr(redis_client, "_available", None)
    monkeypatch.setattr(redis_client, "_client", None)

    def _boom(*a, **k):
        raise ConnectionError("no redis")

    monkeypatch.setattr(real_redis.Redis, "from_url", staticmethod(_boom))
    assert redis_client.get_redis() is None


def test_neo4j_none_when_unconfigured(monkeypatch):
    _fake_neo4j(monkeypatch)
    monkeypatch.setattr(redis_client.settings, "neo4j_uri", None)
    from backend.app.infrastructure import neo4j_client

    monkeypatch.setattr(neo4j_client, "_available", None)
    monkeypatch.setattr(neo4j_client, "_driver", None)
    assert asyncio.run(neo4j_client.get_neo4j()) is None
    assert neo4j_client.is_configured() is False


def test_neo4j_connect_success(monkeypatch):
    _fake_neo4j(monkeypatch)
    from backend.app.infrastructure import neo4j_client

    monkeypatch.setattr(neo4j_client.settings, "neo4j_uri", "bolt://x")
    monkeypatch.setattr(neo4j_client.settings, "neo4j_user", "u")
    monkeypatch.setattr(neo4j_client.settings, "neo4j_password", "p")
    monkeypatch.setattr(neo4j_client, "_available", None)
    monkeypatch.setattr(neo4j_client, "_driver", None)
    driver = asyncio.run(neo4j_client.get_neo4j())
    assert driver is not None
    assert neo4j_client.is_configured() is True


def test_neo4j_connect_failure_returns_none(monkeypatch):
    _fake_neo4j(monkeypatch, boom=True)
    from backend.app.infrastructure import neo4j_client

    monkeypatch.setattr(neo4j_client.settings, "neo4j_uri", "bolt://x")
    monkeypatch.setattr(neo4j_client, "_available", None)
    monkeypatch.setattr(neo4j_client, "_driver", None)
    assert asyncio.run(neo4j_client.get_neo4j()) is None


def test_razorpay_verify_and_configured():
    razorpay_client.RAZORPAY_WEBHOOK_SECRET = ""
    assert razorpay_client.verify_webhook_signature(b"x", "sig") is False
    assert razorpay_client.is_secret_configured() is False

    secret = "a-valid-secret-value"
    razorpay_client.RAZORPAY_WEBHOOK_SECRET = secret
    import hashlib
    import hmac

    raw = b'{"event":"payment.captured"}'
    sig = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    assert razorpay_client.verify_webhook_signature(raw, sig) is True
    assert razorpay_client.is_secret_configured() is True
    razorpay_client.RAZORPAY_WEBHOOK_SECRET = ""


def test_guard_cypher_query_parameterized_ok():
    q = security.guard_cypher_query(
        "MATCH (e:Event {id:$eid}) SET e.score=$score", {"eid": "1", "score": 5})
    assert "$eid" in q


def test_guard_cypher_query_rejects_interpolation():
    with pytest.raises(ValueError):
        security.guard_cypher_query("MATCH (n) RETURN {{{n}}", {"n": 1})


def test_guard_cypher_query_rejects_unbound():
    with pytest.raises(ValueError):
        security.guard_cypher_query("MATCH (n {id:$x}) RETURN n", {"y": 1})
