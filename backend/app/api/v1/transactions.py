"""Scoring endpoint — POST /api/v1/evaluate.

Ports the original ``/api/v1/risk/evaluate`` handler. The legacy path
``/api/v1/risk/evaluate`` is retained as an alias so the existing dashboard
wire-check (scripts/verify_wires.py) and older clients keep working.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.app.core.rate_limit import rate_limit
from backend.app.models.schemas import RiskEvaluation, TransactionEvent
from backend.app.services.scorer import run_pipeline

router = APIRouter(prefix="/api/v1", tags=["risk"], dependencies=[Depends(rate_limit)])


@router.post("/evaluate", response_model=RiskEvaluation)
async def evaluate(event: TransactionEvent) -> RiskEvaluation:
    return await run_pipeline(event)


# Legacy alias — exact contract exercised by scripts/verify_wires.py.
@router.post("/risk/evaluate", response_model=RiskEvaluation)
async def evaluate_legacy(event: TransactionEvent) -> RiskEvaluation:
    return await run_pipeline(event)
