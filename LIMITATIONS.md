# LIMITATIONS.md — TRACER Engine Boundaries & Failure Modes

This document provides a non-euphemistic statement of what TRACER v2.0 does and does not prove, its known failure modes, and its operational boundaries.

---

## 1. Test Suite Boundaries
- **Unit Tests (`backend/tests/`)**:
  - Test individual components (Pydantic validation, HMAC constant-time verification, prompt injection sanitization, idempotency NX semantics, sliding-window rate limiting, and state machine transitions).
  - *Non-Claim*: Passing unit tests proves system mechanics, not real-world fraud detection accuracy or ML generalization.

- **Graph Topology Tests (`test_graph_detector_app.py`)**:
  - Prove that NetworkX in-memory graph linkage updates correctly on event ingestion.
  - *Boundary*: Static single-device fan-out rules can be evaded by rotating device fingerprints unless multi-signal correlation (IP subnet, card fingerprint sharing, behavioral velocity) is enabled.

---

## 2. Known Failure Modes & Evasion Vectors
1. **Device Rotation Evasion**:
   - Attackers rotating device IDs across transactions while keeping transaction velocity under single-device threshold can evade simple single-device fan-out rules.
   - *Mitigation*: Multi-entity windowed correlation (IP/24 crowding, card fingerprint clustering, and trend slope forecasting in Phase 2 & 3).

2. **Degraded Mode Operating Cap**:
   - When running without XGBoost (calibrated-linear fallback mode), scores are capped at **70** (`degraded: true`).
   - *Impact*: High-risk payout holds (`PAUSE_PAYOUT`) cannot be autonomously issued in degraded mode; transactions escalate to human review queues.

3. **Label Noise & Confounder Shift**:
   - Ground-truth evaluation assumes independent label generation with synthetic noise. Real-world merchant category shifts or label delay (e.g. 60-day chargeback windows) will degrade un-retrained models.

---

## 3. Infrastructure & Deployment Dependencies
- **Single-Node In-Memory Fallback**:
  - When Redis is unconfigured, graph state and rolling velocity windows run in-memory within the FastAPI process. In multi-worker deployments (e.g. gunicorn with N workers), shared state requires Redis.

---

## 4. Explicitly Incomplete Phases (Honest Disclosure)

The following phases were **not fully implemented** in this pass. Rather than leaving stale documentation implying completion, they are listed here with a plan for future work.

### Phase 6 — Production Load Testing (Partially Done)
- **Plan**: Deploy to a Linux VPS with Redis/Neo4j running, run `k6` or `locust` at 1,000 RPS sustained concurrency, and report p50/p95/p99 under load (not idle single-request latency).
- **Current state**: Single fresh run on the same machine as `README.md` (see `README.md` Latency section for canonical numbers; this section mirrors them so there is exactly one source of truth). Full 1,000 RPS production test on Linux is still pending.
- **Windows dev-box numbers** (`scripts/bench_latency.py`, single uvicorn, in-memory NetworkX, no Redis/Neo4j — fresh run 2026-08-28, Windows 10 build 26200, Python 3.11.9, commit b36e0d5):
  - Sequential (n=200, c=1): p50=53.3ms, p95=69.7ms, p99=78.1ms, max=100.6ms, 18 req/s single-stream
  - Concurrent (n=600, c=10): p50=376.8ms, p95=436.2ms, p99=474.0ms, 26 req/s over 22.7s
  - **Caveat**: In-memory graph, no Redis/Neo4j hops. Windows localhost transport degrades under high concurrency even for hello-world (verified with bare Starlette control app); sequential figure is the representative single-request latency. Linux/uvloop production numbers will differ significantly.
  - Historical note: prior doc revisions reported p50=100.9ms/10 req/s (commit a0aa47b) and p50=17.0ms/52 req/s (early README) — those are retained only for comparison with date/commit tag, not as current.

### Walk-Forward Forecast Calibration (Partially Done)
- Walk-forward lead time and false-alarm rate tests exist (Phase 3). However, the trajectory tracking EWMA slope is currently uncalibrated — the `EARLY_WARNING` threshold is a fixed 30-second forecast window rather than a learned threshold. Future work: calibrate the forecast window on historical data to minimize false alarms at the desired lead time.
