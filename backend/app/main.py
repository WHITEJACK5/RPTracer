"""TRACER v1.0 — High-Frequency AI Risk Engine (canonical app factory).

Boot sequence: load/train the GBDT artifact, seed the mule graph, open the
hash-chained audit ledger, precompute the honest-metrics report, then serve
the bounded-agent API behind hardening middleware (idempotency, rate limiting,
security headers, RFC 7807 error envelope, CORS allow-list, optional docs).
"""
from __future__ import annotations

import asyncio
import time
import traceback
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.app.api.v1 import (
    alerts as alerts_router,
)
from backend.app.api.v1 import (
    graph as graph_router,
)
from backend.app.api.v1 import (
    health as health_router,
)
from backend.app.api.v1 import (
    ledger as ledger_router,
)
from backend.app.api.v1 import (
    model as model_router,
)
from backend.app.api.v1 import (
    transactions as txn_router,
)
from backend.app.api.v1 import (
    webhooks as webhook_router,
)
from backend.app.api.v1 import (
    reviews as reviews_router,
)
from backend.app.core.config import CORS_ORIGINS, DATA_DIR, settings
from backend.app.core.idempotency import IdempotencyMiddleware
from backend.app.core.metrics import render_metrics
from backend.app.models.schemas import TransactionEvent
from backend.app.services.graph_detector import get_detector
from backend.app.services.ledger_service import get_ledger
from backend.app.services.scorer import run_pipeline

_BOOT_T0 = time.time()


def _problem(status: int, title: str, detail: str, instance: str = "/healthz",
             headers: dict[str, str] | None = None, **extra: Any) -> JSONResponse:
    body = {
        "type": extra.pop("type", f"about:blank#{status}"),
        "title": title,
        "status": status,
        "detail": detail,
        "instance": instance,
        **extra,
    }
    resp_headers = {"Content-Type": "application/problem+json"}
    if headers:
        resp_headers.update(headers)
    return JSONResponse(
        status_code=status,
        content=body,
        headers=resp_headers,
    )


@asynccontextmanager
async def lifespan(_: FastAPI):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    get_ledger()                       # opens/creates append-only ledger
    get_detector()                     # initializes mule graph detector
    from backend.app.models.risk_model import get_risk_model
    from backend.app.services.stream_worker import get_stream_worker

    get_risk_model()                   # loads cached GBDT or trains once (~2s)
    worker = get_stream_worker()
    worker_task = asyncio.create_task(worker.run_loop())

    await run_pipeline(                # warm threadpools / caches before traffic
        TransactionEvent(event_id="warmup", amount=1499))
    import threading

    def _report() -> None:
        try:
            from backend.app.models.report import get_report

            get_report()
        except Exception:
            pass                       # report is best-effort, never boot-critical

    threading.Thread(target=_report, daemon=True).start()
    try:
        yield
    finally:
        worker._running = False
        worker_task.cancel()


def create_app() -> FastAPI:
    docs_enabled = settings.docs_enabled
    app = FastAPI(
        title="TRACER v1.0 — AI Risk Manager",
        description="Razorpay AI Buildathon 2026 · Track 2 · defense-only "
                    "autonomous merchant protection",
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/docs" if docs_enabled else None,
        openapi_url="/openapi.json" if docs_enabled else None,
    )

    # --- CORS: explicit allow-list only (no '*') ----------------------------
    app.add_middleware(
        CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=True,
        allow_methods=["GET", "POST"], allow_headers=["*"],
    )

    # --- Security headers ---------------------------------------------------
    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        resp = await call_next(request)
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("X-Frame-Options", "DENY")
        resp.headers.setdefault(
            "Strict-Transport-Security", "max-age=63072000; includeSubDomains")
        return resp

    # --- Idempotency (exactly-once under webhook retries) -------------------
    app.add_middleware(IdempotencyMiddleware)

    # --- Routers ------------------------------------------------------------
    app.include_router(health_router.router)
    app.include_router(txn_router.router)
    app.include_router(graph_router.router)
    app.include_router(ledger_router.router)
    app.include_router(model_router.router)
    app.include_router(webhook_router.router)
    app.include_router(alerts_router.router)
    app.include_router(reviews_router.router)

    # --- Prometheus metrics ------------------------------------------------
    @app.get("/metrics", include_in_schema=False)
    def metrics():
        body, ctype = render_metrics()
        return PlainTextResponse(body, media_type=ctype)

    # --- Sandbox latency probe (dashboard SLA badge) ------------------------
    @app.post("/api/v1/sandbox/smoke")
    async def smoke(event: TransactionEvent):
        t0 = time.perf_counter()
        await run_pipeline(event)
        return {"roundtrip_ms": round((time.perf_counter() - t0) * 1000, 2)}

    # --- RFC 7807 global exception envelope --------------------------------
    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        return _problem(exc.status_code, "Request error", str(exc.detail),
                        str(request.url.path),
                        headers=dict(exc.headers or {}))

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        return _problem(422, "Validation error", "Request body failed schema validation",
                        str(request.url.path), errors=exc.errors())

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        traceback.print_exc()
        return _problem(500, "Internal error",
                        "An unexpected error occurred processing the request",
                        str(request.url.path))

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.app.main:app", host="127.0.0.1", port=8000, reload=False)
