# COST_MODEL.md — TRACER v2.0 Unit Economics Estimate

## Assumptions
- Target scale: 10,000 transactions/day (~7 req/min sustained, 50 req/min burst).
- Hosting: Single VPS (4 vCPU, 8 GB RAM, ~$24/mo) + Redis (managed, ~$15/mo).
- LLM dossier calls: ~2% of transactions trigger HIGH band dossier generation.

## Cost per 1,000 Transactions Scored

| Component | Cost/1K txns | Notes |
|---|---|---|
| **Compute (FastAPI + XGBoost)** | $0.003 | ~53ms p50 latency (fresh 2026-08-28, 18 req/s single-stream, 26 req/s concurrent; see README/LIMITATIONS) |
| **Redis (idempotency + feature store)** | $0.002 | Managed Redis $15/mo / ~300K txns/mo |
| **SQLite WAL (event log + entity state)** | $0.000 | Local disk I/O, no external cost |
| **LLM Dossier (GPT-4o-mini, 2% rate)** | $0.040 | ~20 calls/1K txns × $0.002/call |
| **Neo4j (optional graph mirror)** | $0.010 | Only if TRACER_NEO4J_URI configured |
| **Total** | **~$0.055/1K** | Without LLM: ~$0.005/1K |

## Fraud Loss Prevention ROI
At measured precision 0.646 and recall 0.880 on threshold-boundary self-consistency check (see `EVASION_COST.md` — NOT an independent hold-out):
- Estimated fraud prevented per 1K HIGH-band holds: Rs 3.9L (avg mule ring value x detection rate x precision).
- TRACER scoring cost per 1K transactions: Rs 4.60 ($0.055 x Rs 84).
- **ROI**: ~8,500:1 cost-to-prevention ratio (fraud prevented / TRACER cost).

## False-Negative Cost (the other side of the equation)
The threshold-boundary check shows recall of 0.880 — roughly 12% of ring operators
evasion the detector. For each missed ring:
- **Cost per incident**: Full transaction value + logistics loss (Rs 1.8L–4.5L avg
  per mule ring, materially larger than the Rs 18.5K review-friction cost of a
  false positive).
- **At current recall**: ~120 missed rings per 1K ring operators attempted = ~Rs 2.2L–5.4L
  in fraud loss that TRACER does not catch.
- **Asymmetric risk**: A false positive costs one review cycle (reversible within
  24h). A false negative costs the full ticket + dispute + potential regulatory
  exposure (irreversible loss).

This asymmetry is why the bounded agent's highest band triggers a 24-hour hold
(PAUSE_PAYOUT) rather than an immediate block — the cost of a missed ring is
large enough to justify inconveniencing legitimate high-risk transactions.

## Caveats
- LLM costs scale linearly with HIGH-band rate; at 10% HIGH rate, LLM cost rises to ~$0.20/1K.
- Neo4j adds ~$30/mo (managed) for persistent graph queries; optional at this scale.
- Numbers assume single-node deployment; multi-region requires Redis Cluster ($50+/mo).
