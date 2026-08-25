"""Review queue — every HIGH-band payout-hold decision is queryable for human triage.

This is the single biggest gap between a demo and a real risk manager:
production fraud teams must be able to confirm or dismiss automated holds.

Architecture:
* Decisions with band=HIGH are inserted into a SQLite WAL table (``review_queue.db``).
* Exposed via ``GET /api/v1/reviews`` and ``POST /api/v1/reviews/{event_id}/label``.
* Labels are appended to ``data/review_labels.jsonl`` as a growing, dated, real-world
  labeled dataset — the foundation for future supervised retraining.
* A Prometheus gauge tracks live queue backlog size.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any, Literal

from backend.app.core.config import DATA_DIR

_DB_PATH = DATA_DIR / "review_queue.db"
_LOCK = threading.Lock()
_LABELS_PATH = DATA_DIR / "review_labels.jsonl"


class ReviewQueue:
    """Queryable review queue backed by SQLite WAL."""

    def __init__(self, db_path: Path | None = None) -> None:
        self.db_path = db_path or _DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self) -> None:
        with _LOCK:
            conn = sqlite3.connect(str(self.db_path), timeout=10.0)
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("""
                CREATE TABLE IF NOT EXISTS review_queue (
                    event_id TEXT PRIMARY KEY,
                    risk_score INTEGER NOT NULL,
                    risk_band TEXT NOT NULL,
                    decision TEXT NOT NULL,
                    merchant_id TEXT NOT NULL,
                    model_version TEXT NOT NULL,
                    degraded INTEGER NOT NULL DEFAULT 0,
                    feature_snapshot TEXT,
                    graph_evidence TEXT,
                    status TEXT NOT NULL DEFAULT 'pending_review',
                    created_at_ms INTEGER NOT NULL,
                    labeled_at_ms INTEGER,
                    label TEXT
                )
            """)
            conn.commit()
            conn.close()

    def insert(self, event_id: str, risk_score: int, risk_band: str,
               decision: str, merchant_id: str, model_version: str,
               degraded: bool, feature_snapshot: dict[str, Any],
               graph_evidence: dict[str, Any]) -> None:
        """Insert a HIGH-band decision for human review."""
        ts_ms = int(time.time() * 1000)
        with _LOCK:
            conn = sqlite3.connect(str(self.db_path), timeout=10.0)
            conn.execute("""
                INSERT OR IGNORE INTO review_queue
                (event_id, risk_score, risk_band, decision, merchant_id,
                 model_version, degraded, feature_snapshot, graph_evidence,
                 status, created_at_ms)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', ?)
            """, (event_id, risk_score, risk_band, decision, merchant_id,
                  model_version, int(degraded),
                  json.dumps(feature_snapshot), json.dumps(graph_evidence),
                  ts_ms))
            conn.commit()
            conn.close()

    def list_reviews(self, status: str = "pending_review", limit: int = 50) -> list[dict[str, Any]]:
        """List reviews filtered by status."""
        with _LOCK:
            conn = sqlite3.connect(str(self.db_path), timeout=10.0)
            cur = conn.cursor()
            cur.execute("""
                SELECT event_id, risk_score, risk_band, decision, merchant_id,
                       model_version, degraded, feature_snapshot, graph_evidence,
                       status, created_at_ms, label, labeled_at_ms
                FROM review_queue WHERE status = ? ORDER BY created_at_ms DESC LIMIT ?
            """, (status, limit))
            rows = cur.fetchall()
            conn.close()

        out = []
        for r in rows:
            out.append({
                "event_id": r[0], "risk_score": r[1], "risk_band": r[2],
                "decision": r[3], "merchant_id": r[4], "model_version": r[5],
                "degraded": bool(r[6]), "feature_snapshot": json.loads(r[7] or "{}"),
                "graph_evidence": json.loads(r[8] or "{}"), "status": r[9],
                "created_at_ms": r[10], "label": r[11],
                "labeled_at_ms": r[12],
            })
        return out

    def count_by_status(self) -> dict[str, int]:
        """Count reviews by status for Prometheus gauge."""
        with _LOCK:
            conn = sqlite3.connect(str(self.db_path), timeout=10.0)
            cur = conn.cursor()
            cur.execute("SELECT status, COUNT(*) FROM review_queue GROUP BY status")
            rows = cur.fetchall()
            conn.close()
        return {r[0]: r[1] for r in rows}

    def label(self, event_id: str, label: Literal["confirmed_fraud", "false_positive"],
              reason: str = "") -> bool:
        """Label a review item. Returns True if found and labeled."""
        ts_ms = int(time.time() * 1000)
        with _LOCK:
            conn = sqlite3.connect(str(self.db_path), timeout=10.0)
            cur = conn.cursor()
            cur.execute("""
                UPDATE review_queue SET status = 'labeled', label = ?, labeled_at_ms = ?
                WHERE event_id = ? AND status = 'pending_review'
            """, (label, ts_ms, event_id))
            found = cur.rowcount > 0
            conn.commit()
            conn.close()

        if found:
            self._append_label(event_id, label, reason, ts_ms)
        return found

    def _append_label(self, event_id: str, label: str, reason: str, ts_ms: int) -> None:
        """Append label to the growing labeled dataset for future retraining."""
        record = {
            "event_id": event_id, "label": label, "reason": reason,
            "labeled_at_ms": ts_ms, "source": "human_review",
        }
        with _LOCK:
            with _LABELS_PATH.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(record, sort_keys=True) + "\n")

    def clear(self) -> None:
        with _LOCK:
            if self.db_path.exists():
                conn = sqlite3.connect(str(self.db_path), timeout=10.0)
                conn.execute("DELETE FROM review_queue")
                conn.commit()
                conn.close()


_queue: ReviewQueue | None = None


def get_review_queue() -> ReviewQueue:
    global _queue
    if _queue is None:
        _queue = ReviewQueue()
    return _queue
