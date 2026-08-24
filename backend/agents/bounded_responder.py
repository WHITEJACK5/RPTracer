"""Backward-compat shim — bounded agent now in ``backend.app.services.llm_dossier``."""
from backend.app.services.llm_dossier import (  # noqa: F401
    decide,
    _ALLOWED,
    _step,
    _evaluation,
)
