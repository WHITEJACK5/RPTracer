"""In-process pub/sub for real-time alert streaming (SSE + polling).

Design notes (graceful-degrade posture):
* No external infrastructure is required — alerts live in a bounded ring buffer
  and SSE subscribers receive via ``asyncio.Queue``.
* Publishing is a no-op when there are no subscribers; the scorer never blocks.
* Under multiple worker processes each process maintains its own buffer (SSE is
  best-effort per replica). A Redis-backed fan-out is the future upgrade path.
"""
from __future__ import annotations

import asyncio
from collections import deque
from typing import Any

_MAX_HISTORY = 200
_history: deque[dict[str, Any]] = deque(maxlen=_MAX_HISTORY)
_subscribers: set[asyncio.Queue[dict[str, Any]]] = set()


def publish_alert(alert: dict[str, Any]) -> None:
    """Append ``alert`` to history and fan out to live SSE subscribers."""
    _history.append(alert)
    for q in list(_subscribers):
        try:
            q.put_nowait(alert)
        except asyncio.QueueFull:
            pass


def recent_alerts(limit: int = 50) -> list[dict[str, Any]]:
    """Return the most recent ``limit`` alerts for polling clients."""
    return list(_history)[-limit:]


async def subscribe() -> asyncio.Queue[dict[str, Any]]:
    """Register a new SSE subscriber queue."""
    q: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=256)
    _subscribers.add(q)
    return q


def unsubscribe(q: asyncio.Queue[dict[str, Any]]) -> None:
    """Remove an SSE subscriber queue."""
    _subscribers.discard(q)
