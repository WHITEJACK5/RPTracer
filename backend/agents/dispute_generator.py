"""LLM Chargeback Dispute Dossier generator.

Primary path: OpenAI-compatible chat completion (GPT-4o-mini / Claude Haiku via
a compatible gateway) with STRICT JSON output validated against our Pydantic
schema. Any failure — missing key, timeout, schema violation — deterministically
falls back to a template dossier assembled from live engine evidence. The agent
is therefore *bounded*: it can only ever emit the dossier schema.

Attack surface note: attacker-controlled strings (VPA handles, emails, notes)
are sanitized through _sanitize() BEFORE entering any LLM prompt or evidence
line — control characters stripped, injection markers neutralized, length
capped — and travel as JSON data values, never interpolated into instructions.
"""
from __future__ import annotations

import json
import os
import re
import time
import unicodedata
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
    # A detected injection marker truncates the remainder of the field: the
    # marker AND anything after it is attacker-authored by construction.
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
    email = _sanitize(ev.context.email or "")
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
                    "model": os.getenv("TRACER_ANTHROPIC_MODEL", "claude-3-haiku-20240307"),
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
