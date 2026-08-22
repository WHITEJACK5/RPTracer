"""TRACER v1.0 — High-Frequency AI Risk Engine (FastAPI entrypoint).

Boot sequence: load/train GBDT artifact, seed the mule graph, open the
hash-chained audit ledger, then serve the bounded-agent API.
"""
from __future__ import annotations

import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.v1.evaluate import router as evaluate_router
from backend.api.v1.webhooks import router as webhook_router
from backend.config import CORS_ORIGINS, LEDGER_PATH, PROJECT_ROOT, DATA_DIR
from backend.core.audit import get_ledger
from backend.core.engine import component_status, run_pipeline
from backend.core.idempotency import IdempotencyMiddleware
from backend.graph.mule_detector import get_detector
from backend.schemas import TransactionEvent

_BOOT_T0 = time.time()


def create_app() -> FastAPI:
    async def _warm() -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        get_ledger(LEDGER_PATH)          # opens/creates append-only ledger
        get_detector()                   # seeds historical mule graph
        from backend.models.risk_model import get_risk_model

        get_risk_model()                 # loads cached GBDT or trains once (~2s)
        await run_pipeline(              # warm threadpools / caches before traffic
            TransactionEvent(event_id="warmup", amount=1499)
        )
        # precompute the honest-metrics card off-thread so the first
        # /api/v1/model/report request never stalls (~4k predictions otherwise)
        import threading

        def _report() -> None:
            try:
                from backend.models.report import get_report
                get_report()
            except Exception:
                pass                     # report is best-effort, never boot-critical

        threading.Thread(target=_report, daemon=True).start()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        await _warm()
        yield

    app = FastAPI(
        title="TRACER v1.0 — AI Risk Manager",
        description="Razorpay AI Buildathon 2026 · Track 2 · defense-only autonomous merchant protection",
        version="1.0.0",
        lifespan=lifespan,
    )
    app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS,
                       allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
    app.add_middleware(IdempotencyMiddleware)
    app.include_router(evaluate_router)
    app.include_router(webhook_router)

    @app.get("/healthz", tags=["ops"])
    def healthz() -> dict:
        ledger = get_ledger()
        audit = ledger.state()               # O(1); deep scan only at boot
        return {
            "status": "ok" if audit["intact"] else "degraded",
            "uptime_s": round(time.time() - _BOOT_T0, 1),
            "audit_chain_verified": audit["intact"],
            "audit": audit,
            "components": component_status(),
        }

    @app.get("/api/v1/graph/topology", tags=["risk"])
    def topology(center: str | None = None) -> dict:
        return get_detector().topology(center=center)

    @app.post("/api/v1/graph/reset-demo", tags=["risk"])
    def reset_demo_graph() -> dict:
        detector = get_detector()
        detector.reseed()                # rebuild deterministic demo history
        return {"reseeded": True, "nodes": detector.g.number_of_nodes(),
                "edges": detector.g.number_of_edges()}

    @app.get("/api/v1/presets", tags=["sandbox"])
    def presets() -> dict:
        path = PROJECT_ROOT / "data" / "sample_payloads.json"
        if path.exists():
            import json
            return json.loads(path.read_text(encoding="utf-8"))
        return {}

    @app.get("/api/v1/model/report", tags=["ops"])
    def model_report() -> dict:
        """Live honest-metrics card: synthetic GT holdout + FP cost per 1k legit."""
        from backend.models.report import get_report

        return get_report()

    @app.get("/api/v1/ledger/stats", tags=["ops"])
    def ledger_stats(deep: bool = False) -> dict:
        ledger = get_ledger()
        audit = ledger.state()
        out = {"entries": audit["entries"], "chain_verified": audit["intact"],
               "chain_head": audit["head"], "path": str(ledger.path.name)}
        if deep:                             # explicit full re-scan on demand
            out["chain_verified"] = ledger.verify_chain()
            out["deep_scan"] = True
        return out

    @app.post("/api/v1/sandbox/smoke", tags=["sandbox"])
    async def smoke(event: TransactionEvent) -> dict:
        """Latency probe used by the dashboard SLA badge."""
        t0 = time.perf_counter()
        await run_pipeline(event)
        return {"roundtrip_ms": round((time.perf_counter() - t0) * 1000, 2)}

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=False)
