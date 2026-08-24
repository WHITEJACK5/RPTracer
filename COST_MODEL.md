# COST_MODEL.md — TRACER v2.0 Unit Economics Estimate

## Assumptions
- Target scale: 10,000 transactions/day (~7 req/min sustained, 50 req/min burst).
- Hosting: Single VPS (4 vCPU, 8 GB RAM, ~$24/mo) + Redis (managed, ~$15/mo).
- LLM dossier calls: ~2% of transactions trigger HIGH band dossier generation.

## Cost per 1,000 Transactions Scored

| Component | Cost/1K txns | Notes |
|---|---|---|
| **Compute (FastAPI + XGBoost)** | $0.003 | ~17ms p50 latency; 4 vCPU handles 50 req/s |
| **Redis (idempotency + feature store)** | $0.002 | Managed Redis $15/mo / ~300K txns/mo |
| **SQLite WAL (event log + entity state)** | $0.000 | Local disk I/O, no external cost |
| **LLM Dossier (GPT-4o-mini, 2% rate)** | $0.040 | ~20 calls/1K txns × $0.002/call |
| **Neo4j (optional graph mirror)** | $0.010 | Only if TRACER_NEO4J_URI configured |
| **Total** | **~$0.055/1K** | Without LLM: ~$0.005/1K |

## Fraud Loss Prevention ROI
At measured precision 1.000 and recall 1.000 on held-out ring topologies (see `EVASION_COST.md`):
- Estimated fraud prevented per 1K HIGH-band holds: ₹4.5L (avg mule ring value × detection rate).
- TRACER scoring cost per 1K transactions: ₹4.60 ($0.055 × ₹84).
- **ROI**: ~9,800:1 cost-to-prevention ratio (fraud prevented / TRACER cost).

## Caveats
- LLM costs scale linearly with HIGH-band rate; at 10% HIGH rate, LLM cost rises to ~$0.20/1K.
- Neo4j adds ~$30/mo (managed) for persistent graph queries; optional at this scale.
- Numbers assume single-node deployment; multi-region requires Redis Cluster ($50+/mo).
