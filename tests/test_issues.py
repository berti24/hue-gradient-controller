"""Tests for Home Assistant Repairs issue lifecycle."""

from unittest.mock import patch

import pytest
from homeassistant.config_entries import (
    SOURCE_IGNORE,
    ConfigEntryDisabler,
    ConfigEntryState,
)
from homeassistant.const import CONF_API_VERSION
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryError
from homeassistant.helpers import issue_registry as ir
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.hue_gradient_controller.const import (
    CONF_HUE_BRIDGES,
    DOMAIN,
    SELECT_ALL_HUE_BRIDGES,
)
from custom_components.hue_gradient_controller.issues import (
    ISSUE_INCOMPATIBLE_NATIVE_HUE,
    ISSUE_SELECTED_BRIDGES_MISSING,
)


@pytest.mark.parametrize("change", ["removed", "disabled", "api_v1", "ignored"])
@pytest.mark.parametrize("all_bridges", [False, True])
async def test_bridge_changes_update_repairs_without_controller_reload(
    hass: HomeAssistant,
    change: str,
    all_bridges: bool,
) -> None:
    """Repairs follows bridge eligibility and stops listening after unload."""
    hue_entry = MockConfigEntry(domain="hue", data={CONF_API_VERSION: 2})
    hue_entry.add_to_hass(hass)
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={},
        options={
            CONF_HUE_BRIDGES: [
                SELECT_ALL_HUE_BRIDGES if all_bridges else hue_entry.entry_id
            ]
        },
    )
    entry.add_to_hass(hass)
    registry = ir.async_get(hass)

    # Exercise config-entry lifecycle events without connecting to a Hue bridge.
    with (
        patch("homeassistant.components.hue.async_setup_entry", return_value=True),
        patch("homeassistant.components.hue.async_unload_entry", return_value=True),
    ):
        assert await hass.config_entries.async_setup(hue_entry.entry_id)
        assert await hass.config_entries.async_setup(entry.entry_id)
        assert registry.async_get_issue(DOMAIN, ISSUE_SELECTED_BRIDGES_MISSING) is None

        if change in ("removed", "ignored"):
            await hass.config_entries.async_remove(hue_entry.entry_id)
            if change == "ignored":
                hue_entry = MockConfigEntry(
                    domain="hue",
                    data={CONF_API_VERSION: 2},
                    entry_id=hue_entry.entry_id,
                    source=SOURCE_IGNORE,
                )
                await hass.config_entries.async_add(hue_entry)
        elif change == "disabled":
            assert await hass.config_entries.async_set_disabled_by(
                hue_entry.entry_id, ConfigEntryDisabler.USER
            )
        else:
            hass.config_entries.async_update_entry(
                hue_entry, data={CONF_API_VERSION: 1}
            )
        await hass.async_block_till_done()

        issue = registry.async_get_issue(DOMAIN, ISSUE_SELECTED_BRIDGES_MISSING)
        if all_bridges:
            assert issue is None
        else:
            assert issue is not None
            assert issue.translation_placeholders == {"count": "1"}
        assert entry.state is ConfigEntryState.LOADED

        if change in ("removed", "ignored"):
            if change == "ignored":
                await hass.config_entries.async_remove(hue_entry.entry_id)
            hue_entry = MockConfigEntry(
                domain="hue",
                data={CONF_API_VERSION: 2},
                entry_id=hue_entry.entry_id,
            )
            await hass.config_entries.async_add(hue_entry)
        elif change == "disabled":
            assert await hass.config_entries.async_set_disabled_by(
                hue_entry.entry_id, None
            )
        else:
            hass.config_entries.async_update_entry(
                hue_entry, data={CONF_API_VERSION: 2}
            )
        await hass.async_block_till_done()
        assert registry.async_get_issue(DOMAIN, ISSUE_SELECTED_BRIDGES_MISSING) is None

        assert await hass.config_entries.async_unload(entry.entry_id)
        await hass.config_entries.async_remove(hue_entry.entry_id)
        await hass.async_block_till_done()
        assert registry.async_get_issue(DOMAIN, ISSUE_SELECTED_BRIDGES_MISSING) is None


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
