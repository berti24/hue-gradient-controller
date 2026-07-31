"""Tests for Home Assistant Repairs issue lifecycle."""

from unittest.mock import patch

from homeassistant.const import CONF_API_VERSION
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryError
from homeassistant.helpers import issue_registry as ir
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.hue_gradient_controller.const import (
    CONF_HUE_BRIDGES,
    DOMAIN,
)
from custom_components.hue_gradient_controller.issues import (
    ISSUE_INCOMPATIBLE_NATIVE_HUE,
    ISSUE_SELECTED_BRIDGES_MISSING,
)


async def test_missing_selected_bridge_issue_clears_after_valid_reload(
    hass: HomeAssistant,
) -> None:
    """A stale explicit bridge selection is visible in Repairs while loaded."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={},
        options={CONF_HUE_BRIDGES: ["removed-hue-entry"]},
    )
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    issue = ir.async_get(hass).async_get_issue(
        DOMAIN,
        ISSUE_SELECTED_BRIDGES_MISSING,
    )
    assert issue is not None
    assert issue.severity is ir.IssueSeverity.WARNING
    assert issue.translation_placeholders == {"count": "1"}

    hue_entry = MockConfigEntry(
        domain="hue",
        data={CONF_API_VERSION: 2},
        entry_id="removed-hue-entry",
    )
    hue_entry.add_to_hass(hass)
    assert await hass.config_entries.async_reload(entry.entry_id)
    assert (
        ir.async_get(hass).async_get_issue(
            DOMAIN,
            ISSUE_SELECTED_BRIDGES_MISSING,
        )
        is None
    )

    assert await hass.config_entries.async_unload(entry.entry_id)


async def test_incompatible_native_hue_creates_persistent_repair_issue(
    hass: HomeAssistant,
) -> None:
    """A refused compatibility hook is surfaced instead of remaining log-only."""
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.add_to_hass(hass)

    with patch(
        "custom_components.hue_gradient_controller.install_hue_light_attribute_hook",
        side_effect=ConfigEntryError("incompatible"),
    ):
        assert not await hass.config_entries.async_setup(entry.entry_id)

    issue = ir.async_get(hass).async_get_issue(
        DOMAIN,
        ISSUE_INCOMPATIBLE_NATIVE_HUE,
    )
    assert issue is not None
    assert issue.severity is ir.IssueSeverity.ERROR
    assert issue.is_persistent is True

    await hass.config_entries.async_remove(entry.entry_id)
    assert (
        ir.async_get(hass).async_get_issue(
            DOMAIN,
            ISSUE_INCOMPATIBLE_NATIVE_HUE,
        )
        is None
    )
