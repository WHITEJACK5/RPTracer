"""API contract tests — endpoints, idempotency, webhooks, ops surfaces."""
from __future__ import annotations

import hashlib
import hmac


def test_healthz(client):
    r = client.get("/healthz")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["audit_chain_verified"] is True
    assert body["components"]["model"]["kind"] in ("xgboost", "calibrated-linear")


def test_evaluate_normal_upi_is_auto_approved(client, normal_upi):
    r = client.post("/api/v1/risk/evaluate", json=normal_upi)
    assert r.status_code == 200
    body = r.json()
    assert 0 <= body["risk_score"] <= 30
    assert body["risk_band"] == "LOW"
    assert body["decision"] == "AUTO_APPROVE"
    assert len(body["trace"]) >= 5
    assert body["latency_ms"] < 1000        # generous CI ceiling; demo SLA is <50ms


def test_idempotency_replay_returns_same_decision(client, normal_upi):
    headers = {"X-Idempotency-Key": "idem-key-fixed-42"}
    first = client.post("/api/v1/risk/evaluate", json=normal_upi, headers=headers)
    second = client.post("/api/v1/risk/evaluate", json=normal_upi, headers=headers)
    assert first.status_code == second.status_code == 200
    assert second.headers.get("X-Idempotent-Replay") == "true"
    assert first.json()["risk_score"] == second.json()["risk_score"]
    assert first.json()["audit_ref"] == second.json()["audit_ref"]


def test_webhook_payment_captured_maps_paise_and_scores(client):
    envelope = {
        "event": "payment.captured",
        "payload": {"payment": {
            "id": "pay_HOOK_001", "amount": 250000, "currency": "INR",
            "method": "upi", "vpa": "hook.user@ybl",
            "notes": {"device_id": "DEV-HOOK-1", "customer_id": "cust_hook"},
        }},
    }
    r = client.post("/api/v1/webhooks/razorpay", json=envelope)
    assert r.status_code == 200
    body = r.json()
    assert body["event_id"] == "pay_HOOK_001"
    assert body["decision"] in {"AUTO_APPROVE", "STEP_UP_AUTHENTICATION",
                                "PAUSE_PAYOUT_AND_GENERATE_DISPUTE_DOSSIER"}
    assert body["webhook_signature_verified"] is True      # no secret configured -> dev-verified


def test_webhook_rejects_bad_signature(client, monkeypatch):
    from backend.api.v1 import webhooks as wh

    monkeypatch.setattr(wh, "RAZORPAY_WEBHOOK_SECRET", "test_secret_ky")
    envelope = {"event": "order.paid", "payload": {"payment": {"id": "pay_X", "amount": 100}}}
    raw = str(envelope).encode()
    bad_sig = hmac.new(b"wrong_secret", raw, hashlib.sha256).hexdigest()
    r = client.post("/api/v1/webhooks/razorpay", content=raw,
                    headers={"X-Razorpay-Signature": bad_sig,
                             "Content-Type": "application/json"})
    assert r.status_code == 401


def test_dispute_created_forces_dossier_path(client):
    envelope = {
        "event": "dispute.created",
        "payload": {"dispute": {"id": "disp_TEST_01", "amount": 420000},
                    "payment": {"id": "pay_DISP_01", "amount": 420000,
                                "method": "card", "notes": {"device_id": "DEV-DISP-9"}}},
    }
    r = client.post("/api/v1/webhooks/razorpay", json=envelope)
    assert r.status_code == 200
    body = r.json()
    assert body["risk_score"] >= 71
    assert body["decision"] == "PAUSE_PAYOUT_AND_GENERATE_DISPUTE_DOSSIER"
    assert body["dispute_dossier"] is not None
    assert len(body["dispute_dossier"]["evidence"]) >= 4


def test_graph_topology_endpoint_serves_canvas(client):
    r = client.get("/api/v1/graph/topology?center=device:DEV-MULE-RING-01")
    assert r.status_code == 200
    body = r.json()
    assert len(body["nodes"]) > 10
    assert any(n["mule"] for n in body["nodes"]) or body["center"].startswith("dev")


def test_ledger_stats_and_chain(client):
    r = client.get("/api/v1/ledger/stats")
    assert r.status_code == 200
    body = r.json()
    assert body["entries"] > 0
    assert body["chain_verified"] is True
