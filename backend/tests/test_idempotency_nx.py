"""Idempotency NX-semantics tests (Redis-free in-memory store)."""
from __future__ import annotations

from backend.app.core.idempotency import _MemoryStore, build_store


def test_nx_begin_finish_replay_semantics() -> None:
    store = _MemoryStore(ttl_seconds=600)
    # first call claims the slot
    state, cached = store.begin("k1")
    assert state == "proceed" and cached is None
    # concurrent identical call while in-flight -> 429 signal
    state2, _ = store.begin("k1")
    assert state2 == "in_progress"
    # finish the first -> stores response
    store.finish("k1", 200, {"content-type": "application/json"},
                 b'{"ok":true}')
    # subsequent call -> completed replay
    state3, cached3 = store.begin("k1")
    assert state3 == "completed"
    assert cached3[0] == 200 and cached3[2] == b'{"ok":true}'


def test_abort_releases_slot() -> None:
    store = _MemoryStore(ttl_seconds=600)
    store.begin("k2")
    store.abort("k2")
    state, _ = store.begin("k2")
    assert state == "proceed"


def test_build_store_falls_back_to_memory_without_redis() -> None:
    store = build_store(600)
    assert isinstance(store, _MemoryStore)
