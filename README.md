# TRACER v1.0 — Autonomous Mule-Ring Defense for Razorpay Merchants

> **Razorpay AI Buildathon 2026 · Track 2: AI Risk Manager**
> One loss class, measured end to end: **abuse-ring (mule) detection**.
> TRACER links devices, VPAs, card fingerprints and IPs into a live entity graph,
> detects fan-out rings in milliseconds, and hands the case to a *bounded* agent
> that can only approve, challenge, or hold — every action written to a
> tamper-evident ledger.

## The headline capability

A mule ring is one operator behind dozens of payment identities. Tabular models
score each transaction in isolation and miss it; the topology gives it away.
TRACER's detector runs on **graph topology heuristics — degree, fan-out,
connected-component identity-mass analysis** (NetworkX; optional Neo4j mirror):

- ≥4 payment identities on one device ⇒ ring flagged with structural ratio ≥0.72
- Verified the deterministic rule fires correctly end-to-end through the public API
  (`backend/tests/test_graph_live_api.py`) on unseeded identifiers — not just
  the seeded demo fixture. The test assembles rings via sequential live API
  calls and asserts the rule triggers at fan_out ≥4 (live-API wiring
  verification, not ML generalization)
- Negative control: benign household fan-out (1 device, 2–3 VPAs) does NOT fire;
  this false-positive-on-structure control is asserted in the same test file

> **GBDT disclosure (cannot be missed): At any calibrated confidence threshold
> (p≥0.50 / 0.70 / 0.90) this tabular model's standalone recall is 0% on our
> synthetic benchmark (`python data/generate_synthetic.py` → P=0.000 R=0.000
> flagged 0–2); it is used only for SHAP explanation surfacing and
> policy-floor inputs, not as a standalone detector. Ring detection on graph
> topology is the headline claim for a reason.**

