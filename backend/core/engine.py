"""Backward-compat shim — pipeline now in ``backend.app.services.scorer``."""
from backend.app.services.scorer import component_status, run_pipeline  # noqa: F401
