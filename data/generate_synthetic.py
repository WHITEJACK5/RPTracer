"""Generate the seeded synthetic fraud benchmark + model quality report.

    python data/generate_synthetic.py

Reproduces the latent fraud process used to calibrate TRACER's GBDT, then
reports AUPRC / precision / recall on a held-out split (real numbers, not
marketing claims).
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.models.risk_model import (  # noqa: E402
    FEATURES,
    LATENT_NOISE_SIGMA,
    LOGIT_SCALE,
    TRAIN_INTERCEPT_SHIFT,
    WEIGHTS,
    _BIAS,
    get_risk_model,
)


def synth(n: int, seed: int) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    X = np.column_stack([
        rng.uniform(0.35, 0.95, n), (rng.random(n) < 0.04).astype(float),
        (rng.random(n) < 0.25).astype(float), (rng.random(n) < 0.07).astype(float),
        np.clip(rng.exponential(0.4, n), 0, 1), (rng.random(n) < 0.12).astype(float),
        np.clip(rng.pareto(3.0, n) * 0.08, 0, 1), np.clip(rng.pareto(2.5, n) * 0.07, 0, 1),
        np.clip(rng.pareto(2.8, n) * 0.06, 0, 1), np.clip(rng.gamma(1.2, 0.15, n), 0, 1),
        np.clip(rng.pareto(3.5, n) * 0.09, 0, 1), np.clip(rng.pareto(2.2, n) * 0.10, 0, 1),
        np.clip(rng.pareto(2.6, n) * 0.09, 0, 1), np.clip(rng.pareto(3.0, n) * 0.07, 0, 1),
        np.clip(rng.pareto(3.2, n) * 0.08, 0, 1), np.clip(rng.beta(1.1, 9.0, n), 0, 1),
        (rng.random(n) < 0.14).astype(float), (rng.random(n) < 0.02).astype(float),
        np.clip(rng.pareto(2.4, n) * 0.08, 0, 1),
    ])
    w = np.array([WEIGHTS[f] for f in FEATURES])
    logits = (LOGIT_SCALE * (X @ w + _BIAS + TRAIN_INTERCEPT_SHIFT)
              + rng.normal(0, LATENT_NOISE_SIGMA, n))
    y = (rng.random(n) < 1.0 / (1.0 + np.exp(-logits))).astype(int)
    return X, y


def average_precision(y_true: np.ndarray, scores: np.ndarray) -> float:
    order = np.argsort(-scores)
    y_sorted = y_true[order]
    tp = np.cumsum(y_sorted).astype(float)
    fp = np.cumsum(1 - y_sorted).astype(float)
    precision = tp / np.maximum(tp + fp, 1)
    recall = tp / max(float(y_true.sum()), 1.0)
    prev_recall = np.concatenate([[0.0], recall[:-1]])
    return float(np.sum((recall - prev_recall) * precision))


def main() -> None:
    print("generating benchmark...")
    Xtr, ytr = synth(24_000, seed=42)
    Xte, yte = synth(6_000, seed=1337)

    model = get_risk_model()
    print(f"model backend : {model.kind} ({model.version()})")
    print(f"train fraud   : {ytr.mean():.2%} of {len(ytr):,}")
    print(f"test  fraud   : {yte.mean():.2%} of {len(yte):,}")

    probs = np.array([model.probability(dict(zip(FEATURES, map(float, row)))) for row in Xte])
    auprc = average_precision(yte, probs)

    w = np.array([WEIGHTS[f] for f in FEATURES])
    p_true = 1.0 / (1.0 + np.exp(-(LOGIT_SCALE * (Xte @ w + _BIAS + TRAIN_INTERCEPT_SHIFT))))
    ceiling = average_precision(yte, p_true)
    print("\n=== held-out performance ===")
    print(f"AUPRC                 : {auprc:.3f}   (baseline {yte.mean():.3f})")
    print(f"Bayes ceiling AUPRC   : {ceiling:.3f}   (label noise bound)")
    print(f"efficiency vs ceiling : {auprc / ceiling:.0%}")
    preds = {}
    for thr in (0.50, 0.70, 0.90):
        sel = probs >= thr
        prec = float((sel & (yte == 1)).sum()) / max(int(sel.sum()), 1)
        rec = float((sel & (yte == 1)).sum()) / max(int((yte == 1).sum()), 1)
        preds[thr] = (prec, rec, int(sel.sum()))
    print("operating points      :")
    for thr, (prec, rec, n) in preds.items():
        print(f"  p>={thr:.2f}          : precision={prec:.3f} recall={rec:.3f} flagged={n}")


if __name__ == "__main__":
    main()