Everything else — RTO/COD scoring, LLM dispute dossiers — is listed under
[Also included](#also-included-extensions-not-headline-claims).

## Reproducible numbers (run them yourself)

| Command | What it proves |
|---|---|
| `python -m pytest backend/tests -q` | 154 tests: bands, idempotent replay, webhook signature honesty, novel-ring detection, negative control, injection sanitization, ledger tamper-evidence |
| `python data/generate_synthetic.py` | GBDT quality vs an **independent** label process + FP cost table |
| `python scripts/bench_latency.py` | real latency: sequential per-payment p50/p95/p99 |
| `curl localhost:8000/api/v1/model/report` | live honest-metrics card |

### Model quality — synthetic sanity check (not real-world performance)

`data/ground_truth.py` generates labels via a process that shares **zero code**
with the scorer: nonlinear interaction terms (`cod ∧ mismatch ∧ rto>0.4`,
synthetic-identity conjunctions), a merchant-category confounder shifting amounts
and fraud rates together, and 6.5% flipped labels. Latest run (seed 1337, 6k rows,
8.65% prevalence):

```
AUPRC                 : 0.095   (baseline prevalence 0.086)
Bayes ceiling AUPRC   : 0.114   (irreducible label-noise bound)
efficiency vs ceiling : 83%
flag riskiest 1%      : P=0.100  R=0.012  FP/1k-legit=9.9
flag riskiest 5%      : P=0.090  R=0.052  FP/1k-legit=49.8
```

Read that honestly: on a deliberately hostile benchmark (confounder + annotation
noise), the tabular GBDT reaches 83% of the theoretical ceiling but modest
absolute lift. At fixed flag-rates (riskiest 1% / 5%) lift is tiny (R=0.012 /
0.052).

> **⚠️ Standalone GBDT recall at any calibrated threshold (p≥0.50 / 0.70 /
> 0.90) is 0% on this synthetic benchmark (`python
> data/generate_synthetic.py` current output: P=0.000 R=0.000 flagged 0–2);
> the model is used only for SHAP explanation surfacing and policy-floor
> inputs, not as a standalone detector. Ring detection on graph topology is
> the actual headline claim — the GBDT is supplementary.**

Policy guardrails (hard floors on fan-out ≥5 devices etc.) guarantee HIGH-band
escalation for extreme patterns regardless of model output.

Real-data validation: `python scripts/train_real_data.py` is wired to train a fresh
model on the [IEEE-CIS Fraud Detection dataset](https://www.kaggle.com/c/ieee-fraud-detection)
(download required; the script prints instructions when absent and never invents
numbers). **This validation has not been run yet** — the script and column mapping
are complete, but the IEEE-CIS dataset requires a Kaggle account download. This is
a stated next step, not a completed result.

### Latency — measured, not invented

`python scripts/bench_latency.py`, local dev box, single uvicorn process
(fresh run 2026-08-28, Windows 10 build 26200, Python 3.11.9, commit b36e0d5, in-memory NetworkX, no Redis/Neo4j):

```
SEQUENTIAL (n=200) — the per-payment decision path:
  p50=53.3ms  p95=69.7ms  p99=78.1ms  max=100.6ms  18 req/s single-stream
CONCURRENT (n=600, c=10):
  p50=376.8ms  p95=436.2ms  p99=474.0ms  throughput 26 req/s over 22.7s
```

Conditions: Windows localhost transport degrades under high connection concurrency
even for hello-world (verified with a bare Starlette control app); the
sequential figure is the representative SLA measurement here. Linux/uvloop
production numbers will differ. See `LIMITATIONS.md` Phase 6 for the same
canonical numbers and caveats (single source of truth).

Historical note: a prior run (pre-2026-08-28) reported p50=17.0ms / 52 req/s;
that figure was from an earlier machine/commit and is retained only for
comparison — the numbers above are the current reproducible measurement.

## The bounded agent (defense-only)

A state machine, not an LLM with tools. Whitelisted actions only:

| Score | Band | Action |
|---|---|---|
| 0–30 | LOW | `AUTO_APPROVE` |
| 31–70 | MEDIUM | `STEP_UP_AUTHENTICATION` (reversible OTP challenge) |
| 71–100 | HIGH | `PAUSE_PAYOUT_AND_GENERATE_DISPUTE_DOSSIER` (24h hold + evidence pack) |

The system **never** moves, blocks, or retaliates against customer funds beyond a
reversible platform-side payout pause; there is no offense-capable code path.
LLM involvement is limited to drafting dossier text inside a strict Pydantic-
validated schema, from sanitized inputs, with deterministic template fallback.

### False-positive cost framing

At the measured operating points, holding the riskiest 1% of transactions costs
~10 legitimate holds per 1,000 (~₹1.8L review friction at ₹18.5k avg ticket) to
catch fraud early in its lifecycle — versus full ticket + logistics loss per
missed RTO/mule event. Holds are reversible within 24h; step-ups convert genuine
customers into verified sales. Humans adjudicate anything irreversible.

## Also included (extensions — not headline claims)

- **RTO/COD abuse scoring**: COD + address mismatch + RTO history triggers hard
  policy floors (80+) independent of the model.
- **LLM dispute dossiers**: strict-schema evidence packs (GPT-4o-mini or template
  fallback), reason codes, recommended actions.
- **Tamper-evident audit ledger**: SHA-256 chained double-entry pairs; O(1)
  integrity probes at `/healthz`, deep scan at `/api/v1/ledger/stats?deep=true`.
- **Idempotency middleware**: Redis-backed (in-proc TTL fallback), replay-safe
  decisions via `X-Idempotency-Key`.

## Security notes

- Webhooks: HMAC-SHA256 verified when `RAZORPAY_WEBHOOK_SECRET` is set; without
  it responses explicitly report `webhook_signature_verified: false` plus a skip
  reason (never silently "verified"). Set `RAZORPAY_REQUIRE_WEBHOOK_SECRET=1`
  in production to reject unsigned traffic outright (403).
- Prompt injection: all attacker-controlled strings (VPAs, emails, notes) pass a
  sanitizer before any LLM call — control/zero-width chars stripped, injection
  markers detected and everything after them dropped, lengths capped; tested in
  `test_prompt_injection_is_neutralized`.
- Secrets live in env vars only; nothing is hardcoded or committed.

## Model card (summary)

- **Detects**: device→identity fan-out rings; velocity/new-account bursts;
  COD-RTO abuse patterns; synthetic-identity conjunctions.
- **Does not detect**: off-platform collusion with no shared entities; fraud on
  identifiers we've never seen (cold start); anything requiring cross-merchant
  data we don't have.
- **Validated on**: decoupled synthetic GT (see above); IEEE-CIS mapping provided
  as script; live-API ring-recovery + negative-control tests.
- **Known failure modes**: heavy label noise caps structural confidence (fixed
  thresholds look sparse by design); confounder leakage if merchant mix shifts;
  graph features assume identifier stability (rotating devices evade fan-out).

## Path to production (what this is not)

This is a hackathon prototype, not a production deployment. A senior reviewer
should know exactly what stands between this and a real system:

- **Training data**: Real chargeback-labeled transaction data with a proper
  time-based holdout (not synthetic ground truth with artificial label noise).
- **Device fingerprinting**: A real vendor (e.g. FingerprintJS, ThreatMetrix)
  instead of self-reported `device_id` — the current identifier is trivially
  spoofed.
- **Human review UI**: A queue for HIGH-band holds where analysts can approve,
  escalate, or release within the 24h window.
- **Compliance controls**: PCI-adjacent data handling, audit log retention,
  PII redaction in LLM calls, SOC-2-style access controls.
- **Incident response runbook**: What happens when the detector fires on a
  legitimate customer during a festival sale spike? Who pages, what SLA?
- **Multi-region failover**: The ledger and graph state are single-node in-memory.
  Production requires Redis Cluster or equivalent for horizontal scaling.
- **Real load testing**: Full 1,000+ RPS sustained concurrency on Linux with
  Redis/Neo4j network hops, not localhost transport.

Naming these gaps accurately, unprompted, is the point — not pretending they
don't exist.

## Quickstart

```bash
# Backend (canonical app factory lives in backend/app)
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --port 8000    # entrypoint; /healthz · /metrics · /docs (if DOCS_ENABLED=1)

# Frontend (now lives in frontend/)
cd frontend && npm install && npm run dev   # dashboard on http://localhost:3000
```

Optional env (see `.env.example`): `ENVIRONMENT`, `DOCS_ENABLED`,
`REDIS_URL`, `NEO4J_URI`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
`LLM_MODEL`, `RAZORPAY_WEBHOOK_SECRET`, `REQUIRE_WEBHOOK_SECRET`,
`IDEMPOTENCY_TTL_SECONDS`, `NEXT_PUBLIC_API_BASE`. Full stack:
`docker compose up --build`.

> **Restructured (Section 1.1):** backend source now lives under `backend/app/`
> (api/v1, core, models, services, infrastructure) with backward-compatible shims
> at the old `backend/` paths. Frontend was moved into `frontend/`. See
> [ARCHITECTURE.md](ARCHITECTURE.md) and [DECISIONS.md](DECISIONS.md).

See [ARCHITECTURE.md](ARCHITECTURE.md) for the component map and the actual file
tree of this repo.
