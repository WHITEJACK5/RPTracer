# PHASE0_AUDIT.md — TRACER Engineering Audit & Downgrade Log

This document records all capabilities, formulas, and pre-seeded states that were removed, downgraded, or quarantined during the Staff/Principal Engineer audit of TRACER v2.0.

---

## 1. Quarantined & Removed Code Paths
- **GraphSAGE / PyTorch Geometric Embeddings (`backend/graph/embeddings.py`)**:
  - *Status*: Quarantined to `legacy_unused/embeddings.py`.
  - *Reason*: The PyTorch Geometric GNN embedding module was referenced in architecture descriptions but was not imported or invoked during live `/api/v1/risk/evaluate` execution. To maintain strict engineering honesty, un-exercised GNN claims have been isolated from the live production path.

- **Boot-time Pre-seeded Graph State (`_seed_history()`)**:
  - *Status*: Removed from `MuleDetector.__init__` and `reseed()`.
  - *Reason*: Pre-populating memory with fake fraud rings (`DEV-MULE-RING-01`, etc.) at server boot created a false impression of pre-existing detection capability. The engine now boots with **zero entity state**. Dynamic demo graphs are generated exclusively by running real live API calls via `scripts/demo_sequence.py`.

---

## 2. Refactored Scorer & Degraded Mode
- **Calibrated-Linear Fallback Scorer (`RiskModel.kind == "calibrated-linear"`)**:
  - *Status*: Converted to an explicitly labeled **`DEGRADED_MODE`** path.
  - *Reason*: If XGBoost is unavailable or uncalibrated, the engine falls back to heuristic linear weights. To prevent silent activation and unsafe autonomous actions:
    1. A `WARNING: DEGRADED_MODE` log is emitted at startup and prediction time.
    2. API responses explicitly include `"degraded": true`.
    3. Degraded mode scores are capped at **<= 70** (MEDIUM band). Degraded mode can **never** autonomously trigger `PAUSE_PAYOUT_AND_GENERATE_DISPUTE_DOSSIER` (HIGH risk, >70).

---

## 3. Removed Uncalibrated Math
- **Exponential Confidence Formula (`1 - exp(-(fan_vpas-1)/6)`)**:
  - *Status*: Removed from `MuleDetector.observe()`.
  - *Reason*: The formula produced arbitrary pseudo-probabilities (e.g. 0.72, 0.98) not grounded in empirical calibration. Per principal operating rules, uncalibrated values are emitted only as structural fan-out metrics or structural risk tiers, never labeled as "calibrated confidence."

---

## 4. Test Suite Audit & Labeling
- Tests asserting threshold triggers (e.g. device fan-out >= 4) have been explicitly classified as **unit tests of rule mechanics**, not evidence of "generalization" or "novel detection."
- Empirical precision/recall and generalization metrics are evaluated on held-out datasets in Phase 4.
