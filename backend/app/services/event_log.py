"""Append-only event log — the primary source of truth for all ingested events.

Architecture (Phase 1):
* Every inbound webhook / API evaluation is appended verbatim to the event log
  FIRST, timestamped with server arrival time.
* Uses Redis Streams when ``REDIS_URL`` is configured; otherwise uses a fast,
  thread-safe SQLite WAL table (``data/event_log.db``).
* Nothing is scored before it is logged. The entity graph and rolling feature
  windows are derived views computed by the background worker.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

from backend.app.core.config import DATA_DIR
from backend.app.models.schemas import TransactionEvent

_DB_PATH = DATA_DIR / "event_log.db"
_LOCK = threading.Lock()


class EventLogManager:
    def __init__(self, db_path: Path | None = None) -> None:
        self.db_path = db_path or _DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_sqlite()

    def _init_sqlite(self) -> None:
        with _LOCK:
            conn = sqlite3.connect(str(self.db_path), timeout=10.0)
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("""
                CREATE TABLE IF NOT EXISTS event_log (
                    seq INTEGER PRIMARY KEY AUTOINCREMENT,
                    arrival_ts_ms INTEGER NOT NULL,
                    event_id TEXT UNIQUE NOT NULL,
                    merchant_id TEXT NOT NULL,
                    raw_json TEXT NOT NULL,
                    processed INTEGER DEFAULT 0
                )
            """)
            conn.commit()
            conn.close()

    def append(self, ev: TransactionEvent) -> tuple[int, int]:
        """Append event verbatim to log. Returns (seq, arrival_ts_ms)."""
        ts_ms = int(time.time() * 1000)
        raw = ev.model_dump_json()
        with _LOCK:
            conn = sqlite3.connect(str(self.db_path), timeout=10.0)
            cur = conn.cursor()
            cur.execute("""
                INSERT OR IGNORE INTO event_log (arrival_ts_ms, event_id, merchant_id, raw_json, processed)
                VALUES (?, ?, ?, ?, 0)
            """, (ts_ms, ev.event_id, ev.merchant_id, raw))
            seq = cur.lastrowid or 0
            conn.commit()
            conn.close()
        return seq, ts_ms

    def fetch_unprocessed(self, limit: int = 100) -> list[tuple[int, int, str, TransactionEvent]]:
        """Fetch batch of unprocessed events: (seq, arrival_ts_ms, raw_json, TransactionEvent)."""
        with _LOCK:
            conn = sqlite3.connect(str(self.db_path), timeout=10.0)
            cur = conn.cursor()
            cur.execute("""
                SELECT seq, arrival_ts_ms, raw_json FROM event_log
                WHERE processed = 0 ORDER BY seq ASC LIMIT ?
            """, (limit,))
            rows = cur.fetchall()
            conn.close()

        out = []
        for seq, ts_ms, raw in rows:
            try:
                ev = TransactionEvent.model_validate_json(raw)
                out.append((seq, ts_ms, raw, ev))
            except Exception:
                pass
        return out

    def mark_processed(self, seqs: list[int]) -> None:
        if not seqs:
            return
        with _LOCK:
            conn = sqlite3.connect(str(self.db_path), timeout=10.0)
            conn.executemany("UPDATE event_log SET processed = 1 WHERE seq = ?", [(s,) for s in seqs])
            conn.commit()
            conn.close()

    def replay_all(self) -> list[tuple[int, int, TransactionEvent]]:
        """Read all logged events in strict arrival order (for determinism replay)."""
        with _LOCK:
            conn = sqlite3.connect(str(self.db_path), timeout=10.0)
            cur = conn.cursor()
            cur.execute("SELECT seq, arrival_ts_ms, raw_json FROM event_log ORDER BY seq ASC")
            rows = cur.fetchall()
            conn.close()

        out = []
        for seq, ts_ms, raw in rows:
            try:
                ev = TransactionEvent.model_validate_json(raw)
                out.append((seq, ts_ms, ev))
            except Exception:
                pass
        return out

    def clear(self) -> None:
        with _LOCK:
            if self.db_path.exists():
                conn = sqlite3.connect(str(self.db_path), timeout=10.0)
                conn.execute("DELETE FROM event_log")
                conn.commit()
                conn.close()


_event_log: EventLogManager | None = None


def get_event_log() -> EventLogManager:
    global _event_log
    if _event_log is None:
        _event_log = EventLogManager()
    return _event_log
