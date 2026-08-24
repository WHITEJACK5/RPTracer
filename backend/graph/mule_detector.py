"""Backward-compat shim — detector now in ``backend.app.services.graph_detector``."""
from backend.app.services.graph_detector import MuleDetector, get_detector  # noqa: F401
