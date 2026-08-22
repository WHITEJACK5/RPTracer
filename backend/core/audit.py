"""Append-only, hash-chained double-entry audit ledger.

Every risk decision writes a balanced pair of entries:
    DEBIT  account="risk_engine:<event>"   <- decision weight
    CREDIT account="merchant_protection"   <- protection value delivered

Entries are chained with SHA-256(prev_hash || canonical_entry) so any
tampering is detectable. The file is opened in append mode only.
"""
from __future__ import annotations

import hashlib
import json
import threading
import time
from pathlib import Path
from typing import Any

_LOCK = threading.Lock()


def _canonical(entry: dict[str, Any]) -> str:
    return json.dumps(entry, sort_keys=True, separators=(",", ":"))


class AuditLedger:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._prev_hash = self._load_last_hash()

    def _load_last_hash(self) -> str:
        if not self.path.exists():
            return "GENESIS"
        last = "GENESIS"
        with self.path.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line:
                    try:
                        last = json.loads(line).get("hash", last)
                    except json.JSONDecodeError:
                        continue
        return last

    def append(self, debit_account: str, credit_account: str,
               amount: float, refs: dict[str, Any]) -> str:
        """Write one balanced double-entry pair; returns the entry hash."""
        ts = int(time.time() * 1000)
        entries = [
            {"side": "DEBIT", "account": debit_account, "amount": round(amount, 2), "ts_ms": ts, **refs},
            {"side": "CREDIT", "account": credit_account, "amount": round(amount, 2), "ts_ms": ts, **refs},
        ]
        with _LOCK:
            head = self._prev_hash
            final_hash = ""
            for entry in entries:
                digest = hashlib.sha256(f"{head}{_canonical(entry)}".encode()).hexdigest()
                record = {**entry, "prev_hash": head, "hash": digest}
                with self.path.open("a", encoding="utf-8") as fh:
                    fh.write(_canonical(record) + "\n")
                head = digest
                final_hash = digest
            self._prev_hash = head
        return final_hash

    def verify_chain(self) -> bool:
        """Recompute the full chain; returns True when tamper-free."""
        head = "GENESIS"
        if not self.path.exists():
            return True
        with self.path.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                rec = json.loads(line)
                body = {k: v for k, v in rec.items() if k not in ("hash",)}
                prev = body.pop("prev_hash", None)
                expected = hashlib.sha256(f"{head}{_canonical(body)}".encode()).hexdigest()
                if prev != head or rec.get("hash") != expected:
                    return False
                head = rec["hash"]
        return True


_ledger: AuditLedger | None = None


def get_ledger(path: Path | None = None) -> AuditLedger:
    global _ledger
    if _ledger is None or path is not None:
        from backend.config import LEDGER_PATH
        _ledger = AuditLedger(path or LEDGER_PATH)
    return _ledger
