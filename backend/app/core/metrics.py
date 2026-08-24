"""Prometheus metrics for TRACER — single definition point.

All gauges/counters/histograms are declared here so the dashboard and Grafana
can rely on stable names and label sets.
"""
from __future__ import annotations

from prometheus_client import (
    CONTENT_TYPE_LATEST,
    Counter,
    Gauge,
    Histogram,
    generate_latest,
)

from backend.app.core.constants import (
    METRIC_DECISIONS,
    METRIC_GRAPH_NODES,
    METRIC_MODEL_DRIFT,
    METRIC_SCORING_LATENCY,
    SCORING_LATENCY_BUCKETS,
)

# Scoring latency histogram (seconds). Required buckets: .01 .025 .05 .1.
scoring_latency = Histogram(
    METRIC_SCORING_LATENCY,
    "End-to-end risk scoring latency in seconds.",
    buckets=SCORING_LATENCY_BUCKETS,
)

# Decision outcomes labelled by band + action.
decisions = Counter(
    METRIC_DECISIONS,
    "Count of risk decisions by band and action.",
    labelnames=["band", "action"],
)

# Live graph size gauge (updated on every observe()).
graph_nodes = Gauge(
    METRIC_GRAPH_NODES,
    "Number of nodes currently in the mule-detection graph.",
)

# Model drift score gauge (Population Stability Index, higher = more drift).
model_drift = Gauge(
    METRIC_MODEL_DRIFT,
    "Population Stability Index of incoming features vs training baseline.",
)


def render_metrics() -> tuple[bytes, str]:
    """Return (body, content_type) for the /metrics endpoint."""
    return generate_latest(), CONTENT_TYPE_LATEST
