"""Tests for backend.app.core.events (in-process pub/sub)."""
from __future__ import annotations

import asyncio

import pytest

from backend.app.core import events


@pytest.fixture(autouse=True)
def _clear_events():
    events._history.clear()
    events._subscribers.clear()
    yield
    events._history.clear()
    events._subscribers.clear()


def test_publish_and_recent():
    alert = {"id": "a1", "level": "high", "title": "x"}
    events.publish_alert(alert)
    assert events.recent_alerts(10) == [alert]
    assert len(events.recent_alerts(50)) == 1


def test_recent_limit_truncates():
    for i in range(20):
        events.publish_alert({"id": str(i)})
    assert len(events.recent_alerts(5)) == 5
    # history bounded to _MAX_HISTORY
    assert len(events._history) <= events._MAX_HISTORY


def test_history_bounded_ring_buffer():
    for i in range(events._MAX_HISTORY + 50):
        events.publish_alert({"id": str(i)})
    assert len(events._history) == events._MAX_HISTORY


def test_subscribe_receives_published():
    q = asyncio.run(events.subscribe())
    try:
        alert = {"id": "sub1"}
        events.publish_alert(alert)
        got = asyncio.run(asyncio.wait_for(q.get(), timeout=1))
        assert got == alert
    finally:
        events.unsubscribe(q)


def test_unsubscribe_removes_queue():
    q = asyncio.run(events.subscribe())
    events.unsubscribe(q)
    assert q not in events._subscribers


def test_subscribe_queue_full_does_not_block_publish():
    q = asyncio.run(events.subscribe())
    try:
        # fill the queue to capacity so a later publish hits QueueFull
        for _ in range(q.maxsize):
            q.put_nowait({"id": "fill"})
    finally:
        events.unsubscribe(q)
    # publishing must remain a no-op / never raise despite full subscriber
    events.publish_alert({"id": "after_full"})
    assert events.recent_alerts(1)[0]["id"] == "after_full"
