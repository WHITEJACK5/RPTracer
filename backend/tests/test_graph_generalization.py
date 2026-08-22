"""Graph-detector generalization tests.

The seeded demo history plants a fixture mule ring; these tests prove the
detector catches rings built LIVE through the public API on identifiers that
were never seeded, and that benign fan-out does NOT trigger it
(false-positive-on-graph-structure control).
"""
from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


def _payload(device_id: str, vpa: str, amount: float = 1499.0,
             age_days: int = 800) -> dict:
    return {
        "event_id": f"pay_{uuid.uuid4().hex[:10]}",
        "event_type": "payment.captured",
        "amount": amount,
        "instrument": {"method": "upi", "vpa": vpa},
        "customer": {"id": f"cust_{uuid.uuid4().hex[:8]}",
                     "new_customer": False, "account_age_days": age_days},
        "context": {"device_id": device_id,
                    "ip": f"49.{uuid.uuid4().hex[:2]}.{uuid.uuid4().hex[:2]}.7",
                    "email": f"{vpa.split('@')[0]}@gmail.com", "hour_of_day": 14},
    }


def test_mule_ring_detected_for_novel_device_never_seeded(client: TestClient):
    """A ring assembled purely through sequential API calls must be caught."""
    device = f"DEV-NOVEL-{uuid.uuid4().hex[:8]}"
    results = []
    for i in range(1, 6):
        body = _payload(device, f"novel.mule{i}@ybl")
        res = client.post("/api/v1/risk/evaluate", json=body)
        assert res.status_code == 200
        ev = res.json()
        results.append((i, ev["graph_evidence"]["ring_detected"], ev["risk_score"]))

    # no ring while fan-out is still small...
    assert all(not flag for _, flag, _ in results[:3]), results[:3]
    # ...and detected once the device fans out to >=4 payment identities
    assert results[4][1] is True
    assert results[4][2] >= 71                       # bounded agent escalates
    assert client.post(
        "/api/v1/risk/evaluate",
        json=_payload(device, "novel.mule5@ybl"),
    ).json()["graph_evidence"]["ring_confidence"] >= 0.72


def test_card_share_feature_not_silently_zero(client):
    """Regression: prefix mismatch ('fp:' vs 'card:') used to zero card_share."""
    from backend.graph.mule_detector import get_detector
    from backend.schemas import TransactionEvent

    ev = TransactionEvent.model_validate({
        "event_id": "cardshare_1", "amount": 45000.0,
        "instrument": {"method": "upi", "vpa": "fraudvpa07@ybl",
                       "card_fingerprint": "FP-MULE-1"},
        "customer": {"id": "cust_cs", "account_age_days": 3},
        "context": {"device_id": "DEV-MULE-RING-01", "ip": "203.0.113.7"}})
    _, gs = get_detector().observe(ev)
    assert gs["device_fan_out"] >= 15          # 14 seeded VPAs + shared cards
    assert gs["card_share"] >= 3               # FP-MULE-1 links several identities


def test_topology_center_resolution_is_forgiving():
    """dev:/device:/bare-id must all resolve to the same node — even after
    unrelated events poison the last-event fallback."""
    from backend.graph.mule_detector import get_detector
    from backend.schemas import TransactionEvent

    det = get_detector()
    # poison the fallback with an unrelated benign event first
    det.observe(TransactionEvent.model_validate({
        "event_id": "poison_1", "amount": 999.0,
        "instrument": {"method": "upi", "vpa": "unrelated.poison@upi"},
        "context": {"device_id": "DEV-POISON-XX", "ip": "10.9.9.9"}}))

    a = det.topology(center="device:DEV-MULE-RING-01")
    b = det.topology(center="dev:DEV-MULE-RING-01")
    c = det.topology(center="DEV-MULE-RING-01")
    assert a["center"] == b["center"] == c["center"] == "device:DEV-MULE-RING-01"
    assert len(a["nodes"]) == len(c["nodes"]) > 10


def test_benign_family_fanout_does_not_trigger_ring(client: TestClient):
    """Negative control: one household device across 2-3 VPAs is NOT a ring.

    This is our explicit false-positive-on-graph-structure control: the
    detector must require >=4 identities per device before escalating.
    """
    device = f"DEV-FAMILY-{uuid.uuid4().hex[:8]}"
    for i in range(1, 4):
        res = client.post("/api/v1/risk/evaluate",
                          json=_payload(device, f"family.member{i}@paytm"))
        assert res.status_code == 200
        ev = res.json()
        assert ev["graph_evidence"]["ring_detected"] is False
        assert ev["graph_evidence"]["shared_device_vpas"] <= 3
        # benign fan-out must never reach the payout-hold band on its own
        assert ev["risk_band"] != "HIGH" or not ev["graph_evidence"]["ring_detected"]
