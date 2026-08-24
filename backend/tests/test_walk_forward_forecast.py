"""Phase 3 Tests: Walk-forward forecast evaluation for trajectory tracking.

Measures:
1. Lead time (seconds before hard threshold breach that early warning fires).
2. False alarm rate on benign household fan-out sequences.
"""
from __future__ import annotations

import time

from backend.app.services.trajectory_tracker import TrajectoryTracker


def test_walk_forward_forecast_lead_time():
    """Walk-forward evaluation of escalating fan-out sequence.

    Asserts early warning fires at least 5 seconds BEFORE hard threshold breach (fan_out >= 4).
    """
    tracker = TrajectoryTracker()
    device_id = "device:DEV-WALKFORWARD-01"

    # Simulate fan-out trajectory growing from 1 -> 2 -> 3 over 15 seconds
    t0 = int(time.time() * 1000)
    timestamps = [t0 + i * 5000 for i in range(4)]  # 0s, 5s, 10s, 15s

    history = []
    for idx, ts in enumerate(timestamps):
        fan_out = float(idx + 1)
        res = tracker.observe_and_forecast(device_id, fan_out, ts_ms=ts)
        history.append((idx + 1, res["early_warning"], res["eta_seconds"]))

    # At fan_out = 3 (ts = 10s), slope is positive and ETA is < 30s -> early warning MUST be True
    warn_at_3 = history[2][1]
    eta_at_3 = history[2][2]

    assert warn_at_3 is True
    assert 0 < eta_at_3 <= 30.0  # Lead time: ~5 to 15 seconds before breach at fan_out=4


def test_walk_forward_false_alarm_rate_on_benign_fanout():
    """Benign household fan-out (1 device -> 2 VPAs over 1 hour) must have 0% false alarm rate."""
    tracker = TrajectoryTracker()
    device_id = "device:DEV-BENIGN-HOUSEHOLD"

    t0 = int(time.time() * 1000)
    # Slow benign addition: 1 VPA at 0s, 2 VPAs at 1800s (30m later)
    res1 = tracker.observe_and_forecast(device_id, 1.0, ts_ms=t0)
    res2 = tracker.observe_and_forecast(device_id, 2.0, ts_ms=t0 + 1_800_000)
    res3 = tracker.observe_and_forecast(device_id, 2.0, ts_ms=t0 + 3_600_000)

    assert res1["early_warning"] is False
    assert res2["early_warning"] is False
    assert res3["early_warning"] is False
