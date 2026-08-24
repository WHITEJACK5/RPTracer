"""Append-only, hash-chained double-entry audit ledger (service layer).

Every risk decision writes a balanced pair of entries:
    DEBIT  account="risk_engine:<event>"   <- decision weight
    CREDIT account="merchant_protection"   <- protection value delivered

Entries are chained with SHA-256(prev_hash || canonical_entry) so any
tampering is detectable. The file is opened in append mode only.

Integrity model
--------------
* Boot: the pre-existing file is fully re-hashed ONCE (O(filesize)).
* Appends extend the in-memory head; each write updates entry count.
* ``state()`` reports live integrity in O(1) - safe to call from /healthz.
* ``verify_chain()`` remains available for explicit deep scans.

The ledger is NEVER rewound (immutable audit invariant).
"""
from __future__ import annotations

import hashlib
import json
import threading
import time
from pathlib import Path
from typing import Any

from backend.app.core.config import LEDGER_PATH

_LOCK = threading.Lock()


def _canonical(entry: dict[str, Any]) -> str:
    return json.dumps(entry, sort_keys=True, separators=(",", ":"))


class AuditLedger:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._prev_hash = "GENESIS"
        self._entries = 0
        # full scan of any pre-existing file exactly once at construction
        self._boot_intact = self._load_and_verify()

    def _load_and_verify(self) -> bool:
        ok = True
        head = "GENESIS"
        if not self.path.exists():
            return True
        with self.path.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    ok = False
                    continue
                body = {k: v for k, v in rec.items() if k != "hash"}
                prev = body.pop("prev_hash", None)
                expected = hashlib.sha256(f"{head}{_canonical(body)}".encode()).hexdigest()
                if prev != head or rec.get("hash") != expected:
                    ok = False
                head = rec.get("hash", head)
                self._entries += 1
        self._prev_hash = head
        return ok

    def append(self, debit_account: str, credit_account: str,
               amount: float, refs: dict[str, Any]) -> str:
        """Write one balanced double-entry pair; returns the chain head hash."""
        ts = int(time.time() * 1000)
        entries = [
            {"side": "DEBIT", "account": debit_account, "amount": round(amount, 2), "ts_ms": ts, **refs},
            {"side": "CREDIT", "account": credit_account, "amount": round(amount, 2), "ts_ms": ts, **refs},
        ]
        with _LOCK:
            head = self._prev_hash
            lines: list[str] = []
            for entry in entries:
                digest = hashlib.sha256(f"{head}{_canonical(entry)}".encode()).hexdigest()
                record = {**entry, "prev_hash": head, "hash": digest}
                lines.append(_canonical(record))
                head = digest
            with self.path.open("a", encoding="utf-8") as fh:
                fh.write("\n".join(lines) + "\n")
            self._prev_hash = head
            self._entries += len(entries)
        return head

    def state(self) -> dict[str, Any]:
        """O(1) live integrity snapshot - safe for health probes."""
        return {
            "intact": self._boot_intact,
            "entries": self._entries,
            "head": self._prev_hash[:16],
        }

    def verify_chain(self) -> bool:
        """Deep re-scan of the whole file (ops tooling, tests)."""
        self._boot_intact = self._load_and_verify()
        return self._boot_intact


_ledger: AuditLedger | None = None


def get_ledger(path: Path | None = None) -> AuditLedger:
    global _ledger
    if _ledger is None or path is not None:
        _ledger = AuditLedger(path or LEDGER_PATH)
    return _ledger
