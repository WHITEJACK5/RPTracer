"""Tests for backend.app.services.ledger_service (append-only hash chain)."""
from __future__ import annotations

import json

from backend.app.services.ledger_service import AuditLedger, get_ledger


def test_append_returns_changing_head(tmp_path):
    path = tmp_path / "ledger.jsonl"
    ledger = AuditLedger(path)
    h1 = ledger.append("risk_engine::e1", "merchant_protection", 10.0,
                       refs={"event_id": "e1"})
    h2 = ledger.append("risk_engine::e2", "merchant_protection", 20.0,
                       refs={"event_id": "e2"})
    assert h1 != h2
    assert len(h1) == 64 and len(h2) == 64
    assert ledger.state()["intact"] is True
    assert ledger.state()["entries"] == 4  # two double-entries


def test_chain_survives_writes(tmp_path):
    path = tmp_path / "ledger.jsonl"
    ledger = AuditLedger(path)
    ledger.append("a", "b", 10.0, refs={"event_id": "e1"})
    ledger.append("a", "c", 20.0, refs={"event_id": "e2"})
    assert ledger.verify_chain() is True


def test_tamper_detected(tmp_path):
    path = tmp_path / "ledger.jsonl"
    ledger = AuditLedger(path)
    ledger.append("a", "b", 10.0, refs={"event_id": "e1"})
    ledger.append("a", "c", 20.0, refs={"event_id": "e2"})
    # corrupt the amount of the first entry (breaks the hash chain)
    lines = path.read_text(encoding="utf-8").splitlines()
    rec = json.loads(lines[0])
    rec["amount"] = 999.0
    lines[0] = json.dumps(rec)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    reloaded = AuditLedger(path)
    assert reloaded._boot_intact is False
    assert reloaded.state()["intact"] is False


def test_state_is_o1_snapshot(tmp_path):
    path = tmp_path / "ledger.jsonl"
    ledger = AuditLedger(path)
    for i in range(5):
        ledger.append("a", "b", float(i), refs={"event_id": f"e{i}"})
    state = ledger.state()
    assert set(state) == {"intact", "entries", "head"}
    assert state["entries"] == 10
    assert len(state["head"]) == 16


def test_get_ledger_singleton_and_path_override(tmp_path):
    l1 = get_ledger(tmp_path / "one.jsonl")
    l2 = get_ledger()  # cached singleton (no path) — different file in this proc
    assert isinstance(l2, AuditLedger)
    # explicit path always rebuilds
    l3 = get_ledger(tmp_path / "two.jsonl")
    assert l3.path != l1.path or l1.path.name == "two.jsonl"
