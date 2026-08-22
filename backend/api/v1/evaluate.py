"""/api/v1/risk/evaluate — primary synchronous scoring endpoint (<50ms SLA)."""
from __future__ import annotations

from fastapi import APIRouter

from backend.core.engine import run_pipeline
from backend.schemas import RiskEvaluation, TransactionEvent

router = APIRouter(prefix="/api/v1/risk", tags=["risk"])


@router.post("/evaluate", response_model=RiskEvaluation)
async def evaluate(event: TransactionEvent) -> RiskEvaluation:
    return await run_pipeline(event)
