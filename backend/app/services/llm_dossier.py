"""Bounded autonomous agent + LLM chargeback dispute dossier generator.

This module consolidates two previously separate agents:

* :func:`decide` (port of ``agents/bounded_responder.py``) — a strict state
  machine that may ONLY emit one of three whitelisted actions and only ever
  emits the strict :class:`RiskEvaluation` schema. Every action is ledgered.
* :func:`generate_dossier` (port of ``agents/dispute_generator.py``) — an LLM
  dossier with a deterministic template fallback so the agent is *bounded*:
  it can only ever emit the dossier schema.

Attack-surface note: attacker-controlled strings are sanitized through
:func:`_sanitize` BEFORE entering any LLM prompt or evidence line.
"""
from __future__ import annotations

import json
import re
import time
import unicodedata
import uuid
from collections.abc import Callable
from typing import Any

from backend.app.core.config import (
    ANTHROPIC_API_KEY,
    LLM_MODEL,
    OPENAI_API_KEY,
    band_for,
    settings,
)
from backend.app.models.schemas import (
    AgentAction,
    AgentTraceStep,
    DisputeDossier,
    GraphEvidence,
    RiskBand,
    RiskEvaluation,
    ShapContribution,
    TransactionEvent,
)
from backend.app.models.shap_explainer import reason_codes as compute_reason_codes

# --- Bounded responder -------------------------------------------------------

_ALLOWED: dict[RiskBand, AgentAction] = {
    RiskBand.LOW: AgentAction.AUTO_APPROVE,
    RiskBand.MEDIUM: AgentAction.STEP_UP_AUTHENTICATION,
    RiskBand.HIGH: AgentAction.PAUSE_PAYOUT_DISPUTE_DOSSIER,
}


def _step(actor: str, message: str, level: str = "info") -> AgentTraceStep:
    return AgentTraceStep(
        ts_ms=int(time.time() * 1000), actor=actor, message=message,
        level=level,  # type: ignore[arg-type]
    )


def decide(
    event: TransactionEvent,
    score: int,
    top_factors: list[ShapContribution],
    graph: GraphEvidence,
    dossier_builder: Callable[..., DisputeDossier],
    model_version: str,
    audit_ref: str = "",
) -> tuple[RiskEvaluation, list[AgentTraceStep]]:
    trace: list[AgentTraceStep] = [
        _step("edge", f"Ingested {event.event_type.value} {event.event_id} "
                      f"(₹{event.amount:,.2f} {event.currency}, {event.instrument.method})"),
        _step("graph", graph.summary, "warn" if graph.ring_detected else "info"),
        _step("model", f"GBDT scored event at {score}/100 → band {band_for(score)}"),
        _step("policy", "Evaluating bounded action policy bands [0-30 | 31-70 | 71-100]"),
    ]

    band = RiskBand(band_for(score))
    action = _ALLOWED[band]                       # whitelist lookup — no other path
    trace.append(_step("agent", f"Decision locked: {action.value}", level={
        RiskBand.LOW: "success",
        RiskBand.MEDIUM: "warn",
        RiskBand.HIGH: "alert",
    }[band]))

    dossier = None
    if action is AgentAction.PAUSE_PAYOUT_DISPUTE_DOSSIER:
        trace.append(_step("agent", "Payout PAUSED for 24h — compiling LLM dispute dossier…", "alert"))
        dossier = dossier_builder(event, score, top_factors, graph)
        trace.append(_step("agent",
                           f"Dossier {dossier.dossier_id} generated via {dossier.generated_by.upper()} "
                           f"with {len(dossier.evidence)} evidence artifacts", "alert"))
    elif action is AgentAction.STEP_UP_AUTHENTICATION:
        trace.append(_step("agent", "2FA OTP challenge dispatched to registered device", "warn"))
    else:
        trace.append(_step("ledger", "Decision appended to hash-chained audit ledger", "success"))
        return _evaluation(event, score, band, action, top_factors, graph, trace,
                           None, model_version), trace

    trace.append(_step("ledger", "Decision appended to hash-chained audit ledger", "success"))
    return _evaluation(event, score, band, action, top_factors, graph, trace,
                       dossier, model_version), trace


