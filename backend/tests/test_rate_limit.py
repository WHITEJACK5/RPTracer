"""Rate-limit tests — per-IP sliding window returns 429 on exceed."""
from __future__ import annotations

import pytest

from backend.app.core.rate_limit import limiter


@pytest.fixture()
def low_limit():
    original_ip = limiter.ip_max
    limiter.reset()
    limiter.ip_max = 2            # allow exactly 2 requests / min
    yield
    limiter.ip_max = original_ip
    limiter.reset()


def test_rate_limit_returns_429(client, low_limit) -> None:
    payload = {
        "event_id": "rate_1", "amount": 1499.0,
        "instrument": {"method": "upi", "vpa": "rate@ybl"},
    }
    r1 = client.post("/api/v1/evaluate", json=payload)
    r2 = client.post("/api/v1/evaluate", json=payload)
    r3 = client.post("/api/v1/evaluate", json=payload)
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r3.status_code == 429
    assert r3.headers.get("retry-after") is not None
