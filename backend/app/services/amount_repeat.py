"""Same-amount repeat detector — pattern-driven, not amount-size driven.

Flags a device/account as risky when the SAME amount (or within ±5 or ±2%)
is sent/received multiple times in a short sliding window. This is the classic
smurfing / layering pattern: not high amount, but high repetition.

Professional industry logic:
- Window: last 1 hour or last 20 txns per device (whichever is smaller, in-memory)
- Tolerance: exact match or within ±5 absolute or ±2% relative (covers ₹1-₹1000 range)
- Threshold: 3 repeats (i.e., 4th occurrence of same amount) → HIGH, 2 repeats → MEDIUM

State is in-memory, single-process, lock-free for demo (production would use Redis).
"""
from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Deque, Dict

_WINDOW_SECONDS = 3600  # 1 hour
_MAX_KEEP = 20
_TOLERANCE_ABS = 5.0
_TOLERANCE_PCT = 0.02  # 2%
_REPEAT_MEDIUM = 2  # 2 prior same-amount in window -> MEDIUM
_REPEAT_HIGH = 3    # 3 prior same-amount in window -> HIGH

_store: Dict[str, Deque[tuple[float, float]]] = defaultdict(deque)  # device_id -> deque of (amount, ts)

def _is_same(a: float, b: float) -> bool:
    if a == b:
        return True
    diff = abs(a - b)
    if diff <= _TOLERANCE_ABS:
        return True
    # 2% relative for larger amounts (e.g., 500 vs 510)
    avg = (a + b) / 2
    if avg == 0:
        return diff <= _TOLERANCE_ABS
    return (diff / avg) <= _TOLERANCE_PCT

def observe(device_id: str | None, amount: float) -> dict[str, int | bool]:
    """Record amount for device and return repeat stats. Always returns dict."""
    if not device_id:
        return {"same_amount_repeat": 0, "is_repeat_medium": False, "is_repeat_high": False}
    now = time.monotonic()
    dq = _store[device_id]
    # Evict old (>1h) and cap size
    while dq and dq[0][1] < now - _WINDOW_SECONDS:
        dq.popleft()
    # Count prior same-amount in window
    cnt = sum(1 for amt, _ in dq if _is_same(amt, amount))
    # Append current after counting (so 1st occurrence -> 0, 4th -> 3)
    dq.append((amount, now))
    while len(dq) > _MAX_KEEP:
        dq.popleft()
    return {
        "same_amount_repeat": cnt,
        "is_repeat_medium": cnt >= _REPEAT_MEDIUM,
        "is_repeat_high": cnt >= _REPEAT_HIGH,
    }

def peek(device_id: str | None, amount: float) -> dict[str, int | bool]:
    """Non-mutating peek — for feature generation without side effect."""
    if not device_id:
        return {"same_amount_repeat": 0, "is_repeat_medium": False, "is_repeat_high": False}
    now = time.monotonic()
    dq = _store.get(device_id)
    if not dq:
        return {"same_amount_repeat": 0, "is_repeat_medium": False, "is_repeat_high": False}
    cnt = 0
    for amt, ts in dq:
        if ts < now - _WINDOW_SECONDS:
            continue
        if _is_same(amt, amount):
            cnt += 1
    return {
        "same_amount_repeat": cnt,
        "is_repeat_medium": cnt >= _REPEAT_MEDIUM,
        "is_repeat_high": cnt >= _REPEAT_HIGH,
    }

def reset(device_id: str | None = None) -> None:
    if device_id:
        _store.pop(device_id, None)
    else:
        _store.clear()

def stats(device_id: str | None) -> dict:
    dq = _store.get(device_id or "", deque())
    return {"window_size": len(dq), "amounts": [a for a, _ in dq]}
