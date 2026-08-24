"""Per-entity trajectory tracking & predictive early warning (Phase 3).

Maintains a short rolling window of fan-out and transaction velocity buckets per
entity (device/VPA/IP). Uses an exponentially weighted moving slope (EWMA slope)
estimator to forecast threshold breach before hard detection occurs.
"""
from __future__ import annotations

import time
from collections import deque
from typing import Any

_RING_THRESHOLD_FANOUT = 4.0
_ALPHA = 0.35  # EWMA smoothing factor


class EntityTrajectory:
    def __init__(self, entity_id: str) -> None:
        self.entity_id = entity_id
        self.history: deque[tuple[int, float]] = deque(maxlen=10)  # (ts_ms, fan_out)
        self.ewma_slope: float = 0.0
        self.last_ts_ms: int = 0

    def observe(self, ts_ms: int, current_fan_out: float) -> None:
        if self.last_ts_ms > 0 and ts_ms > self.last_ts_ms:
            dt = max((ts_ms - self.last_ts_ms) / 1000.0, 0.1)  # seconds
            raw_slope = (current_fan_out - (self.history[-1][1] if self.history else 0)) / dt
            self.ewma_slope = _ALPHA * raw_slope + (1 - _ALPHA) * self.ewma_slope
        self.history.append((ts_ms, current_fan_out))
        self.last_ts_ms = ts_ms

    def predict_breach(self, current_fan_out: float, forecast_seconds: float = 30.0) -> tuple[bool, float]:
        """Predict if fan-out trajectory implies threshold breach within forecast window.

        Returns (early_warning_flag, estimated_seconds_to_breach).
        """
        if current_fan_out >= _RING_THRESHOLD_FANOUT:
            return False, 0.0  # Already breached — hard detection active

        if self.ewma_slope <= 0.01:
            return False, 999.0  # Flat or decreasing trajectory

        needed = _RING_THRESHOLD_FANOUT - current_fan_out
        eta_seconds = needed / self.ewma_slope
        early_warning = 0 < eta_seconds <= forecast_seconds
        return early_warning, round(eta_seconds, 1)


class TrajectoryTracker:
    def __init__(self) -> None:
        self._trajectories: dict[str, EntityTrajectory] = {}

    def observe_and_forecast(self, entity_id: str, fan_out: float, ts_ms: int | None = None) -> dict[str, Any]:
        ts = ts_ms or int(time.time() * 1000)
        if entity_id not in self._trajectories:
            self._trajectories[entity_id] = EntityTrajectory(entity_id)

        traj = self._trajectories[entity_id]
        traj.observe(ts, fan_out)
        warning, eta = traj.predict_breach(fan_out)

        return {
            "entity_id": entity_id,
            "current_fan_out": fan_out,
            "ewma_slope": round(traj.ewma_slope, 4),
            "early_warning": warning,
            "eta_seconds": eta,
        }

    def clear(self) -> None:
        self._trajectories.clear()


_tracker: TrajectoryTracker | None = None


def get_trajectory_tracker() -> TrajectoryTracker:
    global _tracker
    if _tracker is None:
        _tracker = TrajectoryTracker()
    return _tracker
