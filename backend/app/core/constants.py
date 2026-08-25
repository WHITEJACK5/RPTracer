"""Canonical risk-band, color and metric-name constants for TRACER.

All thresholds live here so policy, engine and API layers share one source of
truth. Importing this module has no side effects (stdlib only).
"""
from __future__ import annotations

# --- Bounded-agent policy bands (defense-only decision floors) ---------------
BAND_APPROVE_MAX: int = 30     # 0-30   -> AUTO_APPROVE
BAND_STEPUP_MAX: int = 70      # 31-70  -> STEP_UP_AUTHENTICATION
                               # 71-100 -> PAUSE_PAYOUT + DISPUTE_DOSSIER

RISK_COLORS: dict[str, str] = {
    "LOW": "#22c55e",
    "MEDIUM": "#f59e0b",
    "HIGH": "#ef4444",
}

# --- Prometheus metric names (kept stable for dashboard/Grafana) ------------
METRIC_SCORING_LATENCY = "tracer_scoring_latency_seconds"
METRIC_DECISIONS = "tracer_decisions_total"
METRIC_GRAPH_NODES = "tracer_graph_nodes_total"
METRIC_MODEL_DRIFT = "tracer_model_drift_score"
METRIC_REVIEW_QUEUE = "tracer_review_queue_size"

# Histogram buckets required by the spec (plus wider tails for p99 visibility).
SCORING_LATENCY_BUCKETS = (0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0)

# --- Default per-client rate limits (requests / minute) ----------------------
DEFAULT_IP_LIMIT_PER_MIN = 100
DEFAULT_MERCHANT_LIMIT_PER_MIN = 1000

# --- Idempotency / cache defaults -------------------------------------------
DEFAULT_IDEMPOTENCY_TTL_SECONDS = 600
FEATURE_STORE_TTL_SECONDS = 300

# --- Drift alert threshold (Population Stability Index) ----------------------
DRIFT_ALERT_THRESHOLD = 0.2

# --- Sanitization limits -----------------------------------------------------
SANITIZE_MAX_LEN = 500
