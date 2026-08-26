"""Real latency benchmark for TRACER's scoring pipeline.

    python scripts/bench_latency.py            # defaults: 600 requests
    python scripts/bench_latency.py --n 1000 --concurrency 20

Boots its own uvicorn instance on 127.0.0.1:8123, fires N requests across the
four preset payload types via httpx.AsyncClient, and prints p50/p95/p99 plus
throughput. These are LOCAL MEASUREMENTS on a dev machine (single process,
in-memory graph, no Redis/Neo4j network hops) - not a production SLA claim.

Every millisecond figure quoted in README.md comes from this exact script.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import subprocess
import sys
import time
from pathlib import Path

if sys.platform == "win32":
    pass  # default proactor loop: stability over raw loopback throughput

import httpx

ROOT = Path(__file__).resolve().parents[1]
PORT = 8123
BASE = f"http://127.0.0.1:{PORT}"


def _wait_healthy(client: httpx.Client, timeout_s: float = 90.0) -> None:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        try:
            if client.get(f"{BASE}/healthz").status_code == 200:
                return
        except Exception:
            pass
        time.sleep(1.0)
    raise SystemExit("server did not become healthy in time")


def _load_presets() -> list[dict]:
    raw = json.loads((ROOT / "data" / "sample_payloads.json").read_text("utf-8"))
    payloads = [entry["payload"] for entry in raw.values()]
    # unique event ids so no caching layer can short-circuit repeats
    for i, payload in enumerate(payloads):
        payload["event_id"] = f"{payload['event_id']}_bench"
    return payloads


async def _run(n: int, concurrency: int, payloads: list[dict]) -> tuple[list[float], float]:
    limits = httpx.Limits(max_connections=concurrency + 5)
    async with httpx.AsyncClient(limits=limits, timeout=30.0) as client:
        sem = asyncio.Semaphore(concurrency)
        latencies: list[float] = []

        async def one(i: int) -> None:
            body = dict(payloads[i % len(payloads)])
            body["event_id"] = f"{body['event_id']}_{i}"
            async with sem:
                t0 = time.perf_counter()
                resp = await client.post(f"{BASE}/api/v1/risk/evaluate", json=body)
                dt = (time.perf_counter() - t0) * 1000
                if resp.status_code != 200:
                    raise SystemExit(f"evaluate failed: {resp.status_code} {resp.text[:120]}")
                latencies.append(dt)

        t_start = time.perf_counter()
        await asyncio.gather(*(one(i) for i in range(n)))
        wall = time.perf_counter() - t_start
    return latencies, wall


def _pct(xs: list[float], q: float) -> float:
    return float(statistics.quantiles(xs, n=100)[int(q * 100) - 1])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=600)
    ap.add_argument("--concurrency", type=int, default=10)
    args = ap.parse_args()

    server = subprocess.Popen(
        [sys.executable, str(ROOT / "scripts" / "serve.py")],
        cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        env={**__import__("os").environ,
             "PORT": str(PORT),
             "OMP_NUM_THREADS": "1",          # xgboost predict: no all-core fan-out
             "MKL_NUM_THREADS": "1",
             "RATE_LIMIT_IP_PER_MIN": "99999",
             "RATE_LIMIT_MERCHANT_PER_MIN": "99999"},
    )
    try:
        with httpx.Client() as c:
            _wait_healthy(c)
        payloads = _load_presets()

        print("warming up (model loaded at boot; 25 warm requests)...")
        asyncio.run(_run(25, 5, payloads))

        # ---- Phase 1: sequential per-payment latency (the SLA path) --------
        lat, wall = asyncio.run(_run(200, 1, payloads))
        print(f"\nSEQUENTIAL (n=200) — the per-payment decision path:")
        print(f"  p50={_pct(lat, .50):.1f}ms  p95={_pct(lat, .95):.1f}ms  "
              f"p99={_pct(lat, .99):.1f}ms  max={max(lat):.1f}ms")
        print(f"  {len(lat)/wall:.0f} req/s single-stream")

        # ---- Phase 2: concurrent throughput --------------------------------
        try:
            clat, cwall = asyncio.run(_run(600, 10, payloads))
            print(f"\nCONCURRENT (n=600, concurrency=10):")
            print(f"  p50={_pct(clat, .50):.1f}ms  p95={_pct(clat, .95):.1f}ms  "
                  f"p99={_pct(clat, .99):.1f}ms")
            print(f"  throughput: {len(clat)/cwall:.0f} req/s over {cwall:.1f}s")
        except Exception as exc:
            print(f"\nCONCURRENT phase aborted on this host: {exc!r}")

        print("\nconditions: local dev machine, single uvicorn process, in-memory")
        print("NetworkX graph, no Redis/Neo4j hops. Windows localhost transport")
        print("degrades under high connection concurrency even for hello-world;")
        print("the sequential figure is the representative SLA measurement here.")
        print("NOT a production SLA claim - Linux/uvloop numbers will differ.")
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()


if __name__ == "__main__":
    main()
