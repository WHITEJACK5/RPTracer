"""LLM Chargeback Dispute Dossier generator.

Primary path: OpenAI-compatible chat completion (GPT-4o-mini / Claude Haiku via
a compatible gateway) with STRICT JSON output validated against our Pydantic
schema. Any failure — missing key, timeout, schema violation — deterministically
falls back to a template dossier assembled from live engine evidence. The agent
is therefore *bounded*: it can only ever emit the dossier schema.
"""
from __future__ import annotations

import json
import time
import uuid
from typing import Any

from backend.config import ANTHROPIC_API_KEY, LLM_MODEL, OPENAI_API_KEY
from backend.models.shap_explainer import reason_codes as compute_reason_codes
from backend.schemas import (
    DisputeDossier,
    GraphEvidence,
    ShapContribution,
    TransactionEvent,
)

_LLM_TIMEOUT_S = 6.0


def _template_dossier(
    ev: TransactionEvent,
    score: int,
    shap: list[ShapContribution],
    graph: GraphEvidence,
) -> DisputeDossier:
    codes = compute_reason_codes({}, {"mule_ring_score": graph.ring_confidence * 100}) \
        if not shap else [c.feature.upper() for c in shap[:4]]
    evidence = [
        f"Transaction {ev.event_id}: ₹{ev.amount:,.2f} via "
        f"{ev.instrument.method.upper()} at {time.strftime('%Y-%m-%d %H:%M IST', time.localtime(ev.timestamp_ms / 1000))}",
        f"Customer {ev.customer.id} · account age {ev.customer.account_age_days} days · "
        f"historical RTO rate {ev.customer.rto_rate_history:.0%}",
        f"Instrument: VPA={ev.instrument.vpa or '—'} card_fp={ev.instrument.card_fingerprint or '—'}",
        f"Network: device {ev.context.device_id or '—'} · IP {ev.context.ip or '—'} · "
        f"graph component of {graph.component_size} entities · fan-out {graph.shared_device_vpas}",
        f"Risk score {score}/100 with SHAP attribution from GBDT model (see reason codes)",
    ]
    if graph.ring_detected:
        evidence.append(
            f"MULE RING: {len(graph.mule_nodes)} linked VPAs flagged across shared devices"
        )
    return DisputeDossier(
        dossier_id=f"dossier-{uuid.uuid4().hex[:12]}",
        generated_by="template",
        title=f"Payout hold & dispute pack — {ev.event_id}",
        executive_summary=(
            f"TRACER paused payout for ₹{ev.amount:,.2f} (risk {score}/100). "
            f"{graph.summary}. Evidence pack compiled for Razorpay dispute workflow; "
            f"recommended manual fraud-desk review within 24h."
        ),
        evidence=evidence,
        shap_reason_codes=codes,
        recommended_actions=[
            "Freeze settlement of this payment in Razorpay dashboard",
            "Trigger STEP_UP re-KYC email/SMS to customer",
            "Attach this dossier to any incoming chargeback within SLA",
            "Add instrument fingerprints to watchlist for 90 days",
        ],
        regulatory_note=(
            "Defense-only action under RBI digital-payment guidelines: no customer "
            "funds were moved beyond the platform-mandated payout pause."
        ),
    )


def _llm_prompt(ev: TransactionEvent, score: int,
                shap: list[ShapContribution], graph: GraphEvidence) -> dict[str, Any]:
    system = (
        "You are TRACER's dispute analyst for Razorpay merchants. Return ONLY JSON "
        "matching: {title: str, executive_summary: str, evidence: string[5], "
        "recommended_actions: string[4], regulatory_note: str}. Be factual, terse, "
        "compliance-safe. Never invent data absent from the provided context."
    )
    user = json.dumps({
        "event": ev.model_dump(),
        "risk_score": score,
        "top_factors": [{"f": s.feature, "push": s.contribution} for s in shap],
        "graph_evidence": graph.model_dump(),
    })
    return {"role": "user", "content": user}, system


def generate_dossier(
    ev: TransactionEvent,
    score: int,
    shap: list[ShapContribution],
    graph: GraphEvidence,
) -> DisputeDossier:
    base = _template_dossier(ev, score, shap, graph)
    if not OPENAI_API_KEY and not ANTHROPIC_API_KEY:
        return base
    try:
        import httpx

        user_msg, system = _llm_prompt(ev, score, shap, graph)
        headers = {"Authorization": f"Bearer {OPENAI_API_KEY}"}
        resp = httpx.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json={
                "model": LLM_MODEL,
                "messages": [{"role": "system", "content": system}, user_msg],
                "response_format": {"type": "json_object"},
                "temperature": 0.2,
            },
            timeout=_LLM_TIMEOUT_S,
        )
        resp.raise_for_status()
        payload = json.loads(resp.json()["choices"][0]["message"]["content"])
        return DisputeDossier(
            **{**base.model_dump(),
               "title": payload["title"],
               "executive_summary": payload["executive_summary"],
               "evidence": payload["evidence"],
               "recommended_actions": payload["recommended_actions"],
               "regulatory_note": payload.get("regulatory_note", base.regulatory_note),
               "generated_by": "llm"}
        )
    except Exception:
        return base                      # bounded fallback: template dossier
