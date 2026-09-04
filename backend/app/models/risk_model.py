"""GBDT risk scorer — XGBoost trained on the DECOUPLED ground-truth process
(data/ground_truth.py — nonlinear interactions, confounder, label noise),
with a calibrated linear fallback so the engine never fails to boot.

Pipeline contract:
    featurize(event, graph_stats) -> named vector -> model probability (0..1)
    final_score = round(max(probability*100, policy_floor))
"""
from __future__ import annotations

import hashlib
import logging
import math
from typing import Any

logger = logging.getLogger("tracer.model")

from data.schema import FEATURE_NAMES

from backend.app.core.config import MODEL_PATH, MODEL_VERSION
from backend.app.models.schemas import TransactionEvent

FEATURES = FEATURE_NAMES          # canonical name list lives in data/schema.py

BASELINE: dict[str, float] = {
    "amount_log": 0.45, "amount_gt_50k": 0.03, "is_cod": 0.20,
    "address_mismatch": 0.05, "account_newness": 0.15, "new_customer": 0.10,
    "txn_rate_1h": 0.08, "txn_rate_24h": 0.06, "amount_velocity": 0.05,
    "avg_ticket_ratio": 0.13, "device_spread": 0.10, "device_fan_out": 0.07,
    "vpa_degree": 0.07, "card_share": 0.04, "ip_crowding": 0.09,
    "rto_rate": 0.08, "night_hour": 0.12, "disposable_email": 0.02,
    "mule_confidence": 0.05,
}

WEIGHTS: dict[str, float] = {
    "amount_log": 0.18, "amount_gt_50k": 0.22, "is_cod": 1.25,
    "address_mismatch": 1.20, "account_newness": 0.75, "new_customer": 0.60,
    "txn_rate_1h": 1.10, "txn_rate_24h": 0.95, "amount_velocity": 0.75,
    "avg_ticket_ratio": 0.50, "device_spread": 0.75, "device_fan_out": 3.20,
    "vpa_degree": 1.45, "card_share": 1.05, "ip_crowding": 0.85,
    "rto_rate": 1.40, "night_hour": 0.40, "disposable_email": 1.15,
    "mule_confidence": 3.40,
}
_BIAS = -3.55
# WEIGHTS/_BIAS above are an engineering PRIOR used by (a) the calibrated-linear
# fallback scorer when xgboost is unavailable and (b) SHAP-style attribution
# anchors. They are NOT the label function — training labels come exclusively
# from data/ground_truth.py (see RiskModel._train).

_DISPOSABLE_DOMAINS = {
    "mailinator.com", "tempmail.dev", "guerrillamail.com",
    "10minutemail.com", "yopmail.com", "burnermail.io", "trashmail.com",
}


def _clip01(x: float) -> float:
    return max(0.0, min(1.0, float(x)))


def featurize(ev: TransactionEvent, gs: dict[str, Any], server_velocity: dict[str, Any] | None = None) -> dict[str, float]:
    c, i = ev.customer, ev.instrument
    v_1h = server_velocity.get("txn_count_1h", ev.context.txn_count_1h) if server_velocity else ev.context.txn_count_1h
    v_24h = server_velocity.get("txn_count_24h", ev.context.txn_count_24h) if server_velocity else ev.context.txn_count_24h
    v_sum24h = server_velocity.get("amount_sum_24h", ev.context.amount_sum_24h) if server_velocity else ev.context.amount_sum_24h

    # Use server-observed velocity metrics if available
    v_1h = max(v_1h, ev.context.txn_count_1h)
    v_24h = max(v_24h, ev.context.txn_count_24h)
    v_sum24h = max(v_sum24h, ev.context.amount_sum_24h)

    prev_avg = (v_sum24h / max(v_24h, 1)) or ev.amount
    email_domain = (ev.context.email or "").split("@")[-1].lower()
    return {
        "amount_log": _clip01(math.log10(max(ev.amount, 10.0)) / 6.0),
        "amount_gt_50k": 1.0 if ev.amount > 50_000 else 0.0,
        "is_cod": 1.0 if i.is_cod else 0.0,
        "address_mismatch": 1.0 if ev.context.billing_shipping_mismatch else 0.0,
        "account_newness": _clip01(30.0 / max(c.account_age_days, 1)),
        "new_customer": 1.0 if c.new_customer else 0.0,
        "txn_rate_1h": _clip01(v_1h / 10),
        "txn_rate_24h": _clip01(v_24h / 25),
        "amount_velocity": _clip01(v_sum24h / 150_000),
        "avg_ticket_ratio": _clip01((ev.amount / max(prev_avg, 1.0)) / 8),
        "device_spread": _clip01(ev.context.distinct_devices_24h / 10),
        "device_fan_out": _clip01(gs.get("device_fan_out", 1) / 15),
        "vpa_degree": _clip01(gs.get("vpa_degree", 1) / 15),
        "card_share": _clip01(gs.get("card_share", 0) / 10),
        "ip_crowding": _clip01(gs.get("ip_crowding", 0) / 8),
        "rto_rate": _clip01(c.rto_rate_history),
        "night_hour": 1.0 if ev.context.hour_of_day in {23, 0, 1, 2, 3, 4} else 0.0,
        "disposable_email": 1.0 if email_domain in _DISPOSABLE_DOMAINS else 0.0,
        "mule_confidence": _clip01(gs.get("mule_ring_score", 0) / 100),
    }


