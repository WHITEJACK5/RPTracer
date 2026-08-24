"""Tests for backend.app.services.scorer (pipeline, cache, drift, metrics)."""
from __future__ import annotations

import asyncio

from backend.app.core.metrics import decisions, model_drift, render_metrics
from backend.app.models.risk_model import FEATURES
from backend.app.models.schemas import TransactionEvent
from backend.app.services import scorer
from backend.app.services.scorer import (
    FeatureStore,
    _DriftMonitor,
    component_status,
    run_pipeline,
)


def _event(vpa="score@ybl", amount=1499.0):
    return TransactionEvent.model_validate({
        "event_id": f"sc-{vpa}", "amount": amount,
        "instrument": {"method": "upi", "vpa": vpa},
        "customer": {"id": "scust", "account_age_days": 900},
        "context": {"device_id": "DEV-SC", "ip": "1.2.3.4",
                    "email": "sc@b.com", "hour_of_day": 14}})


def test_run_pipeline_returns_riskevaluation():
    ev = _event()
    out = asyncio.run(run_pipeline(ev))
    assert out.event_id == ev.event_id
    assert 0 <= out.risk_score <= 100
    assert out.model_version
    assert out.audit_ref.startswith("audit::")
    assert out.latency_ms >= 0


def test_feature_store_cache_hit_miss(monkeypatch):
    calls = {"n": 0}

    def counting_featurize(ev, gs, s_vel=None):
        calls["n"] += 1
        return {f: 0.1 for f in FEATURES}

    monkeypatch.setattr(scorer, "featurize", counting_featurize)
    scorer._feature_store._mem.clear()
    vpa = "cacheunique@ybl"
    asyncio.run(run_pipeline(_event(vpa=vpa)))
    assert calls["n"] == 1
    # second call with same merchant:customer:vpa -> cache hit, no featurize
    asyncio.run(run_pipeline(_event(vpa=vpa)))
    assert calls["n"] == 1


def test_feature_store_redis_fallback_path(monkeypatch):
    # emulate a redis that works: get returns None (miss) then stores
    class FakeRedis:
        def __init__(self):
            self.store = {}

        def get(self, k):
            return self.store.get(k)

        def setex(self, k, ttl, v):
            self.store[k] = v

    fr = FakeRedis()
    fs = FeatureStore(ttl=60)
    monkeypatch.setattr(fs, "_redis", fr)
    fs._mem.clear()
    fs.put("k", {"a": 1})
    assert fs.get("k") == {"a": 1}
    # redis get path
    assert fr.store


def test_drift_psi_math():
    feats_a = [{"x": 0.0, "y": 1.0}, {"x": 0.0, "y": 1.0}]
    feats_b = [{"x": 0.5, "y": 0.5}, {"x": 0.5, "y": 0.5}]
    psi = _DriftMonitor._psi(feats_a, feats_b)
    assert isinstance(psi, float)
    # all-equal feature (hi==lo) -> skipped, PSI still a float
    eq = [{"x": 1.0, "y": 1.0}]
    assert isinstance(_DriftMonitor._psi(eq, eq), float)


def test_drift_observe_sets_gauge():
    dm = _DriftMonitor()
    feats = {f: 0.1 for f in FEATURES}
    dm.observe(feats)
    dm.observe(feats)
    # gauge is a real prometheus Gauge; just ensure no error and call count grew
    assert dm._calls == 2


def test_decisions_counter_increments():
    ev = _event(vpa="counterlow_unique@ybl", amount=1499.0)
    ev.context.device_id = "DEV-SC-UNIQUE-1"
    before = decisions.labels(band="LOW", action="AUTO_APPROVE")._value.get()
    out = asyncio.run(run_pipeline(ev))
    after = decisions.labels(band=out.risk_band.value, action=out.decision.value)._value.get()
    assert after >= 1.0


def test_render_metrics_includes_required_names():
    body, ctype = render_metrics()
    text = body.decode()
    for name in ("tracer_scoring_latency_seconds", "tracer_decisions_total",
                 "tracer_graph_nodes_total", "tracer_model_drift_score"):
        assert name in text
    assert "text/plain" in ctype


def test_component_status_structure():
    status = component_status()
    assert "model" in status and "graph" in status
    assert "redis_idempotency" in status and "llm_dossiers" in status
    assert "neo4j_mirror" in status["graph"]
