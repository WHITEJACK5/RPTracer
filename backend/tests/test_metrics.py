"""Prometheus /metrics endpoint tests."""
from __future__ import annotations


def test_metrics_endpoint_exposes_tracer_metrics(client) -> None:
    # generate at least one decision so counters are non-empty
    client.post("/api/v1/evaluate", json={
        "event_id": "metrics_1", "amount": 1499.0,
        "instrument": {"method": "upi", "vpa": "metrics@ybl"}})
    r = client.get("/metrics")
    assert r.status_code == 200
    text = r.text
    for name in ("tracer_scoring_latency_seconds",
                 "tracer_decisions_total",
                 "tracer_graph_nodes_total",
                 "tracer_model_drift_score"):
        assert name in text
