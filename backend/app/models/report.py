"""Live model-quality report served at GET /api/v1/model/report.

Computed once per process on a held-out draw from the INDEPENDENT
ground-truth process, then cached. Same math as data/generate_synthetic.py.
"""
from __future__ import annotations

import threading
from typing import Any

import numpy as np
from data.ground_truth import dataset_fingerprint, sample_dataset

from backend.app.models.risk_model import FEATURES, get_risk_model

_LOCK = threading.Lock()
_CACHE: dict[str, Any] | None = None

_AVG_TICKET_INR = 18_500.0     # demo merchant assumption for friction cost


def _ap(y: np.ndarray, s: np.ndarray) -> float:
    order = np.argsort(-s)
    ys = y[order]
    tp = np.cumsum(ys).astype(float)
    fp = np.cumsum(1 - ys).astype(float)
    prec = tp / np.maximum(tp + fp, 1)
    rec = tp / max(float(y.sum()), 1.0)
    prev = np.concatenate([[0.0], rec[:-1]])
    return float(np.sum((rec - prev) * prec))


def _row(y: np.ndarray, mask: np.ndarray) -> dict[str, Any]:
    tp = float((mask & (y == 1)).sum())
    fp = float((mask & (y == 0)).sum())
    n_legit = int((y == 0).sum())
    fp_per_1k = fp / max(n_legit, 1) * 1000
    return {
        "precision": round(tp / max(tp + fp, 1), 3),
        "recall": round(tp / max(float(y.sum()), 1), 3),
        "flagged": int(mask.sum()),
        "fp_per_1000_legit": round(fp_per_1k, 1),
        "est_review_friction_inr_per_1k_txns": round(fp_per_1k * _AVG_TICKET_INR),
    }


def get_report() -> dict[str, Any]:
    global _CACHE
    with _LOCK:
        if _CACHE is not None:
            return _CACHE

        model = get_risk_model()
        X, y, p_true = sample_dataset(n=2_500, seed=777)      # held-out seed
        probs = np.array([model.probability(dict(zip(FEATURES, map(float, r), strict=True)))
                           for r in X])

        fixed = {f"p>={thr:.2f}": _row(y, probs >= thr) for thr in (0.50, 0.70, 0.90)}
        order = np.argsort(-probs)
        flagged_rates: dict[str, Any] = {}
        for frac in (0.01, 0.02, 0.05):
            k = max(int(round(frac * len(y))), 1)
            mask = np.zeros(len(y), dtype=bool)
            mask[order[:k]] = True
            flagged_rates[f"flag_riskiest_{frac:.0%}"] = _row(y, mask)

        auprc = _ap(y, probs)
        ceiling = _ap(y, p_true)
        _CACHE = {
            "label": ("synthetic sanity check - independent label process "
                      "(data/ground_truth.py); NOT real-world performance"),
            "holdout": dataset_fingerprint(777, 4_000),
            "prevalence": round(float(y.mean()), 4),
            "auprc": round(auprc, 3),
            "bayes_ceiling_auprc": round(ceiling, 3),
            "efficiency_vs_ceiling": round(auprc / ceiling, 3),
            "model_kind": model.kind,
            "model_version": model.version(),
            "fixed_threshold_operating_points": fixed,
            "flag_rate_operating_points": flagged_rates,
            "real_data_validation": (
                "run scripts/train_real_data.py with the IEEE-CIS dataset "
                "(Kaggle) - reported separately when available"
            ),
        }
        return _CACHE
