"""Tests for HMAC verification helpers in backend.app.core.security."""
from __future__ import annotations

import hashlib
import hmac

from backend.app.core.security import (
    constant_time_compare,
    verify_signature,
)


def test_constant_time_compare_basics():
    assert constant_time_compare("abc", "abc") is True
    assert constant_time_compare("abc", "abd") is False
    assert constant_time_compare("", "") is True
    assert constant_time_compare("a", "bb") is False


def test_verify_signature_valid_and_invalid():
    secret = "super_secret_value"
    raw = b'{"event":"payment.captured"}'
    expected = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    assert verify_signature(raw, secret, expected) is True
    # tampered signature fails
    bad = hmac.new(b"other", raw, hashlib.sha256).hexdigest()
    assert verify_signature(raw, secret, bad) is False


def test_verify_signature_constant_time_compare_usage():
    # verify_signature delegates to hmac.compare_digest; same input -> True
    raw = b"x"
    sig = hmac.new(b"k", raw, hashlib.sha256).hexdigest()
    assert verify_signature(raw, "k", sig) is True


def test_verify_signature_missing_inputs():
    assert verify_signature(b"x", "", "sig") is False
    assert verify_signature(b"x", "secret", None) is False
    assert verify_signature(b"x", None, "sig") is False
