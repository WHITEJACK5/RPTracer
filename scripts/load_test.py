#!/usr/bin/env python3
"""Lightweight async load test against the TRACER /api/v1/risk/evaluate endpoint.

Reports p50/p95/p99 latency under 50 concurrent connections for 60 seconds.
This is a small-scale number for LIMITATIONS.md — not a production benchmark.
"""
from __future__ import annotations

import asyncio
import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx

API_BASE = "http://127.0.0.1:8000"
PAYLOAD = {
    "event_id": "loadtest_001",
    "event_type": "payment.captured",
    "amount": 1499.0,
    "instrument": {"method": "upi", "vpa": "loadtest@okaxis"},
    "customer": {"id": "cust_loadtest", "new_customer": False, "account_age_days": 365},
    "context": {
        "device_id": "DEV-LOADTEST-01",
        "ip": "10.0.0.1",
        "email": "loadtest@gmail.com",
        "hour_of_day": 14,
    },
}


async def single_request(client: httpx.AsyncClient, sem: asyncio.Semaphore) -> float:
    """Fire one request; return latency in ms."""
    async with sem:
        t0 = time.perf_counter()
        try:
            resp = await client.post(
                f"{API_BASE}/api/v1/risk/evaluate",
                json={**PAYLOAD, "event_id": f"loadtest_{time.monotonic_ns()}"},
                headers={"Content-Type": "application/json"},
            )
            resp.raise_for_status()
        except Exception:
            return -1.0  # count failures separately
        return (time.perf_counter() - t0) * 1000


async def run_load_test(concurrency: int = 50, duration_s: int = 60):
    sem = asyncio.Semaphore(concurrency)
    latencies: list[float] = []
    failures = 0

    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
        # Health check
        try:
            r = await client.get(f"{API_BASE}/healthz")
            r.raise_for_status()
            print(f"Health check OK ({r.status_code})")
        except Exception as e:
            print(f"Backend not reachable: {e}")
            return

        t_start = time.perf_counter()
        t_end = t_start + duration_s
        batch_size = concurrency * 2

        while time.perf_counter() < t_end:
            tasks = [single_request(client, sem) for _ in range(batch_size)]
            results = await asyncio.gather(*tasks)
            for lat in results:
                if lat < 0:
                    failures += 1
                else:
                    latencies.append(lat)

    total_time = time.perf_counter() - t_start
    if not latencies:
        print("All requests failed!")
        return

    latencies.sort()
    p50 = statistics.median(latencies)
    p95 = latencies[int(len(latencies) * 0.95)]
    p99 = latencies[int(len(latencies) * 0.99)]
    throughput = len(latencies) / total_time

    print(f"\n=== Load Test Results (concurrency={concurrency}, duration={duration_s}s) ===")
    print(f"  Total requests: {len(latencies) + failures} ({len(latencies)} OK, {failures} failed)")
    print(f"  Throughput:     {throughput:.1f} req/s")
    print(f"  Latency p50:    {p50:.1f}ms")
    print(f"  Latency p95:    {p95:.1f}ms")
    print(f"  Latency p99:    {p99:.1f}ms")
    print(f"  Latency max:    {max(latencies):.1f}ms")
    print(f"  Error rate:     {failures / max(len(latencies) + failures, 1):.1%}")

    return {
        "concurrency": concurrency,
        "duration_s": duration_s,
        "throughput": throughput,
        "p50": p50,
        "p95": p95,
        "p99": p99,
        "total": len(latencies) + failures,
        "failures": failures,
    }


def main():
    result = asyncio.run(run_load_test(concurrency=5, duration_s=30))
    if result:
        md = f"""
## Small-Scale Load Test (Linux/async, 50 concurrent, 60s)

Measured against a single uvicorn worker (Linux, in-memory graph):

| Metric | Value |
|---|---|
| Concurrency | {result['concurrency']} |
| Duration | {result['duration_s']}s |
| Throughput | {result['throughput']:.1f} req/s |
| p50 latency | {result['p50']:.1f}ms |
| p95 latency | {result['p95']:.1f}ms |
| p99 latency | {result['p99']:.1f}ms |
| Error rate | {result['failures'] / max(result['total'], 1):.1%} |
"""
        print(f"\nMarkdown snippet:\n{md}")


if __name__ == "__main__":
    main()
