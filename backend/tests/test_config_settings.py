"""Tests for backend.app.core.config (pydantic-settings behavior)."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from backend.app.core.config import ConfigError, Settings, band_for


def test_cors_origin_list_strips_empties():
    s = Settings(cors_origins="http://a.com, ,http://b.com,,")
    assert s.cors_origin_list() == ["http://a.com", "http://b.com"]


def test_cors_wildcard_rejected():
    with pytest.raises(ValidationError):
        Settings(cors_origins="http://a.com,*")


def test_cors_wildcard_in_any_entry_rejected():
    with pytest.raises(ValidationError):
        Settings(cors_origins="*,http://a.com")


def test_environment_is_lowercased():
    assert Settings(environment="DEVELOPMENT").environment == "development"


def test_production_weak_secret_raises():
    with pytest.raises(ConfigError):
        Settings(environment="production", razorpay_webhook_secret="short")


def test_production_valid_secret_ok():
    secret = "x" * 32
    s = Settings(environment="production", razorpay_webhook_secret=secret)
    assert s.razorpay_webhook_secret == secret


def test_development_short_secret_ok():
    # only production enforces the >=32 char rule
    s = Settings(environment="development", razorpay_webhook_secret="short")
    assert s.razorpay_webhook_secret == "short"


def test_band_for_boundaries():
    assert band_for(0) == band_for(30) == "LOW"
    assert band_for(31) == band_for(70) == "MEDIUM"
    assert band_for(71) == band_for(100) == "HIGH"


def test_extra_env_vars_ignored():
    # extra="ignore" means unknown keys don't blow up
    s = Settings(_UNKNOWN_KEY="nope")
    assert isinstance(s.environment, str)
