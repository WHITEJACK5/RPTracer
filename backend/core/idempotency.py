"""Backward-compat shim — idempotency now in ``backend.app.core.idempotency``."""
from backend.app.core.idempotency import (  # noqa: F401
    IdempotencyMiddleware,
    RedisStore,
    _MemoryStore,
    build_store,
)
