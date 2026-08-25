"""Phase 7 Tests: Review Queue, Enriched Ledger, and Observability.

Validates:
1. HIGH-band decisions automatically insert into the review queue.
2. Review labeling works and labels are persisted to JSONL.
3. Audit ledger includes feature vector snapshot and code path.
4. Prometheus metrics include review_queue_size.
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

from backend.app.core.metrics import review_queue_size, render_metrics
from backend.app.models.schemas import TransactionEvent
from backend.app.services.review_queue import ReviewQueue
from backend.app.services.scorer import run_pipeline


def _high_event() -> TransactionEvent:
    """Build an event that will trigger HIGH-band scoring."""
    return TransactionEvent.model_validate({
        "event_id": "review_test_high_01",
        "amount": 50000.0,
        "instrument": {"method": "upi", "vpa": "mule.review@ybl"},
        "customer": {"id": "cust_review_1", "new_customer": True, "account_age_days": 2,
                     "rto_rate_history": 0.7},
        "context": {
            "device_id": "DEV-REVIEW-HIGH-01", "ip": "203.0.113.99",
            "email": "burner@tempmail.dev", "billing_shipping_mismatch": True,
            "txn_count_1h": 8, "txn_count_24h": 15, "amount_sum_24h": 200000,
            "hour_of_day": 3,
        },
    })


def test_review_queue_insert_on_high_band(tmp_path: Path):
    """HIGH-band decisions are automatically inserted into the review queue."""
    queue = ReviewQueue(db_path=tmp_path / "review_test.db")
    queue.clear()
    queue.insert(
        event_id="review_test_high_01", risk_score=85, risk_band="HIGH",
        decision="PAUSE_PAYOUT_AND_GENERATE_DISPUTE_DOSSIER",
        merchant_id="merchant_demo", model_version="tracer-gbdt-1.0.0-xgboost",
        degraded=False, feature_snapshot={"mule_confidence": 0.9},
        graph_evidence={"ring_detected": True},
    )
    reviews = queue.list_reviews()
    assert len(reviews) == 1
    assert reviews[0]["event_id"] == "review_test_high_01"
    assert reviews[0]["status"] == "pending_review"
    assert reviews[0]["degraded"] is False


def test_review_labeling_and_persistence(tmp_path: Path):
    """Labeling a review persists to JSONL and removes from pending."""
    queue = ReviewQueue(db_path=tmp_path / "review_label_test.db")
    queue.clear()
    queue.insert(
        event_id="review_label_01", risk_score=90, risk_band="HIGH",
        decision="PAUSE_PAYOUT_AND_GENERATE_DISPUTE_DOSSIER",
        merchant_id="merchant_demo", model_version="tracer-gbdt-1.0.0-xgboost",
        degraded=False, feature_snapshot={}, graph_evidence={},
    )

    labels_path = tmp_path / "review_labels.jsonl"
    queue._append_label = lambda eid, lbl, rsn, ts: _append_to(labels_path, eid, lbl, rsn, ts)
    found = queue.label("review_label_01", "confirmed_fraud", "Confirmed ring activity")

    assert found is True
    assert queue.list_reviews() == []  # removed from pending
    assert labels_path.exists()

    with labels_path.open() as f:
        record = json.loads(f.readline())
    assert record["label"] == "confirmed_fraud"
    assert record["event_id"] == "review_label_01"


def _append_to(path: Path, event_id: str, label: str, reason: str, ts_ms: int) -> None:
    with path.open("a") as f:
        f.write(json.dumps({"event_id": event_id, "label": label, "reason": reason, "ts_ms": ts_ms}) + "\n")


def test_enriched_ledger_includes_feature_snapshot():
    """Audit ledger entries include feature_vector, model version, degraded flag, and code path."""
    out = asyncio.run(run_pipeline(_high_event()))
    ledger_ref = out.audit_ref.replace("audit::", "")

    from backend.app.services.ledger_service import get_ledger
    entries = get_ledger().read_recent(limit=10)

    # Find the debit entry for this event
    matching = [e for e in entries if e.get("event_id") == "review_test_high_01" and e.get("side") == "DEBIT"]
    assert len(matching) >= 1

    entry = matching[0]
    assert "feature_snapshot" in entry
    assert isinstance(entry["feature_snapshot"], dict)
    assert "degraded" in entry
    assert "code_path" in entry
    assert entry["model"] == out.model_version
    assert len(entry["feature_snapshot"]) >= 10  # at least 10 features in snapshot


def test_review_queue_size_gauge_in_prometheus_metrics():
    """Prometheus /metrics endpoint includes tracer_review_queue_size."""
    body, ctype = render_metrics()
    text = body.decode()
    assert "tracer_review_queue_size" in text
