"""Phase 1 & 2 Tests: Event log replay determinism and server-computed feature spoof resistance.

Proves:
1. Replaying the event log from empty state reproduces identical derived entity state.
2. Malicious payload claiming txn_rate_1h: 0 cannot suppress velocity score when server observed rate is high.
"""
from __future__ import annotations

import time
from pathlib import Path

from backend.app.models.schemas import TransactionEvent
from backend.app.services.event_log import EventLogManager
from backend.app.services.graph_detector import MuleDetector
from backend.app.services.stream_worker import EntityStateStore, StreamWorker


def test_event_log_replay_determinism(tmp_path: Path):
    """Replaying events in arrival order from empty state yields identical derived graph & velocity state."""
    log_db = tmp_path / "event_log_test.db"
    state_db = tmp_path / "entity_state_test.db"

    log_mgr = EventLogManager(db_path=log_db)
    state_store = EntityStateStore(db_path=state_db)
    detector1 = MuleDetector()

    # Create 50 events across 3 devices
    events = []
    for i in range(50):
        dev_id = f"DEV-REPLAY-{i % 3}"
        ev = TransactionEvent.model_validate({
            "event_id": f"pay_replay_{i:03d}",
            "amount": 1000.0 + i * 10,
            "instrument": {"method": "upi", "vpa": f"vpa_{i % 7}@ybl"},
            "context": {"device_id": dev_id, "ip": f"10.0.0.{i % 4}"},
        })
        events.append(ev)
        log_mgr.append(ev)

    # Process events in worker 1
    worker1 = StreamWorker()
    worker1.log = log_mgr
    worker1.store = state_store
    worker1.detector = detector1
    worker1.process_batch(100)

    nodes1 = detector1.g.number_of_nodes()
    edges1 = detector1.g.number_of_edges()
    vel1 = state_store.get_server_velocity("device:DEV-REPLAY-0", int(time.time() * 1000))

    # Reset worker state and replay from event log
    detector2 = MuleDetector()
    state_store.clear()

    # Replay all logged events
    replayed = log_mgr.replay_all()
    assert len(replayed) == 50

    for _seq, arrival_ts_ms, ev in replayed:
        detector2.observe(ev)
        state_store.record_rolling_event(f"device:{ev.context.device_id}", arrival_ts_ms, ev.amount, ev.event_id)

    nodes2 = detector2.g.number_of_nodes()
    edges2 = detector2.g.number_of_edges()
    vel2 = state_store.get_server_velocity("device:DEV-REPLAY-0", int(time.time() * 1000))

    # Assert 100% determinism: identical node count, edge count, and velocity metrics
    assert nodes1 == nodes2
    assert edges1 == edges2
    assert vel1["txn_count_24h"] == vel2["txn_count_24h"]


def test_malicious_payload_velocity_spoof_resistance(tmp_path: Path):
    """Payload claiming txn_count_1h: 0 cannot suppress velocity when server observed count is high."""
    log_mgr = EventLogManager(db_path=tmp_path / "spoof_log.db")
    state_store = EntityStateStore(db_path=tmp_path / "spoof_state.db")

    dev_id = "DEV-SPOOF-01"
    ent_id = f"device:{dev_id}"
    now_ms = int(time.time() * 1000)

    # Ingest 15 events into server store
    for i in range(15):
        ev = TransactionEvent.model_validate({
            "event_id": f"pay_spoof_{i}",
            "amount": 5000.0,
            "context": {"device_id": dev_id, "txn_count_1h": 1},
        })
        log_mgr.append(ev)
        state_store.record_rolling_event(ent_id, now_ms, ev.amount, ev.event_id)

    server_vel = state_store.get_server_velocity(ent_id, now_ms)
    assert server_vel["txn_count_1h"] == 15

    # Malicious payload claiming txn_count_1h: 0
    malicious_event = TransactionEvent.model_validate({
        "event_id": "pay_spoof_malicious",
        "amount": 5000.0,
        "context": {"device_id": dev_id, "txn_count_1h": 0, "txn_count_24h": 0, "amount_sum_24h": 0},
    })

    from backend.app.models.risk_model import featurize
    feats = featurize(malicious_event, {}, server_velocity=server_vel)

    # Server observed velocity overrides payload spoof (txn_rate_1h >= 1.0)
    assert feats["txn_rate_1h"] == 1.0
