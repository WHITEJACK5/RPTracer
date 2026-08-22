"""SYNTHETIC BENCHMARK — sanity check, not a real-world performance claim.

    python data/generate_synthetic.py [--n-test 6000] [--seed 1337]

Evaluates the trained GBDT against an INDEPENDENT ground-truth process
(data/ground_truth.py) whose internals the model never saw: nonlinear
interaction terms, a merchant-category confounder that shifts amounts and
fraud rates together, and ~6.5% flipped labels simulating annotation noise.

Reports precision / recall / FALSE POSITIVES PER 1,000 LEGITIMATE
TRANSACTIONS at each operating threshold — the number Razorpay's brief
actually cares about.

For real-data validation see scripts/train_real_data.py (IEEE-CIS).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.models.risk_model import FEATURES, get_risk_model          # noqa: E402
from data.ground_truth import dataset_fingerprint, sample_dataset       # noqa: E402
from data.schema import FEATURE_NAMES                                   # noqa: E402


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
    ap = argparse.ArgumentParser()
    ap.add_argument("--n-test", type=int, default=6000)
    ap.add_argument("--seed", type=int, default=1337)
    args = ap.parse_args()

    if FEATURE_NAMES != FEATURES:
        raise SystemExit("schema drift: data/schema.py vs backend feature list")

    Xte, yte, p_true = sample_dataset(args.n_test, args.seed)
    model = get_risk_model()
    print(f"model backend : {model.kind} ({model.version()})")
    print(f"holdout       : {dataset_fingerprint(args.seed, args.n_test)}")
    print(f"prevalence    : {yte.mean():.2%} ({int(yte.sum())} positives of {len(yte):,})")
    if model.kind != "xgboost":
        print("WARNING: xgboost unavailable - linear fallback scored this run.")

    probs = np.array([model.probability(dict(zip(FEATURES, map(float, row)))) for row in Xte])
    auprc = average_precision(yte, probs)
    ceiling = average_precision(yte, p_true)     # oracle ranking on pre-flip prob

    n_legit = int((yte == 0).sum())
    avg_ticket = 18_500.0                        # INR, demo merchant assumption
    print("\n=== held-out metrics (synthetic GT, seed", f"{args.seed}) ===")
    print(f"AUPRC                 : {auprc:.3f}   (baseline prevalence {yte.mean():.3f})")
    print(f"Bayes ceiling AUPRC   : {ceiling:.3f}   (label noise bound)")
    print(f"efficiency vs ceiling : {auprc / ceiling:.0%}")

    def row(label: str, mask: np.ndarray) -> None:
        tp = float((mask & (yte == 1)).sum())
        fp = float((mask & (yte == 0)).sum())
        prec = tp / max(tp + fp, 1)
        rec = tp / max(float(yte.sum()), 1)
        fp_per_1k = fp / n_legit * 1000
        print(f"  {label:<22}: P={prec:.3f} R={rec:.3f} flagged={int(mask.sum()):>4} "
              f"FP/1k-legit={fp_per_1k:.1f}")
        print(f"      -> holds ~{fp_per_1k:.1f} legitimate payouts per 1,000 "
              f"(~Rs.{fp_per_1k * avg_ticket:,.0f} review friction per 1k txns) "
              f"to catch {rec:.0%} of fraud attempts")

    print("\noperating points - fixed probability cutoffs")
    for thr in (0.50, 0.70, 0.90):
        row(f"p>={thr:.2f}", probs >= thr)
    print("  (calibrated posteriors are capped by 6.5% annotation noise plus")
    print("   unexplained heterogeneity; sparse coverage at high cutoffs is")
    print("   expected and reported as-is)")

    print("\noperating points - flag-rate policy (risk-ops style)")
    order = np.argsort(-probs)
    for frac in (0.01, 0.02, 0.05):
        k = max(int(round(frac * len(yte))), 1)
        mask = np.zeros(len(yte), dtype=bool)
        mask[order[:k]] = True
        row(f"flag riskiest {frac:.0%}", mask)

    print("\nnote: synthetic sanity check on generated data with independent")
    print("labels - NOT a claim of real-world production performance.")
    print("for real-data validation see scripts/train_real_data.py (IEEE-CIS).")


if __name__ == "__main__":
    main()
