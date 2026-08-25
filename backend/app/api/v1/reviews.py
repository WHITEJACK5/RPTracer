"""Review queue API — human-in-the-loop for HIGH-band payout-hold decisions.

Every HIGH-band decision is automatically queued here for analyst triage.
Analysts mark decisions as ``confirmed_fraud`` or ``false_positive`` via the
``POST /api/v1/reviews/{event_id}/label`` endpoint. Labels are appended to
``data/review_labels.jsonl`` as a growing, dated, real-world-labeled dataset.
"""
from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.app.core.rate_limit import rate_limit

router = APIRouter(prefix="/api/v1", tags=["review"], dependencies=[Depends(rate_limit)])


class LabelRequest(BaseModel):
    label: Literal["confirmed_fraud", "false_positive"]
    reason: str = ""


@router.get("/reviews")
def list_reviews(status: str = "pending_review", limit: int = 50) -> dict[str, Any]:
    """List review queue items filtered by status."""
    from backend.app.services.review_queue import get_review_queue

    queue = get_review_queue()
    return {
        "reviews": queue.list_reviews(status=status, limit=limit),
        "counts": queue.count_by_status(),
    }


@router.get("/reviews/stats")
def review_stats() -> dict[str, int]:
    """Review queue counts by status (for Prometheus gauge and dashboard)."""
    from backend.app.services.review_queue import get_review_queue

    return get_review_queue().count_by_status()


@router.post("/reviews/{event_id}/label")
def label_review(event_id: str, body: LabelRequest) -> dict[str, Any]:
    """Label a pending review as confirmed_fraud or false_positive."""
    from backend.app.services.review_queue import get_review_queue

    found = get_review_queue().label(event_id, body.label, body.reason)
    if not found:
        raise HTTPException(status_code=404, detail=f"Review {event_id} not found or already labeled")
    return {"event_id": event_id, "label": body.label, "status": "labeled"}
