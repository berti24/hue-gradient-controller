"""Home Assistant Repairs issues for integration compatibility and selection."""

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_API_VERSION
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import issue_registry as ir

from .const import (
    CONF_HUE_BRIDGES,
    DOMAIN,
    HUE_API_V2,
    SELECT_ALL_HUE_BRIDGES,
)

ISSUE_INCOMPATIBLE_NATIVE_HUE = "incompatible_native_hue"
ISSUE_SELECTED_BRIDGES_MISSING = "selected_bridges_missing"
_DOCUMENTATION_URL = "https://github.com/berti24/hue-gradient-controller"


@callback
def async_create_incompatible_native_hue_issue(hass: HomeAssistant) -> None:
    """Report that the guarded native Hue compatibility hook cannot be installed."""
    ir.async_create_issue(
        hass,
        DOMAIN,
        ISSUE_INCOMPATIBLE_NATIVE_HUE,
        is_fixable=False,
        is_persistent=True,
        learn_more_url=_DOCUMENTATION_URL,
        severity=ir.IssueSeverity.ERROR,
        translation_key=ISSUE_INCOMPATIBLE_NATIVE_HUE,
    )


@callback
def async_update_bridge_selection_issue(
    hass: HomeAssistant,
    selection: frozenset[str],
) -> None:
    """Create or clear an issue for selected Hue bridges that are unavailable."""
    available_bridge_ids = {
        entry.entry_id
        for entry in hass.config_entries.async_entries(
            "hue",
            include_ignore=False,
            include_disabled=False,
        )
        if entry.data.get(CONF_API_VERSION) == HUE_API_V2
    }
    missing_count = len(selection - available_bridge_ids)
    if SELECT_ALL_HUE_BRIDGES in selection or missing_count == 0:
        ir.async_delete_issue(hass, DOMAIN, ISSUE_SELECTED_BRIDGES_MISSING)
        return

    ir.async_create_issue(
        hass,
        DOMAIN,
        ISSUE_SELECTED_BRIDGES_MISSING,
        is_fixable=False,
        is_persistent=True,
        learn_more_url=_DOCUMENTATION_URL,
        severity=ir.IssueSeverity.WARNING,
        translation_key=ISSUE_SELECTED_BRIDGES_MISSING,
        translation_placeholders={"count": str(missing_count)},
    )


@callback
def async_clear_setup_issues(hass: HomeAssistant) -> None:
    """Clear issues that no longer apply after successful setup or unload."""
    ir.async_delete_issue(hass, DOMAIN, ISSUE_INCOMPATIBLE_NATIVE_HUE)


@callback
def async_clear_all_issues(hass: HomeAssistant) -> None:
    """Clear integration-owned issues when the integration unloads."""
    async_clear_setup_issues(hass)
    ir.async_delete_issue(hass, DOMAIN, ISSUE_SELECTED_BRIDGES_MISSING)


def selected_bridge_ids_from_entry(entry: ConfigEntry) -> frozenset[str]:
    """Return the normalized active bridge selection for a config entry."""
    return frozenset(
        entry.options.get(CONF_HUE_BRIDGES, [SELECT_ALL_HUE_BRIDGES])
    )
