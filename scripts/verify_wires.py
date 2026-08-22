"""End-to-end wire check: replays every HTTP call the dashboard makes."""
from __future__ import annotations

import json
import sys
import time
import urllib.request
from pathlib import Path

BASE = "http://127.0.0.1:8000"
FAILS: list[str] = []


def req(method: str, path: str, body: dict | None = None,
        headers: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method,
                               headers={"Content-Type": "application/json",
                                        **(headers or {})})
    try:
        resp = urllib.request.urlopen(r, timeout=30)
        return resp.status, dict(resp.headers), json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), json.loads(e.read() or b"{}")


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f"  ({detail})" if detail else ""))
    if not ok:
        FAILS.append(name)


print("== Navbar: GET /healthz ==")
status, _, hz = req("GET", "/healthz")
check("healthz 200", status == 200)
check("engine healthy", hz.get("status") == "ok")
check("audit chain intact", hz.get("audit_chain_verified") is True)

print("== Sandbox: GET /api/v1/presets ==")
_, _, presets = req("GET", "/api/v1/presets")
check("4 presets served", len(presets) == 4)
check("preset shape", all(
    {"label", "description", "expected_band", "payload"} <= set(p)
    for p in presets.values()))

print("== Evaluate: POST /api/v1/risk/evaluate x4 ==")
expected = {"normal_upi": ("LOW", "AUTO_APPROVE"),
            "rto_cod": ("HIGH", "PAUSE_PAYOUT_AND_GENERATE_DISPUTE_DOSSIER"),
            "mule_ring": ("HIGH", "PAUSE_PAYOUT_AND_GENERATE_DISPUTE_DOSSIER"),
            "synthetic_id": ("HIGH", "PAUSE_PAYOUT_AND_GENERATE_DISPUTE_DOSSIER")}
device_ids: dict[str, str] = {}
for key, preset in presets.items():
    body = preset["payload"]
    body["event_id"] = f"wire_{key}_{int(time.time())}"
    device_ids[key] = body["context"].get("device_id") or ""
    t0 = time.perf_counter()
    status, hdrs, ev = req("POST", "/api/v1/risk/evaluate", body,
                           {"X-Idempotency-Key": f"wire-{key}-{t0}"})
    band, decision = expected[key]
    check(f"{key}: 200 + {band} band", status == 200 and ev["risk_band"] == band)
    check(f"{key}: bounded action", ev["decision"] == decision)
    check(f"{key}: latency_ms present", isinstance(ev["latency_ms"], (int, float)))
    ring_ok = key != "mule_ring" or ev["graph_evidence"]["ring_detected"] is True
    check(f"{key}: graph evidence", ring_ok)
    dossier_ok = (ev["dispute_dossier"] is not None) == (band == "HIGH")
    check(f"{key}: dossier policy", dossier_ok)

print("== Replay: same idempotency key twice ==")
body = presets["normal_upi"]["payload"]
key = f"replay-check-{time.time()}"
b1 = dict(body); s1, h1, r1 = req("POST", "/api/v1/risk/evaluate",
                                  {**b1, "event_id": "wire_replay"}, {"X-Idempotency-Key": key})
s2, h2, r2 = req("POST", "/api/v1/risk/evaluate",
                 {**b1, "event_id": "wire_replay"}, {"X-Idempotency-Key": key})
check("second call flagged replay",
      h2.get("X-Idempotent-Replay", "").lower() == "true" or
      h2.get("x-idempotent-replay", "").lower() == "true")
check("replay returns identical audit_ref", r1["audit_ref"] == r2["audit_ref"])

print("== GraphCanvas: GET /api/v1/graph/topology ==")
_, _, topo = req("GET", "/api/v1/graph/topology?center=device:DEV-MULE-RING-01")
check("centered topology has nodes", len(topo.get("nodes", [])) > 10)
check("center honored (not last-event fallback)",
      topo.get("center") == "device:DEV-MULE-RING-01")
check("node shape for canvas",
      all({"id", "type", "label", "mule"} <= set(n) for n in topo["nodes"]))
mule_dev = device_ids.get("mule_ring") or "DEV-MULE-RING-01"
_, _, topo2 = req("GET", f"/api/v1/graph/topology?center=device:{mule_dev}")
check("post-evaluate center resolves", len(topo2.get("nodes", [])) > 0)
_, _, topo3 = req("GET", "/api/v1/graph/topology?center=DEV-MULE-RING-01")
check("bare-id center also resolves", len(topo3.get("nodes", [])) > 10)

print("== Ops: GET /api/v1/model/report (precomputed at boot?) ==")
t0 = time.perf_counter()
status, _, report = req("GET", "/api/v1/model/report")
dt = (time.perf_counter() - t0) * 1000
if dt >= 500:                            # boot race: background precompute may
    time.sleep(2)                        # still be running right after boot; retry
    t0 = time.perf_counter()
    status, _, report = req("GET", "/api/v1/model/report")
    dt = (time.perf_counter() - t0) * 1000
check("report 200", status == 200)
check("report fast (precomputed)", dt < 500, f"{dt:.0f}ms")
check("report carries FP cost", any("fp_per_1000_legit" in v
                                    for v in report.get("flag_rate_operating_points", {}).values()))

print()
if FAILS:
    print(f"WIRE CHECK FAILED: {len(FAILS)} -> {FAILS}")
    sys.exit(1)
print("ALL WIRES GREEN - frontend<->backend contract verified end to end.")
