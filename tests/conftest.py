"""Shared fixtures for Philips Hue Gradient Controller tests."""

from collections.abc import Generator
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent


@pytest.fixture(autouse=True)
def enable_custom_integration(
    enable_custom_integrations: None,
) -> Generator[None]:
    """Enable loading custom integrations in tests."""
    yield


@pytest.fixture
def hass_config_dir() -> str:
    """Point Home Assistant at the repository's custom_components package."""
    return str(PROJECT_ROOT)
