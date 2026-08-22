"""GBDT risk scorer — XGBoost trained on seeded synthetic fraud distributions,
with a calibrated linear fallback so the engine never fails to boot.

Pipeline contract:
    featurize(event, graph_stats) -> named vector -> model probability (0..1)
    final_score = round(max(probability*100, policy_floor))
"""
from __future__ import annotations

import math
from typing import Any

from backend.config import MODEL_PATH, MODEL_VERSION
from backend.schemas import TransactionEvent

FEATURES: list[str] = [
    "amount_log", "amount_gt_50k", "is_cod", "address_mismatch",
    "account_newness", "new_customer", "txn_rate_1h", "txn_rate_24h",
    "amount_velocity", "avg_ticket_ratio", "device_spread",
    "device_fan_out", "vpa_degree", "card_share", "ip_crowding",
    "rto_rate", "night_hour", "disposable_email", "mule_confidence",
]

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
    "amount_log": 0.55, "amount_gt_50k": 0.75, "is_cod": 1.20,
    "address_mismatch": 1.15, "account_newness": 0.70, "new_customer": 0.55,
    "txn_rate_1h": 0.95, "txn_rate_24h": 0.85, "amount_velocity": 0.70,
    "avg_ticket_ratio": 0.45, "device_spread": 0.60, "device_fan_out": 2.10,
    "vpa_degree": 1.05, "card_share": 0.90, "ip_crowding": 0.65,
    "rto_rate": 1.35, "night_hour": 0.45, "disposable_email": 1.05,
    "mule_confidence": 2.40,
}
_BIAS = -3.35

# Latent-process calibration used by BOTH the trainer and data/generate_synthetic.py
# so train/test distributions always match production assumptions.
TRAIN_INTERCEPT_SHIFT = -1.30      # pushes base fraud rate low (imbalanced)
LOGIT_SCALE = 1.60                 # sharpens class separation
LATENT_NOISE_SIGMA = 0.15          # small irreducible label stochasticity

_DISPOSABLE_DOMAINS = {
    "mailinator.com", "tempmail.dev", "guerrillamail.com",
    "10minutemail.com", "yopmail.com", "burnermail.io", "trashmail.com",
}


def _clip01(x: float) -> float:
    return max(0.0, min(1.0, float(x)))


def featurize(ev: TransactionEvent, gs: dict[str, Any]) -> dict[str, float]:
    c, i = ev.customer, ev.instrument
    prev_avg = (ev.context.amount_sum_24h / max(ev.context.txn_count_24h, 1)) or ev.amount
    email_domain = (ev.context.email or "").split("@")[-1].lower()
    return {
        "amount_log": _clip01(math.log10(max(ev.amount, 10.0)) / 6.0),
        "amount_gt_50k": 1.0 if ev.amount > 50_000 else 0.0,
        "is_cod": 1.0 if i.is_cod else 0.0,
        "address_mismatch": 1.0 if ev.context.billing_shipping_mismatch else 0.0,
        "account_newness": _clip01(30.0 / max(c.account_age_days, 1)),
        "new_customer": 1.0 if c.new_customer else 0.0,
        "txn_rate_1h": _clip01(ev.context.txn_count_1h / 10),
        "txn_rate_24h": _clip01(ev.context.txn_count_24h / 25),
        "amount_velocity": _clip01(ev.context.amount_sum_24h / 150_000),
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

    # ---- XGBoost path -------------------------------------------------
    def _load_or_train(self) -> None:
        try:
            import xgboost as xgb
        except ImportError:
            return
        try:
            if MODEL_PATH.exists():
                booster = xgb.Booster()
                booster.load_model(str(MODEL_PATH))
                if booster.num_features() == len(FEATURES):
                    self._booster = booster
                    self.kind = "xgboost"
                    return
            self._booster = self._train(xgb)
            self.kind = "xgboost"
        except Exception:      # corrupted artifact / runtime issue -> fallback
            self._booster = None
            self.kind = "calibrated-linear"

    @staticmethod
    def _train(xgb) -> Any:
        import numpy as np

        rng = np.random.default_rng(42)
        n = 20_000
        X = np.column_stack([
            rng.uniform(0.35, 0.95, n),                       # amount_log
            (rng.random(n) < 0.04).astype(float),             # amount_gt_50k
            (rng.random(n) < 0.25).astype(float),             # is_cod
            (rng.random(n) < 0.07).astype(float),             # address_mismatch
            np.clip(rng.exponential(0.4, n), 0, 1),           # account_newness
            (rng.random(n) < 0.12).astype(float),             # new_customer
            np.clip(rng.pareto(3.0, n) * 0.08, 0, 1),         # txn_rate_1h
            np.clip(rng.pareto(2.5, n) * 0.07, 0, 1),         # txn_rate_24h
            np.clip(rng.pareto(2.8, n) * 0.06, 0, 1),         # amount_velocity
            np.clip(rng.gamma(1.2, 0.15, n), 0, 1),           # avg_ticket_ratio
            np.clip(rng.pareto(3.5, n) * 0.09, 0, 1),         # device_spread
            np.clip(rng.pareto(2.2, n) * 0.10, 0, 1),         # device_fan_out
            np.clip(rng.pareto(2.6, n) * 0.09, 0, 1),         # vpa_degree
            np.clip(rng.pareto(3.0, n) * 0.07, 0, 1),         # card_share
            np.clip(rng.pareto(3.2, n) * 0.08, 0, 1),         # ip_crowding
            np.clip(rng.beta(1.1, 9.0, n), 0, 1),             # rto_rate
            (rng.random(n) < 0.14).astype(float),             # night_hour
            (rng.random(n) < 0.02).astype(float),             # disposable_email
            np.clip(rng.pareto(2.4, n) * 0.08, 0, 1),         # mule_confidence
        ])
        w = np.array([WEIGHTS[f] for f in FEATURES])
        logits = (LOGIT_SCALE * (X @ w + _BIAS + TRAIN_INTERCEPT_SHIFT)
                  + rng.normal(0, LATENT_NOISE_SIGMA, n))
        y = (rng.random(n) < 1.0 / (1.0 + np.exp(-logits))).astype(int)

        dtrain = xgb.DMatrix(X, label=y, feature_names=FEATURES)
        # Domain prior: risk is monotonically non-decreasing in EVERY feature
        # (more velocity/fan-out/RTO can never reduce risk). Constraints prevent
        # the trees from memorizing label noise near the decision boundary.
        mono = "(" + ",".join("1" for _ in FEATURES) + ")"
        params = {
            "objective": "binary:logistic", "max_depth": 4, "eta": 0.2,
            "subsample": 0.95, "colsample_bytree": 0.9, "seed": 42,
            "eval_metric": "aucpr", "nthread": -1,
            "monotone_constraints": mono,
        }
        booster = xgb.train(params, dtrain, num_boost_round=500)
        MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
        booster.save_model(str(MODEL_PATH))
        return booster

    # ---- inference -----------------------------------------------------
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


_model: RiskModel | None = None


def get_risk_model() -> RiskModel:
    global _model
    if _model is None:
        _model = RiskModel()
    return _model
