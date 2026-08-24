"""Health probe — GET /healthz.

Returns 200 with component status when the critical subsystems (model + ledger)
are healthy, and 503 when either is down so orchestrators can drain traffic.
Optional subsystems (Redis/Neo4j) are reported but never fail the probe.
"""
from __future__ import annotations

import time

from fastapi import APIRouter, Request

from backend.app.core.config import settings
from backend.app.services.ledger_service import get_ledger
from backend.app.services.scorer import component_status

router = APIRouter(tags=["ops"])

_BOOT_T0 = time.time()


@router.get("/healthz")
def healthz(request: Request) -> dict:
    ledger = get_ledger()
    audit = ledger.state()
    components = component_status()

    model_ok = bool(components.get("model", {}).get("kind"))
    ledger_ok = audit["intact"]
    critical_ok = model_ok and ledger_ok

    if not critical_ok:
        from fastapi.responses import JSONResponse

        return JSONResponse(
            status_code=503,
            content={
                "status": "degraded",
                "uptime_s": round(time.time() - _BOOT_T0, 1),
                "audit_chain_verified": audit["intact"],
                "components": components,
                "detail": "model or ledger unavailable",
            },
        )

    return {
        "status": "ok" if audit["intact"] else "degraded",
        "uptime_s": round(time.time() - _BOOT_T0, 1),
        "audit_chain_verified": audit["intact"],
        "audit": audit,
        "components": components,
        "docs_enabled": settings.docs_enabled,
    }