def heuristic_proba(feats: dict[str, float]) -> float:
    z = _BIAS + sum(WEIGHTS[f] * feats[f] for f in FEATURES)
    return 1.0 / (1.0 + math.exp(-z))


def policy_floor(feats: dict[str, float], gs: dict[str, Any]) -> int:
    """Deterministic guardrails — hard floors no probabilistic model can waive."""
    floor = 0
    fan_raw = int(gs.get("device_fan_out", 1))
    if fan_raw >= 5:
        floor = max(floor, 88)                      # classic mule fan-out
    elif fan_raw >= 3 and int(gs.get("component_size", 1)) >= 8:
        floor = max(floor, 76)
    if feats["is_cod"] and feats["address_mismatch"] and feats["rto_rate"] >= 0.45:
        floor = max(floor, 80)                      # RTO/COD abuse pattern
    if (feats["disposable_email"] and feats["address_mismatch"]
            and feats["account_newness"] >= 0.9 and feats["device_spread"] >= 0.6):
        floor = max(floor, 84)                      # synthetic identity pattern
    return floor


class RiskModel:
    """XGBoost when available; deterministic calibrated-linear otherwise."""

    def __init__(self) -> None:
        self.kind = "calibrated-linear"
        self._booster = None
        self._load_or_train()

    def _load_or_train(self) -> None:
        try:
            import xgboost as xgb
        except ImportError:
            logger.warning("DEGRADED_MODE: xgboost not installed. Using calibrated-linear fallback (capped score <= 70).")
            return
        try:
            if MODEL_PATH.exists():
                booster = xgb.Booster()
                booster.load_model(str(MODEL_PATH))
                if booster.num_features() == len(FEATURES):
                    booster.set_param({"nthread": 1})
                    self._booster = booster
                    self.kind = "xgboost"
                    return
            self._booster = self._train(xgb)
            self.kind = "xgboost"
        except Exception as exc:      # corrupted artifact / runtime issue -> fallback
            logger.warning("DEGRADED_MODE: Failed to load/train XGBoost (%s). Using calibrated-linear fallback.", exc)
            self._booster = None
            self.kind = "calibrated-linear"

    @property
    def is_degraded(self) -> bool:
        return self._booster is None

    @staticmethod
    def _train(xgb) -> Any:
        """Train on (X, y) pairs from the DECOUPLED ground-truth process."""

        from data.ground_truth import sample_dataset

        X, y, _p_true = sample_dataset(n=24_000, seed=42)

        dtrain = xgb.DMatrix(X, label=y, feature_names=FEATURES)
        # Domain prior: risk is monotonically non-decreasing in EVERY feature.
        mono = "(" + ",".join("1" for _ in FEATURES) + ")"
        params = {
            "objective": "binary:logistic", "max_depth": 4, "eta": 0.2,
            "subsample": 0.95, "colsample_bytree": 0.9, "seed": 42,
            "eval_metric": "aucpr", "nthread": -1,
            "monotone_constraints": mono,
        }
        booster = xgb.train(params, dtrain, num_boost_round=500)
        booster.set_param({"nthread": 1})
        MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
        booster.save_model(str(MODEL_PATH))
        return booster

    def probability(self, feats: dict[str, float]) -> float:
        if self._booster is not None:
            import numpy as np
            import xgboost as xgb

            row = np.array([[feats[f] for f in FEATURES]])
            return float(self._booster.predict(xgb.DMatrix(row, feature_names=FEATURES))[0])
        return heuristic_proba(feats)

    def version(self) -> str:
        return f"{MODEL_VERSION}-{self.kind}"

    def importance_map(self) -> dict[str, float]:
        if self._booster is not None:
            scores = self._booster.get_score(importance_type="gain")
            total = sum(scores.values()) or 1.0
            return {f: scores.get(f, 0.0) / total for f in FEATURES}
        total = sum(WEIGHTS.values()) or 1.0
        return {f: WEIGHTS[f] / total for f in FEATURES}

    def artifact_sha256(self) -> str:
        """SHA-256 of the on-disk model artifact ('' if absent)."""
        if not MODEL_PATH.exists():
            return ""
        return hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest()


_model: RiskModel | None = None


def get_risk_model() -> RiskModel:
    global _model
    if _model is None:
        _model = RiskModel()
    return _model
