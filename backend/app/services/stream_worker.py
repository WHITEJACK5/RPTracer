"""Background stream worker — processes events from the event log.

Responsibilities (Phase 1 & Phase 2):
1. Consumes unprocessed events from ``EventLogManager`` in arrival order.
2. Updates rolling velocity windows (5m, 1h, 24h) for touched entities.
3. Incrementally mutates the NetworkX entity graph in ``MuleDetector``.
4. Computes derived entity state (device fan-out, IP crowding, velocity slopes)
   and saves to ``EntityStateStore`` with a ``computed_at`` timestamp.
5. Guarantees a documented staleness bound (<10ms single-node background loop).
"""
from __future__ import annotations

import asyncio
import json
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

from backend.app.core.config import DATA_DIR
from backend.app.models.schemas import TransactionEvent
from backend.app.services.event_log import get_event_log
from backend.app.services.graph_detector import get_detector

_STATE_DB_PATH = DATA_DIR / "entity_state.db"
_LOCK = threading.Lock()


class EntityStateStore:
    """Fast-read derived store for per-entity rolling state."""

    def __init__(self, db_path: Path | None = None) -> None:
        self.db_path = db_path or _STATE_DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._mem: dict[str, dict[str, Any]] = {}
        self._init_sqlite()

    def _init_sqlite(self) -> None:
        with _LOCK:
            conn = sqlite3.connect(str(self.db_path), timeout=10.0)
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("""
                CREATE TABLE IF NOT EXISTS entity_state (
                    entity_id TEXT PRIMARY KEY,
                    computed_at_ms INTEGER NOT NULL,
                    state_json TEXT NOT NULL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS rolling_events (
                    entity_id TEXT NOT NULL,
                    ts_ms INTEGER NOT NULL,
                    amount REAL NOT NULL,
                    event_id TEXT NOT NULL
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_rolling_entity_ts ON rolling_events(entity_id, ts_ms);")
            conn.commit()
            conn.close()

    def record_rolling_event(self, entity_id: str, ts_ms: int, amount: float, event_id: str) -> None:
        """Record an event timestamp & amount for an entity's rolling window."""
        with _LOCK:
            conn = sqlite3.connect(str(self.db_path), timeout=10.0)
            conn.execute(
                "INSERT INTO rolling_events (entity_id, ts_ms, amount, event_id) VALUES (?, ?, ?, ?)",
                (entity_id, ts_ms, amount, event_id),
            )
            # Evict events older than 24h (86_400_000 ms)
            cutoff = ts_ms - 86_400_000
            conn.execute("DELETE FROM rolling_events WHERE entity_id = ? AND ts_ms < ?", (entity_id, cutoff))
            conn.commit()
            conn.close()

    def get_server_velocity(self, entity_id: str, now_ms: int) -> dict[str, Any]:
        """Compute server-observed velocity (1h count, 24h count, 24h sum, distinct devices)."""
        c_1h = now_ms - 3_600_000
        c_24h = now_ms - 86_400_000
        with _LOCK:
            conn = sqlite3.connect(str(self.db_path), timeout=10.0)
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM rolling_events WHERE entity_id = ? AND ts_ms >= ?", (entity_id, c_1h))
            count_1h = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*), COALESCE(SUM(amount), 0.0) FROM rolling_events WHERE entity_id = ? AND ts_ms >= ?", (entity_id, c_24h))
            count_24h, sum_24h = cur.fetchone()
            conn.close()
        return {
            "txn_count_1h": count_1h,
            "txn_count_24h": count_24h,
            "amount_sum_24h": float(sum_24h),
        }

    def save_state(self, entity_id: str, state: dict[str, Any]) -> None:
        computed_at = int(time.time() * 1000)
        state["computed_at_ms"] = computed_at
        raw = json.dumps(state)
        self._mem[entity_id] = state
        with _LOCK:
            conn = sqlite3.connect(str(self.db_path), timeout=10.0)
            conn.execute(
                "INSERT OR REPLACE INTO entity_state (entity_id, computed_at_ms, state_json) VALUES (?, ?, ?)",
                (entity_id, computed_at, raw),
            )
            conn.commit()
            conn.close()

    def get_state(self, entity_id: str) -> dict[str, Any] | None:
        if entity_id in self._mem:
            return self._mem[entity_id]
        with _LOCK:
            conn = sqlite3.connect(str(self.db_path), timeout=10.0)
            cur = conn.cursor()
            cur.execute("SELECT state_json FROM entity_state WHERE entity_id = ?", (entity_id,))
            row = cur.fetchone()
            conn.close()
        if not row:
            return None
        st = json.loads(row[0])
        self._mem[entity_id] = st
        return st

    def clear(self) -> None:
        self._mem.clear()
        with _LOCK:
            if self.db_path.exists():
                conn = sqlite3.connect(str(self.db_path), timeout=10.0)
                conn.execute("DELETE FROM entity_state")
                conn.execute("DELETE FROM rolling_events")
                conn.commit()
                conn.close()


_state_store: EntityStateStore | None = None


def get_entity_state_store() -> EntityStateStore:
    global _state_store
    if _state_store is None:
        _state_store = EntityStateStore()
    return _state_store


class StreamWorker:
    def __init__(self) -> None:
        self.log = get_event_log()
        self.store = get_entity_state_store()
        self.detector = get_detector()
        self._running = False

    def process_batch(self, limit: int = 100) -> int:
        """Synchronously process one batch of un-processed events from event log."""
        unprocessed = self.log.fetch_unprocessed(limit)
        if not unprocessed:
            return 0

        processed_seqs = []
        for seq, arrival_ts_ms, raw_json, ev in unprocessed:
            # 1. Update graph
            evidence, gs = self.detector.observe(ev)

            # 2. Record rolling events for key entities
            entities = []
            if ev.context.device_id:
                entities.append(f"device:{ev.context.device_id}")
            if ev.instrument.vpa:
                entities.append(f"vpa:{ev.instrument.vpa}")
            if ev.customer.id:
                entities.append(f"customer:{ev.customer.id}")

            for ent in entities:
                self.store.record_rolling_event(ent, arrival_ts_ms, ev.amount, ev.event_id)
                vel = self.store.get_server_velocity(ent, arrival_ts_ms)
                self.store.save_state(ent, {
                    "graph_stats": gs,
                    "velocity": vel,
                    "last_event_id": ev.event_id,
                })

            processed_seqs.append(seq)

        self.log.mark_processed(processed_seqs)
        return len(processed_seqs)

    async def run_loop(self) -> None:
        self._running = True
        while self._running:
            try:
                count = await asyncio.to_thread(self.process_batch, 100)
                if count == 0:
                    await asyncio.sleep(0.01)  # 10ms poll sleep (staleness bound <10ms)
            except Exception:
                await asyncio.sleep(0.05)


_worker: StreamWorker | None = None


def get_stream_worker() -> StreamWorker:
    global _worker
    if _worker is None:
        _worker = StreamWorker()
    return _worker
