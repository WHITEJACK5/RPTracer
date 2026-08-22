"""Core risk pipeline — the single orchestration point for evaluate + webhooks.

    edge -> graph -> featurize -> GBDT -> policy floors -> SHAP
        -> bounded agent state machine -> double-entry ledger

Runs in a threadpool so the async event loop stays free under load.
"""
from __future__ import annotations

import time
from typing import Any

from fastapi.concurrency import run_in_threadpool

from backend.agents.bounded_responder import decide
from backend.agents.dispute_generator import generate_dossier
from backend.config import band_for
from backend.core.audit import get_ledger
from backend.graph.mule_detector import get_detector
from backend.models.risk_model import featurize, get_risk_model, policy_floor
from backend.models.shap_explainer import explain
from backend.schemas import RiskEvaluation, TransactionEvent


async def run_pipeline(event: TransactionEvent,
                       force_high: bool = False) -> RiskEvaluation:
    t0 = time.perf_counter()

    graph, gs = await run_in_threadpool(get_detector().observe, event)

    feats = await run_in_threadpool(featurize, event, gs)
    model = get_risk_model()
    proba = await run_in_threadpool(model.probability, feats)
    floor = await run_in_threadpool(policy_floor, feats, gs)

    score = int(round(max(proba * 100.0, floor)))
    if force_high:                       # dispute webhook => dossier path guaranteed
        score = max(score, 74)
    score = max(0, min(100, score))

    top_factors = explain(score, feats)
    evaluation, _trace = decide(
        event=event, score=score, top_factors=top_factors, graph=graph,
        dossier_builder=generate_dossier, model_version=model.version(),
    )

    audit_hash = get_ledger().append(
        debit_account=f"risk_engine::{event.event_id}",
        credit_account="merchant_protection",
        amount=float(score),
        refs={"event_id": event.event_id, "decision": evaluation.decision.value,
              "band": band_for(score), "model": model.version()},
    )
    evaluation.audit_ref = f"audit::{audit_hash[:24]}"
    evaluation.latency_ms = round((time.perf_counter() - t0) * 1000, 2)
    return evaluation


def component_status() -> dict[str, Any]:
    from backend.config import NEO4J_URI, OPENAI_API_KEY, REDIS_URL

    detector = get_detector()
    model = get_risk_model()
    return {
        "model": {"kind": model.kind, "version": model.version()},
        "graph": {"nodes": detector.g.number_of_nodes(),
                  "edges": detector.g.number_of_edges(),
                  "neo4j_mirror": bool(NEO4J_URI)},
        "redis_idempotency": bool(REDIS_URL),
        "llm_dossiers": bool(OPENAI_API_KEY),
    }
