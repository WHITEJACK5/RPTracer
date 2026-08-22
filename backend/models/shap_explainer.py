"""SHAP-style additive attribution aligned to the production score.

Contributions decompose the FINAL risk score into signed per-feature pushes:

    contribution_i = w_i * (x_i - baseline_i) * k
    k chosen so that Σ contributions == (score - neutral_baseline)

This keeps gauge, reason codes and audit log perfectly consistent even when a
deterministic policy guardrail (not the GBDT) drove the final score.
"""
from __future__ import annotations

from typing import Any

from backend.models.risk_model import BASELINE, FEATURES, WEIGHTS
from backend.schemas import ShapContribution

_LABELS: dict[str, str] = {
    "amount_log": "Transaction size vs. population",
    "amount_gt_50k": "High-value order (₹50k+)",
    "is_cod": "Cash-on-delivery payment",
    "address_mismatch": "Billing / shipping address mismatch",
    "account_newness": "Brand-new customer account",
    "new_customer": "First-ever purchase at merchant",
    "txn_rate_1h": "Burst velocity (1h window)",
    "txn_rate_24h": "Velocity (24h window)",
    "amount_velocity": "Cumulative amount velocity (24h)",
    "avg_ticket_ratio": "Order far above user's average ticket",
    "device_spread": "Account seen across many devices",
    "device_fan_out": "One device linked to multiple payment identities",
    "vpa_degree": "Unusually well-connected VPA handle",
    "card_share": "Card fingerprint shared across accounts",
    "ip_crowding": "IP address crowded with unrelated devices",
    "rto_rate": "Historical Return-to-Origin rate",
    "night_hour": "Odd-hour transaction (00:00–05:00)",
    "disposable_email": "Disposable email domain",
    "mule_confidence": "Mule-ring topology match (graph heuristics)",
}

_VALUE_FORMATTERS: dict[str, Any] = {
    "amount_log": lambda v: f"₹{int(10 ** (min(v, 1.0) * 6)):,}",
    "rto_rate": lambda v: f"{v:.0%} RTO history",
    "mule_confidence": lambda v: f"{v:.0%} ring match",
    "device_fan_out": lambda v: f"{max(1, round(v * 15))} identities/device",
    "txn_rate_1h": lambda v: f"{max(1, round(v * 10))}/hr",
    "txn_rate_24h": lambda v: f"{max(1, round(v * 25))}/day",
}


def explain(final_score: int, feats: dict[str, float], top_k: int = 7) -> list[ShapContribution]:
    deltas = {f: WEIGHTS[f] * (feats.get(f, BASELINE[f]) - BASELINE[f]) for f in FEATURES}
    total = sum(deltas.values())
    target = max(final_score - 4, 0)          # 4 points = neutral-population base rate
    factor = (target / total) if abs(total) > 1e-9 else 0.0

    out = [
        ShapContribution(
            feature=f,
            label=_LABELS[f],
            value=_VALUE_FORMATTERS.get(f, lambda v: round(v, 2))(feats.get(f, 0.0)),
            contribution=round(d * factor, 1),
            direction="RISK_UP" if d * factor >= 0 else "RISK_DOWN",
        )
        for f, d in deltas.items()
    ]
    out.sort(key=lambda c: abs(c.contribution), reverse=True)
    return out[:top_k]


def reason_codes(feats: dict[str, float], gs: dict[str, float]) -> list[str]:
    """Compact machine-readable codes consumed by the dispute dossier."""
    f = {k: feats.get(k, 0.0) for k in
         ("device_fan_out", "is_cod", "address_mismatch", "rto_rate",
          "disposable_email", "account_newness", "txn_rate_24h", "night_hour")}
    codes: list[str] = []
    if gs.get("mule_ring_score", 0) >= 70:
        codes.append("GRAPH_MULE_RING")
    if f["device_fan_out"] >= 0.33:
        codes.append("DEVICE_FAN_OUT")
    if f["is_cod"] and f["address_mismatch"]:
        codes.append("COD_ADDRESS_MISMATCH")
    if f["rto_rate"] >= 0.45:
        codes.append("HIGH_RTO_HISTORY")
    if f["disposable_email"]:
        codes.append("DISPOSABLE_EMAIL")
    if f["account_newness"] >= 0.9:
        codes.append("NEW_ACCOUNT_BURST")
    if f["txn_rate_24h"] >= 0.6:
        codes.append("VELOCITY_ANOMALY")
    if f["night_hour"]:
        codes.append("ODD_HOUR")
    return codes or ["LOW_SIGNAL_PROFILE"]
