"""Pytest hooks — allow HTTP integration tests without a production API key."""

import pytest

from app.core.config import settings


@pytest.fixture(scope="session", autouse=True)
def _test_internal_api_key_bypass():
    """Match dev bypass in internal_auth (test env + default key)."""
    previous = settings.environment
    settings.environment = "test"
    yield
    settings.environment = previous
