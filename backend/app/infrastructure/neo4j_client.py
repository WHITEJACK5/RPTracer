"""Lazy Neo4j driver — parameterized writes only, never crashes at boot.

Returns a connected driver or ``None`` when Neo4j is unconfigured/unreachable.
All write helpers in the graph service route through
:func:`backend.app.core.security.guard_cypher_query` so only ``$param``
placeholders are ever submitted.
"""
from __future__ import annotations

from typing import Any

from backend.app.core.config import settings

_driver: Any = None
_available: bool | None = None


async def get_neo4j() -> Any:
    """Return a Neo4j driver, or ``None`` if Neo4j is absent/unreachable."""
    global _driver, _available
    if not settings.neo4j_uri:
        return None
    if _available is True and _driver is not None:
        return _driver
    if _available is False:
        return None
    try:
        from neo4j import GraphDatabase  # optional dependency

        driver = GraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password)
            if settings.neo4j_user else None,
        )
        driver.verify_connectivity()
        _driver, _available = driver, True
        return _driver
    except Exception:
        _available = False
        return None


def is_configured() -> bool:
    return settings.neo4j_uri is not None
