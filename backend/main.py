"""Backward-compat shim — app factory now in ``backend.app.main``.

Kept so ``from backend.main import create_app`` (tests, uvicorn) still resolves.
"""
from backend.app.main import app, create_app  # noqa: F401

__all__ = ["create_app", "app"]
