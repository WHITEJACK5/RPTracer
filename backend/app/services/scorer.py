"""Core risk pipeline service — single orchestration point for evaluate + webhooks.

    edge -> graph -> featurize -> GBDT -> policy floors -> SHAP
        -> bounded agent state machine -> double-entry ledger

Hardening layered on top of the original engine:
* Feature-store cache (Redis 5-min TTL, in-memory fallback) keyed by identifier.
* Drift detection: PSI of the rolling incoming feature distribution vs a
  boot-time reference window; logs an alert and updates the Prometheus gauge
  when the drift score exceeds the configured threshold.
* SHAP attribution is computed off the event loop (threadpool) and LRU-cached.
* Prometheus latency histogram + decision counter are updated on every call.
"""
from __future__ import annotations

import hashlib
import json
import math
import threading
import time
from collections import deque
from typing import Any

from fastapi.concurrency import run_in_threadpool

from backend.app.core.config import (
    FEATURE_STORE_TTL_SECONDS,
    band_for,
    settings,
)
from backend.app.core.constants import DRIFT_ALERT_THRESHOLD
from backend.app.core.metrics import decisions, model_drift, scoring_latency
from backend.app.models.risk_model import featurize, get_risk_model, policy_floor
from backend.app.models.schemas import RiskEvaluation, TransactionEvent
from backend.app.models.shap_explainer import explain
from backend.app.services.graph_detector import get_detector
from backend.app.services.ledger_service import get_ledger
from backend.app.services.llm_dossier import decide, generate_dossier

_REFERENCE_CAPTURE = 500
_ROLLING_WINDOW = 500
_PSI_EVERY = 50


