#!/usr/bin/env python3
"""TRACER v2.0 — Live API Demo Sequence.

Demonstrates real-time graph building and mule-ring detection by sending a live
sequence of HTTP events to a running TRACER instance (default: http://127.0.0.1:8000).

No pre-seeded memory is used. Every entity node and edge in the graph is built
dynamically from this event stream.
"""

import json
import sys
import time
import urllib.request

API_BASE = "http://127.0.0.1:8000"


def send_event(payload: dict) -> dict:
    url = f"{API_BASE}/api/v1/risk/evaluate"
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> None:
    print("=== TRACER Live Demo Sequence ===")
    print(f"Targeting engine at {API_BASE}...\n")

    # Step 1: Normal transaction
    print("1. Ingesting normal UPI transaction...")
    normal = {
        "event_id": "demo_live_normal_01",
        "amount": 1499.0,
        "instrument": {"method": "upi", "vpa": "alice@oksbi"},
        "customer": {"id": "cust_alice", "new_customer": False, "account_age_days": 500},
        "context": {"device_id": "DEV-ALICE-01", "ip": "49.36.12.1", "email": "alice@gmail.com"},
    }
    res1 = send_event(normal)
    print(f"   -> Score: {res1['risk_score']} | Decision: {res1['decision']} | Ring: {res1['graph_evidence']['ring_detected']}\n")
    time.sleep(0.5)

    # Step 2: Mule ring pattern — same device fanning out to 5 different VPAs
    print("2. Ingesting multi-account mule ring events (same device -> 5 VPAs)...")
    device_id = "DEV-DEMO-RING-X9"
    for i in range(1, 6):
        mule_event = {
            "event_id": f"demo_live_mule_{i:02d}",
            "amount": 25000.0 + i * 1000,
            "instrument": {"method": "upi", "vpa": f"mule_vpa_{i:02d}@ybl", "card_fingerprint": f"FP-MULE-{i % 2}"},
            "customer": {"id": f"cust_mule_{i:02d}", "new_customer": True, "account_age_days": 2},
            "context": {"device_id": device_id, "ip": "203.0.113.99", "email": f"burner_{i:02d}@tempmail.dev"},
        }
        res = send_event(mule_event)
        print(f"   Event {i}: Score {res['risk_score']} | Band: {res['risk_band']} | Ring Detected: {res['graph_evidence']['ring_detected']}")
        time.sleep(0.3)

    print("\n=== Demo Sequence Complete — Graph populated dynamically ===")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Error executing demo sequence: {exc}")
        print("Ensure TRACER backend is running on http://127.0.0.1:8000")
        sys.exit(1)
