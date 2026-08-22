"""Independent ground-truth label generator for TRACER's benchmark.

ZERO shared code with the scoring model (backend/models/risk_model.py):
this file imports only numpy and the neutral name list in data/schema.py.
It exists so that reported metrics measure generalization to a label
process whose internals the model never sees — sampled (X, y) pairs only,
exactly as with production data.

Label process design
--------------------
* NON-LINEAR interactions fire independently of any linear score, e.g. a
  fraud burst term for  is_cod AND address_mismatch AND rto_rate > 0.4,
  and a saturating tanh fan-out effect.
* CONFOUNDER: `merchant_category` shifts BOTH the amount distribution and
  the fraud rate together — a model that leans on amount alone is punished.
* ANNOTATION NOISE: ~6.5% of labels are randomly flipped, simulating real
  chargeback mislabeling / late RTO reversals.
"""
from __future__ import annotations

import numpy as np

from data.schema import FEATURE_NAMES

FLIP_RATE = 0.065          # annotation noise: fraction of labels flipped
HETEROGENEITY_SIGMA = 0.25 # unexplained-fraud-heterogeneity (logit sd)
CATEGORIES = ("grocery", "electronics", "travel", "digital_goods", "luxury")

# confounder: (amount mean shift, fraud logit shift) per category
_CATEGORY_EFFECT = {
    "grocery":       (-0.10, -0.55),
    "electronics":   (+0.12, +0.45),
    "travel":        (+0.22, +0.20),
    "digital_goods": (-0.05, +0.30),
    "luxury":        (+0.30, +0.60),
}


def _sigmoid(z: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-z))


def sample_dataset(n: int, seed: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Sample n rows -> (X[n,19] in FEATURE_NAMES order, y[n], p_true[n]).

    p_true is the pre-flip fraud probability — used ONLY by benchmark scripts
    to report the Bayes ceiling of this label process, never by the model.
    """
    rng = np.random.default_rng(seed)
    col = {name: i for i, name in enumerate(FEATURE_NAMES)}
    X = np.zeros((n, len(FEATURE_NAMES)))

    # ---- confounder -------------------------------------------------------
    cat_idx = rng.integers(0, len(CATEGORIES), n)
    amt_shift = np.array([_CATEGORY_EFFECT[c][0] for c in CATEGORIES])[cat_idx]
    fraud_shift = np.array([_CATEGORY_EFFECT[c][1] for c in CATEGORIES])[cat_idx]

    # ---- marginal draws (own priors) --------------------------------------
    amount_log = np.clip(rng.beta(2.2, 3.4, n) * 0.9 + 0.18 + amt_shift * 0.5, 0, 1)
    cod = (rng.random(n) < 0.24).astype(float)
    mismatch = (rng.random(n) < 0.08).astype(float)
    newness = np.clip(rng.exponential(0.38, n), 0, 1)
    rto = np.clip(rng.beta(1.05, 8.5, n), 0, 1)
    fan_raw = np.clip(rng.pareto(2.3, n) * 0.11, 0, 1)

    X[:, col["amount_log"]] = amount_log
    X[:, col["amount_gt_50k"]] = (amount_log > 0.78).astype(float)
    X[:, col["is_cod"]] = cod
    X[:, col["address_mismatch"]] = mismatch
    X[:, col["account_newness"]] = newness
    X[:, col["new_customer"]] = (rng.random(n) < 0.13).astype(float)
    X[:, col["txn_rate_1h"]] = np.clip(rng.pareto(3.2, n) * 0.09, 0, 1)
    X[:, col["txn_rate_24h"]] = np.clip(rng.pareto(2.7, n) * 0.08, 0, 1)
    X[:, col["amount_velocity"]] = np.clip(rng.pareto(3.0, n) * 0.07, 0, 1)
    X[:, col["avg_ticket_ratio"]] = np.clip(rng.gamma(1.15, 0.14, n), 0, 1)
    X[:, col["device_spread"]] = np.clip(rng.pareto(3.6, n) * 0.09, 0, 1)
    X[:, col["device_fan_out"]] = fan_raw
    X[:, col["vpa_degree"]] = np.clip(fan_raw * rng.uniform(0.4, 0.9, n), 0, 1)
    X[:, col["card_share"]] = np.clip(rng.pareto(3.1, n) * 0.07, 0, 1)
    X[:, col["ip_crowding"]] = np.clip(rng.pareto(3.4, n) * 0.08, 0, 1)
    X[:, col["rto_rate"]] = rto
    night = (rng.random(n) < 0.15).astype(float)
    X[:, col["night_hour"]] = night
    X[:, col["disposable_email"]] = (rng.random(n) < 0.025).astype(float)
    ringish = (fan_raw > 0.33).astype(float)
    X[:, col["mule_confidence"]] = np.clip(ringish * rng.uniform(0.7, 1.0, n), 0, 1)

    # ---- ground-truth logit: nonlinear terms + interactions ---------------
    logit = (
        -5.20
        + 0.85 * cod
        + 0.80 * mismatch
        + 0.70 * newness
        + 0.55 * night
        + 0.90 * X[:, col["disposable_email"]]
        + 1.60 * np.tanh(4.0 * fan_raw)                 # saturating fan-out
        + 0.70 * X[:, col["rto_rate"]]
        + fraud_shift                                    # confounder acts here
    )
    burst = cod * mismatch * (rto > 0.40)                # RTO/COD abuse pattern
    identity = ((newness > 0.75) & (X[:, col["disposable_email"]] == 1)
                & (mismatch == 1))                       # synthetic-identity pattern
    velocity = (X[:, col["txn_rate_1h"]] > 0.45) & (newness > 0.6)
    logit += 2.30 * burst + 2.00 * identity + 1.20 * velocity
    logit += rng.normal(0.0, HETEROGENEITY_SIGMA, n)     # unexplained heterogeneity

    p_true = _sigmoid(logit)
    y = (rng.random(n) < p_true).astype(np.int64)

    flipped = rng.random(n) < FLIP_RATE                  # annotation noise
    y[flipped] ^= 1
    return X, y, p_true


def dataset_fingerprint(seed: int, n: int) -> dict:
    """Metadata embedded in reports so numbers stay traceable."""
    return {"generator": "data.ground_truth", "seed": seed, "rows": int(n),
            "flip_rate": FLIP_RATE, "categories": list(CATEGORIES)}
