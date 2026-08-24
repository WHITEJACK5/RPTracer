"""Ledger stats endpoint — GET /api/v1/ledger/stats.

Surfaces the append-only hash-chain audit ledger state. The chain is never
rewound (immutable audit invariant); ``deep=true`` triggers a full re-scan.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.app.core.rate_limit import rate_limit
from backend.app.services.ledger_service import get_ledger

router = APIRouter(tags=["ops"], dependencies=[Depends(rate_limit)])


@router.get("/api/v1/ledger/stats")
def ledger_stats(deep: bool = False) -> dict:
    ledger = get_ledger()
    audit = ledger.state()
    out = {"entries": audit["entries"], "chain_verified": audit["intact"],
           "chain_head": audit["head"], "path": str(ledger.path.name)}
    if deep:
        out["chain_verified"] = ledger.verify_chain()
        out["deep_scan"] = True
    return out


@router.get("/api/v1/ledger")
def list_ledger_entries(limit: int = 100) -> list[dict]:
    """Return recent immutable audit ledger entries."""
    return get_ledger().read_recent(limit)
