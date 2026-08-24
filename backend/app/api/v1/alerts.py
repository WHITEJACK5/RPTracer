"""Real-time alert endpoints — SSE stream plus a polling list.

The frontend ``useLiveFeed`` hook opens ``/api/v1/stream/alerts`` as an
``EventSource`` and falls back to polling ``GET /api/v1/alerts``.
"""
from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

from backend.app.core.events import recent_alerts, subscribe, unsubscribe

router = APIRouter(prefix="/api/v1", tags=["realtime"])


@router.get("/alerts")
def list_alerts(limit: int = 50) -> JSONResponse:
    """Polling endpoint: most recent alerts as a JSON array."""
    return JSONResponse(recent_alerts(limit))


@router.get("/stream/alerts")
async def stream_alerts(request: Request) -> StreamingResponse:
    """Server-Sent Events stream of live risk alerts."""

    async def event_generator():
        q = await subscribe()
        try:
            for alert in recent_alerts(20):
                yield f"data: {json.dumps(alert)}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    alert = await asyncio.wait_for(q.get(), timeout=30)
                    yield f"data: {json.dumps(alert)}\n\n"
                except TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            unsubscribe(q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
