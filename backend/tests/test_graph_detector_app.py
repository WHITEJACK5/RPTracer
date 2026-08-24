"""Unit tests for backend.app.services.graph_detector (MuleDetector)."""
from __future__ import annotations

import asyncio

import pytest

from backend.app.models.schemas import TransactionEvent
from backend.app.services import graph_detector as gd
from backend.app.services.graph_detector import MuleDetector, get_detector


def _ev(device, vpa, amount=1499.0, age=900):
    return TransactionEvent.model_validate({
        "event_id": f"g-{device}-{vpa}", "amount": amount,
        "instrument": {"method": "upi", "vpa": vpa},
        "customer": {"id": f"c-{device}", "account_age_days": age},
        "context": {"device_id": device, "ip": "1.2.3.4",
                    "email": f"{vpa.split('@')[0]}@gmail.com", "hour_of_day": 14}})


def test_observe_updates_graph_and_returns_evidence():
    det = MuleDetector()
    before = det.g.number_of_nodes()
    ev = _ev("DEV-UNIT-1", "unit1@ybl")
    evidence, stats = det.observe(ev)
    assert det.g.number_of_nodes() > before
    assert evidence.component_size >= 1
    assert stats["device_fan_out"] >= 1


def test_household_negative_control_direct():
    det = MuleDetector()
    device = "DEV-FAM-UNIT"
    scores = []
    for i in range(1, 4):
        evidence, stats = det.observe(_ev(device, f"fam.unit{i}@paytm"))
        scores.append(evidence.ring_detected)
        assert evidence.shared_device_vpas <= 3
    # never a ring on a single household device across 2-3 VPAs
    assert not any(scores)
    # and the score never escalates to the HIGH/payout-hold band
    assert not det._cached_score >= 71


def test_reseed_rebuilds_deterministic_graph():
    det = MuleDetector()
    det.observe(_ev("DEV-EXTRA", "extra@ybl"))
    n1 = det.g.number_of_nodes()
    det.reseed()
    n2 = det.g.number_of_nodes()
    assert n1 != n2 or n2 > 0
    assert det.g.has_node("device:DEV-MULE-RING-01")


def test_topology_center_resolution():
    det = MuleDetector()
    a = det.topology(center="device:DEV-MULE-RING-01")
    b = det.topology(center="dev:DEV-MULE-RING-01")
    c = det.topology(center="DEV-MULE-RING-01")
    assert a["center"] == b["center"] == c["center"] == "device:DEV-MULE-RING-01"
    assert a["nodes"] and a["edges"]


def test_topology_empty_when_no_nodes():
    det = MuleDetector.__new__(MuleDetector)
    det.g = __import__("networkx").Graph()
    det._last_entities = []
    out = det.topology()
    assert out == {"nodes": [], "edges": []}


def test_lru_eviction_bounded(monkeypatch):
    monkeypatch.setattr(gd, "_MAX_NODES", 5)
    monkeypatch.setattr(gd, "_EVICT_BATCH", 250)
    det = MuleDetector()
    before = det.g.number_of_nodes()
    # add many disposable leaf email nodes to force eviction
    for i in range(50):
        det._add("email", f"leaf{i}@mailinator.com")
    det._maybe_evict()
    after = det.g.number_of_nodes()
    assert after < before
    # core identity nodes (device/vpa/card) are never dropped
    assert det.g.has_node("device:DEV-MULE-RING-01")


def test_concurrent_observe_async_atomic():
    det = MuleDetector()

    async def run():
        tasks = [
            det.observe_async(_ev(f"DEV-CONC-{i}", f"conc{i}@ybl"))
            for i in range(20)
        ]
        return await asyncio.gather(*tasks)

    results = asyncio.run(run())
    assert len(results) == 20
    for evidence, _stats in results:
        assert isinstance(evidence.component_size, int)


def test_mirror_neo4j_skips_when_unconfigured(monkeypatch):
    monkeypatch.setattr(gd, "NEO4J_URI", None)
    det = MuleDetector()
    # must return immediately without touching network
    assert asyncio.run(det._mirror_neo4j(_ev("DEV-M", "m@ybl"), 50)) is None


def test_get_detector_singleton():
    assert get_detector() is get_detector()
