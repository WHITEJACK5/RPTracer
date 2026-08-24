"""Backward-compat shim — dossier generator now in ``backend.app.services.llm_dossier``."""
from backend.app.services.llm_dossier import (  # noqa: F401
    generate_dossier,
    _sanitize,
    _deep_sanitize,
    _template_dossier,
)
