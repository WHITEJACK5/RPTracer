"""Real-data validation on IEEE-CIS Fraud Detection (Kaggle).

    # 1) download (requires free Kaggle account + API token):
    #    kaggle competitions download -c ieee-fraud-detection \
    #        -f train_transaction.csv --path data/ieee_cis
    # 2) unzip, then:
    python scripts/train_real_data.py

Trains a fresh XGBoost on an honest column mapping and reports held-out
metrics labeled REAL-DATA HOLDOUT. Exits with instructions when the dataset
is absent - it never fabricates numbers.
"""
from __future__ import annotations

import hashlib
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.models.risk_model import FEATURES          # noqa: E402
from data.schema import FEATURE_NAMES                   # noqa: E402

CSV_CANDIDATES = [
    Path("data/ieee_cis/train_transaction.csv"),
    Path("data/ieee_cis/train_transaction.csv.zip"),
]


def _clip(a: np.ndarray) -> np.ndarray:
    return np.clip(np.nan_to_num(a, nan=0.0), 0.0, 1.0)


def load_ieee_cis() -> tuple[np.ndarray, np.ndarray]:
    import pandas as pd

    path = next((p for p in CSV_CANDIDATES if p.exists()), None)
    if path is None:
        print(__doc__)
        raise SystemExit(
            "IEEE-CIS dataset not found.\n"
            "Download train_transaction.csv from "
            "https://www.kaggle.com/c/ieee-fraud-detection into data/ieee_cis/"
        )
    df = pd.read_csv(path, nrows=200_000)   # bounded for laptop-class runs
    y = (df["isFraud"] > 0).astype(int).to_numpy()

    amt = df["TransactionAmt"].clip(lower=10).to_numpy()
    c1 = df["C1"].fillna(0).to_numpy()
    d1 = df["D1"].fillna(365).to_numpy()
    c13 = df["C13"].fillna(0).to_numpy()
    card_fp = df["card1"].astype(str).fillna("NA")

    X = np.zeros((len(df), len(FEATURES)))
    col = {n: i for i, n in enumerate(FEATURE_NAMES)}
    X[:, col["amount_log"]] = _clip(np.log10(amt) / 6)
    X[:, col["amount_gt_50k"]] = (amt > 50_000 / 100 * 3).astype(float)  # USD approx
    X[:, col["is_cod"]] = 0.0                                            # not observable
    X[:, col["address_mismatch"]] = (df.get("M2", pd.Series(0)).astype(str) == "F").astype(float)
    X[:, col["account_newness"]] = _clip(30.0 / np.maximum(d1 + 1.0, 1.0))
    X[:, col["new_customer"]] = (d1 < 30).astype(float)
    X[:, col["txn_rate_1h"]] = _clip(c1 / 25.0)
    X[:, col["txn_rate_24h"]] = _clip(c1 / 15.0)
    X[:, col["amount_velocity"]] = _clip(c13 / 60.0)
    X[:, col["avg_ticket_ratio"]] = _clip((amt / max(float(np.nanmedian(amt)), 1)) / 8)
    share = card_fp.map(card_fp.value_counts()).to_numpy()
    X[:, col["device_fan_out"]] = _clip(share / 50.0)                    # card reuse proxy
    X[:, col["vpa_degree"]] = _clip(share / 80.0)
    X[:, col["card_share"]] = _clip(df["card2"].map(
        df["card2"].value_counts()).fillna(0).to_numpy() / 5000.0)
    X[:, col["ip_crowding"]] = _clip(df.get("dist1", pd.Series(0))
                                     .gt(0).astype(float) * 0.5)
    X[:, col["rto_rate"]] = 0.08                                         # population prior
    X[:, col["night_hour"]] = (((df["TransactionDT"] // 3600) % 24) < 5).astype(float)
    X[:, col["disposable_email"]] = 0.0                                  # not in txn table
    X[:, col["mule_confidence"]] = _clip(share / 120.0)
    return X, y


def main() -> None:
    if FEATURE_NAMES != FEATURES:
        raise SystemExit("schema drift detected")
    try:
        import xgboost as xgb  # noqa: F401
    except ImportError:
        raise SystemExit("pip install xgboost first")

    X, y = load_ieee_cis()
    split = int(len(X) * 0.8)
    dtr = xgb.DMatrix(X[:split], label=y[:split], feature_names=FEATURES)
    dte = xgb.DMatrix(X[split:], label=y[split:], feature_names=FEATURES)
    mono = "(" + ",".join("1" for _ in FEATURES) + ")"
    model = xgb.train(
        {"objective": "binary:logistic", "max_depth": 6, "eta": 0.15,
         "subsample": 0.9, "colsample_bytree": 0.8, "seed": 7,
         "eval_metric": "aucpr", "nthread": -1, "monotone_constraints": mono},
        dtr, num_boost_round=400,
    )
    probs = model.predict(dte)
    yte = y[split:]

    order = np.argsort(-probs)
    ys = yte[order]
    tp = np.cumsum(ys).astype(float)
    fp = np.cumsum(1 - ys).astype(float)
    prec = tp / np.maximum(tp + fp, 1)
    rec = tp / max(float(yte.sum()), 1)
    auprc = float(np.sum((rec - np.concatenate([[0], rec[:-1]])) * prec))

    print("=== REAL-DATA HOLDOUT (IEEE-CIS, mapped columns) ===")
    print(f"rows={len(yte):,} prevalence={yte.mean():.4%} AUPRC={auprc:.3f}")
    for frac in (0.01, 0.02):
        k = max(int(round(frac * len(yte))), 1)
        p_at_k = prec[k - 1]
        r_at_k = rec[k - 1]
        fp_1k = fp[k - 1] / max(int((yte == 0).sum()), 1) * 1000
        print(f"flag riskiest {frac:.0%}: precision={p_at_k:.3f} recall={r_at_k:.3f} "
              f"FP/1k-legit={fp_1k:.1f}")
    print("note: mapped-column subset; unmapped features use documented priors.")
    print(f"dataset fingerprint: sha256:{hashlib.sha256(open(CSV_CANDIDATES[0],'rb').read(1<<20)).hexdigest()[:16]}")


if __name__ == "__main__":
    main()
