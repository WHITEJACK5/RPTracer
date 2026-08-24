# DECISIONS.md — Architectural decisions & trade-offs (TRACER hardening pass)

This document records the engineering decisions made while hardening TRACER to
the staff-level spec (Sections 1–8). Where the spec was ambiguous or
environment-constrained, the choice that maximizes **security, performance, and
UX** is recorded here per the final instruction.

## 1. Canonical layout vs. working code (Section 1.1)
The existing tree used `backend/{config,schemas,core,agents,graph,models}` with
`backend.main` at the package root. The spec demands `backend/app/` with
`api/v1/{health,transactions,graph,ledger,model}`, `core/{config,security,constants}`,
`services/`, `infrastructure/`.

**Decision:** Port all logic into `backend/app/` as the canonical home and keep
thin **backward-compatible shims** at the old paths (`backend.main`,
`backend.config`, `backend.schemas`, `backend.core.*`, `backend.graph.*`,
`backend.agents.*`, `backend.models.*`). The shims re-export from `backend.app.*`.
Rationale: zero-downtime restructure, existing tests keep passing, and the spec
is satisfied (canonical paths exist and are the real implementation). The shims
are deprecated and will be removed once all callers migrate.

## 2. Infra-gated items (Redis, Neo4j, Playwright, Lighthouse, 90% cov)
The local environment has **no Redis, no Neo4j**, and cannot run a reliable
Lighthouse/Playwright pass. The user chose *"code with graceful degrade."*

**Decision:**
- Redis idempotency + feature-store use `SET NX EX` when Redis is reachable;
  otherwise an in-process TTL store emulates NX semantics. Never crash at boot.
- Neo4j writes are mirrored via `asyncio.create_task` (non-blocking); skipped
  silently when `TRACER_NEO4J_URI` is unset/unreachable.
- Prometheus `/metrics` and structlog JSON logging are always on (no external
  dependency) so observability works everywhere.
- Coverage, Playwright E2E, and Lighthouse targets are documented as
  environment-gated and run in CI (ubuntu) where possible, but not asserted as
  hard gates in this local pass.

## 3. Drift detection (Section 1.5)
No persisted training-baseline distribution ships in the repo.

**Decision:** Implement a rolling PSI monitor comparing the incoming feature
window against a boot-time reference window, alerting (log + gauge) when PSI>0.2.
This is a population-stability proxy, not a fixed-baseline PSI; upgrade path is
to persist `data/feature_baseline.npz` from the training run.

## 4. Error envelope (Section 1.3)
**Decision:** RFC 7807 `application/problem+json` for all unhandled errors and
validation failures, via a global FastAPI exception handler.

## 5. Rate limiting (Section 1.3)
**Decision:** In-process sliding-window limiter (per client IP + per merchant_id)
with Redis-backed counters when Redis is available. Default 100/min IP,
1000/min merchant. 429 + `Retry-After` on exceed.

## 6. Webhook HMAC (Section 1.6)
**Decision:** `hmac.compare_digest` constant-time verification. 403 when invalid
and `RAZORPAY_REQUIRE_WEBHOOK_SECRET=1`. Signature result is honestly reported
in the response payload regardless.

## 7. Frontend structure (Sections 2–5)
**Decision:** Moved the existing Next.js app into `frontend/` (App Router
preserved). Built the exact 9-component design system on the specified
CSS-variable token set (gold / white / neon-green, grainy-black dark mode).
`next-themes` for dark mode (no flash via `suppressHydrationWarning`), Zustand
for global state, TanStack Query v5 for data fetching, Sonner for toasts.
All colors are token-driven — zero hardcoded hex in components.

## 8. Out of scope for this pass (tracked as follow-ups)
- Persistent feature baseline for true PSI drift.
- Playwright E2E + Chromatic visual regression + Lighthouse 95+ assertion.
- `mypy --strict` fully clean (currently non-blocking in CI).
- Removal of deprecated backend shims after caller migration.
