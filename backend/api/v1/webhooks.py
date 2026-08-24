"""Backward-compat shim for ``backend.api.v1.webhooks``.

The real implementation lives in ``backend.app.api.v1.webhooks``. We alias this
module object to that one so tests which ``monkeypatch`` module-level globals
(``RAZORPAY_WEBHOOK_SECRET``, ``REQUIRE_WEBHOOK_SECRET``) affect the live code.
"""
import sys

from backend.app.api.v1 import webhooks as _webhooks

sys.modules[__name__] = _webhooks