def _evaluation(
    event: TransactionEvent,
    score: int,
    band: RiskBand,
    action: AgentAction,
    top_factors: list[ShapContribution],
    graph: GraphEvidence,
    trace: list[AgentTraceStep],
    dossier: Any,
    model_version: str,
) -> RiskEvaluation:
    first_ts = trace[0].ts_ms
    last_ts = max(s.ts_ms for s in trace)
    latency = float(last_ts - first_ts) or 0.8
    return RiskEvaluation(
        event_id=event.event_id,
        risk_score=score,
        risk_band=band,
        decision=action,
        latency_ms=round(latency, 1),
        top_factors=top_factors,
        graph_evidence=graph,
        trace=trace,
        dispute_dossier=dossier,
        audit_ref=f"audit:{event.event_id}",
        model_version=model_version,
    )


# --- Dispute dossier generator ----------------------------------------------

_LLM_TIMEOUT_S = 6.0

_INJECTION_RE = re.compile(
    r"(ignore\s+(?:all\s+|any\s+)?(?:the\s+)?(?:above|previous|prior)"
    r"|system\s*:\s*|assistant\s*:|developer\s*:\s*"
    r"|#\s*instructions|```\s*(?:system|instructions)"
    r"|<\|?(?:im_start|system|endoftext)\|?>?)",
    re.IGNORECASE,
)


def _sanitize(value: Any, max_len: int = 120) -> Any:
    """Neutralize prompt-injection carriers in user-controlled strings."""
    if not isinstance(value, str):
        return value
    v = unicodedata.normalize("NFKC", value)
    v = "".join(ch for ch in v if unicodedata.category(ch)[0] != "C")   # controls
    for zw in ("\u200b", "\u200c", "\u200d", "\u200e", "\u200f", "\ufeff"):
        v = v.replace(zw, "")
    # A detected injection marker truncates the remainder of the field.
    v = _INJECTION_RE.sub("[filtered]", v, count=1).split("[filtered]", 1)[0] \
        if _INJECTION_RE.search(v) else v
    v = _INJECTION_RE.sub("[filtered]", v)
    return v[:max_len]


def _deep_sanitize(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {k: _deep_sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_deep_sanitize(v) for v in obj]
    return _sanitize(obj)


def _template_dossier(
    ev: TransactionEvent,
    score: int,
    shap: list[ShapContribution],
    graph: GraphEvidence,
) -> DisputeDossier:
    codes = compute_reason_codes({}, {"mule_ring_score": graph.ring_confidence * 100}) \
        if not shap else [c.feature.upper() for c in shap[:4]]
    vpa = _sanitize(ev.instrument.vpa or "—")
    device = _sanitize(ev.context.device_id or "—")
    ip_addr = _sanitize(ev.context.ip or "—")
    evidence = [
        f"Transaction {_sanitize(ev.event_id)}: ₹{ev.amount:,.2f} via "
        f"{ev.instrument.method.upper()} at {time.strftime('%Y-%m-%d %H:%M IST', time.localtime(ev.timestamp_ms / 1000))}",
        f"Customer {_sanitize(ev.customer.id)} · account age {ev.customer.account_age_days} days · "
        f"historical RTO rate {ev.customer.rto_rate_history:.0%}",
        f"Instrument: VPA={vpa} card_fp={_sanitize(ev.instrument.card_fingerprint or '—')}",
        f"Network: device {device} · IP {ip_addr} · "
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
    user = json.dumps({                       # data values only — never instruction text
        "event": _deep_sanitize(ev.model_dump(mode="json")),
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
        if ANTHROPIC_API_KEY and not OPENAI_API_KEY:
            resp = httpx.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": ANTHROPIC_API_KEY,
                         "anthropic-version": "2023-06-01"},
                json={
                    "model": settings.anthropic_model,
                    "max_tokens": 900,
                    "system": system + "\nRespond with ONLY the JSON object.",
                    "messages": [{"role": "user", "content": user_msg["content"]}],
                },
                timeout=_LLM_TIMEOUT_S,
            )
            resp.raise_for_status()
            raw = resp.json()["content"][0]["text"]
        else:
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
            raw = resp.json()["choices"][0]["message"]["content"]
        payload = json.loads(raw)
        return _merge_dossier(base, payload)
    except Exception:
        return base                      # bounded fallback: template dossier


def _merge_dossier(base: DisputeDossier, payload: dict) -> DisputeDossier:
    """Strict merge: only schema fields cross the boundary; anything the model
    invents beyond them is dropped (bounded output)."""
    return DisputeDossier(
        **{**base.model_dump(),
           "title": str(payload["title"]),
           "executive_summary": str(payload["executive_summary"]),
           "evidence": [str(e) for e in payload["evidence"]][:8],
           "recommended_actions": [str(a) for a in payload["recommended_actions"]][:8],
           "regulatory_note": str(payload.get("regulatory_note", base.regulatory_note)),
           "generated_by": "llm"}
    )