class FeatureStore:
    """Redis-backed feature cache with an in-memory TTL fallback."""

    def __init__(self, ttl: int) -> None:
        self.ttl = ttl
        self._redis = None
        try:
            from backend.app.infrastructure.redis_client import get_redis

            self._redis = get_redis()
        except Exception:
            self._redis = None
        self._mem: dict[str, tuple[float, Any]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Any | None:
        if self._redis is not None:
            try:
                raw = self._redis.get(f"tracer:fs:{key}")
                if raw is not None:
                    return json.loads(raw)
            except Exception:
                pass
        with self._lock:
            hit = self._mem.get(key)
            if not hit:
                return None
            expires, value = hit
            if expires < time.monotonic():
                del self._mem[key]
                return None
            return value

    def put(self, key: str, value: Any) -> None:
        if self._redis is not None:
            try:
                self._redis.setex(
                    f"tracer:fs:{key}", self.ttl, json.dumps(value))
                return
            except Exception:
                pass
        with self._lock:
            self._mem[key] = (time.monotonic() + self.ttl, value)


class _DriftMonitor:
    """PSI-based population-stability monitor over incoming features."""

    def __init__(self) -> None:
        self._reference: list[dict[str, float]] = []
        self._window: deque[dict[str, float]] = deque(maxlen=_ROLLING_WINDOW)
        self._calls = 0
        self._lock = threading.Lock()

    def observe(self, feats: dict[str, float]) -> None:
        from backend.app.models.risk_model import FEATURES

        vec = {f: float(feats.get(f, 0.0)) for f in FEATURES}
        with self._lock:
            if len(self._reference) < _REFERENCE_CAPTURE:
                self._reference.append(vec)
            self._window.append(vec)
            self._calls += 1
            if self._calls % _PSI_EVERY == 0 and len(self._reference) >= 100:
                score = self._psi(self._reference, list(self._window))
                model_drift.set(score)
                if score > DRIFT_ALERT_THRESHOLD:
                    import structlog

                    structlog.get_logger().warning(
                        "model_drift_alert", psi=round(score, 3),
                        threshold=DRIFT_ALERT_THRESHOLD)

    @staticmethod
    def _psi(expected: list[dict], actual: list[dict], bins: int = 10) -> float:
        if not expected or not actual:
            return 0.0
        keys = list(expected[0].keys())
        total = 0.0
        count = 0
        for k in keys:
            ev = sorted(d[k] for d in expected)
            av = sorted(d[k] for d in actual)
            n = len(ev)
            edges = [ev[min(n - 1, int((b + 1) / bins * n))] for b in range(bins)]
            edges = sorted(set(edges))
            if len(edges) < 2:
                edges = [min(ev), max(ev)]
            lo, hi = edges[0], edges[-1]
            if hi == lo:
                continue
            span = (hi - lo) / max(len(edges) - 1, 1)

            def pct(arr: list[float], edges: list[float], span: float) -> list[float]:
                out = []
                for e in edges[:-1]:
                    c = sum(1 for x in arr if e <= x < e + span)
                    out.append(max(c / len(arr), 1e-4))
                return out

            ep, ap = pct(ev, edges, span), pct(av, edges, span)
            psi = sum((a - e) * math.log(a / e) for e, a in zip(ep, ap))
            total += psi
            count += 1
        return float(total / max(count, 1))


_feature_store = FeatureStore(FEATURE_STORE_TTL_SECONDS)
_drift = _DriftMonitor()
_shap_cache: dict[str, Any] = {}
_shap_lock = threading.Lock()


def _shap_cached(score: int, feats: dict[str, float]) -> list[Any]:
    key = f"{score}:{hashlib.md5(json.dumps(feats, sort_keys=True).encode()).hexdigest()}"
    with _shap_lock:
        hit = _shap_cache.get(key)
        if hit is not None:
            return hit
    result = explain(score, feats)
    with _shap_lock:
        if len(_shap_cache) > 2048:
            _shap_cache.clear()
        _shap_cache[key] = result
    return result


async def run_pipeline(event: TransactionEvent,
                       force_high: bool = False) -> RiskEvaluation:
    t0 = time.perf_counter()

    # Phase 1: Append to event log first (source of truth)
    from backend.app.services.event_log import get_event_log
    from backend.app.services.stream_worker import get_entity_state_store, get_stream_worker

    get_event_log().append(event)
    get_stream_worker().process_batch(50)

    graph, gs = await run_in_threadpool(get_detector().observe, event)

    # Fetch server-observed velocity for device or VPA
    ent_id = f"device:{event.context.device_id}" if event.context.device_id else f"vpa:{event.instrument.vpa}" if event.instrument.vpa else None
    s_vel = get_entity_state_store().get_server_velocity(ent_id, int(time.time() * 1000)) if ent_id else None

    fkey = f"{event.merchant_id}:{event.customer.id}:{event.instrument.vpa or event.event_id}"
    feats = _feature_store.get(fkey)
    if feats is None:
        feats = await run_in_threadpool(featurize, event, gs, s_vel)
        _feature_store.put(fkey, feats)
    else:
        feats = {**feats, "mule_confidence": _clip(feats.get("mule_confidence", 0.0))}

    model = get_risk_model()
    proba = await run_in_threadpool(model.probability, feats)
    floor = await run_in_threadpool(policy_floor, feats, gs)
    # Same-amount repeat pattern — amount-agnostic, purely repetition-driven (till 1000 range)
    try:
        from backend.app.services.amount_repeat import observe as _amt_repeat
        rep = _amt_repeat(event.context.device_id, float(event.amount))
        if rep.get("is_repeat_high"):
            floor = max(floor, 88)
        elif rep.get("is_repeat_medium"):
            floor = max(floor, 65)
    except Exception:
        pass

    score = int(round(max(proba * 100.0, floor)))
    if force_high and not model.is_degraded:
        score = max(score, 74)

    # Degraded mode cap: linear fallback can NEVER autonomously pause payouts (>70)
    if model.is_degraded:
        score = min(score, 70)
    score = max(0, min(100, score))

    _drift.observe(feats)
    top_factors = await run_in_threadpool(_shap_cached, score, feats)

    evaluation, _trace = decide(
        event=event, score=score, top_factors=top_factors, graph=graph,
        dossier_builder=generate_dossier, model_version=model.version(),
    )
    evaluation.degraded = model.is_degraded
    decision_band = band_for(score)

    # Phase 7: Insert HIGH-band decisions into human review queue
    if decision_band == "HIGH":
        from backend.app.services.review_queue import get_review_queue
        from backend.app.core.metrics import review_queue_size
        get_review_queue().insert(
            event_id=event.event_id, risk_score=score, risk_band=decision_band,
            decision=evaluation.decision.value, merchant_id=event.merchant_id,
            model_version=model.version(), degraded=model.is_degraded,
            feature_snapshot=feats, graph_evidence=gs,
        )
        counts = get_review_queue().count_by_status()
        review_queue_size.set(counts.get("pending_review", 0))

    # Phase 7: Enriched audit ledger — includes feature vector, model version, degraded flag
    audit_hash = get_ledger().append(
        debit_account=f"risk_engine::{event.event_id}",
        credit_account="merchant_protection",
        amount=float(score),
        refs={"event_id": event.event_id, "decision": evaluation.decision.value,
              "band": decision_band, "model": model.version(),
              "degraded": model.is_degraded,
              "code_path": "calibrated_linear" if model.is_degraded else "xgboost",
              "feature_snapshot": {k: round(v, 4) for k, v in feats.items()}},
    )
    evaluation.audit_ref = f"audit::{audit_hash[:24]}"
    evaluation.latency_ms = round((time.perf_counter() - t0) * 1000, 2)

    # --- observability -----------------------------------------------------
    scoring_latency.observe(time.perf_counter() - t0)
    decisions.labels(band=band_for(score), action=evaluation.decision.value).inc()
    _access_log(event, score, evaluation)
    _publish_alert(event, score, evaluation)

    return evaluation


def _publish_alert(event: TransactionEvent, score: int,
                   evaluation: RiskEvaluation) -> None:
    """Best-effort publish to the real-time alert stream (never blocks)."""
    try:
        from backend.app.core.events import publish_alert
        from backend.app.utils import short_hash

        band = band_for(score)
        level = "high" if band == "HIGH" else "warn" if band == "MEDIUM" else "info"
        publish_alert({
            "id": evaluation.audit_ref or short_hash(event.event_id),
            "ts": int(time.time() * 1000),
            "level": level,
            "title": f"{band} risk \u00b7 score {score}",
            "detail": f"merchant {event.merchant_id} \u00b7 {evaluation.decision.value}",
        })
    except Exception:
        pass


def _clip(x: float) -> float:
    return max(0.0, min(1.0, float(x)))


def _access_log(event: TransactionEvent, score: int, evaluation: RiskEvaluation) -> None:
    import structlog

    try:
        structlog.get_logger().info(
            "risk_decision",
            trace_id=evaluation.audit_ref,
            merchant_id=event.merchant_id,
            event_id=event.event_id,
            latency_ms=evaluation.latency_ms,
            risk_score=score,
            band=band_for(score),
            decision=evaluation.decision.value,
        )
    except Exception:
        pass


def component_status() -> dict[str, Any]:
    from backend.app.infrastructure.neo4j_client import is_configured
    from backend.app.infrastructure.redis_client import get_redis

    detector = get_detector()
    model = get_risk_model()
    return {
        "model": {"kind": model.kind, "version": model.version()},
        "graph": {"nodes": detector.g.number_of_nodes(),
                  "edges": detector.g.number_of_edges(),
                  "neo4j_mirror": is_configured()},
        "redis_idempotency": get_redis() is not None,
        "llm_dossiers": bool(settings.openai_api_key) or bool(settings.anthropic_api_key),
    }
