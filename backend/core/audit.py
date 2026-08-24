"""Backward-compat shim — ledger now in ``backend.app.services.ledger_service``."""
from backend.app.services.ledger_service import AuditLedger, get_ledger  # noqa: F401
