"""Graph endpoints — topology + demo reset.

GET  /api/v1/graph/topology?center=   -> canvas snapshot for the GraphCanvas UI
POST /api/v1/graph/reset-demo         -> rebuild deterministic demo history
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.app.core.rate_limit import rate_limit
from backend.app.services.graph_detector import get_detector

router = APIRouter(prefix="/api/v1/graph", tags=["risk"], dependencies=[Depends(rate_limit)])


@router.get("/topology")
def topology(center: str | None = None, session: str | None = None) -> dict:
    return get_detector().topology(center=center, session=session)


@router.post("/reset-demo")
def reset_demo_graph() -> dict:
    detector = get_detector()
    detector.reseed()
    return {"reseeded": True, "nodes": detector.g.number_of_nodes(),
            "edges": detector.g.number_of_edges()}
