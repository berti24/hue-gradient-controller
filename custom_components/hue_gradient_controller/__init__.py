"""Philips Hue Gradient Controller integration."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryError

from .compat import (
    async_refresh_hue_light_states,
    install_hue_light_attribute_hook,
    uninstall_hue_light_attribute_hook,
)
from .const import CONF_HUE_BRIDGES, DOMAIN, SELECT_ALL_HUE_BRIDGES
from .issues import (
    async_clear_all_issues,
    async_clear_setup_issues,
    async_create_incompatible_native_hue_issue,
    async_update_bridge_selection_issue,
)
from .service import (
    async_register_gradient_services,
    async_unregister_gradient_services,
)

type HueGradientControllerConfigEntry = ConfigEntry[None]


async def async_setup_entry(
    hass: HomeAssistant,
    entry: HueGradientControllerConfigEntry,
) -> bool:
    """Set up Philips Hue Gradient Controller."""
    try:
        install_hue_light_attribute_hook()
    except ConfigEntryError:
        async_create_incompatible_native_hue_issue(hass)
        raise

    selection = frozenset(
        entry.options.get(CONF_HUE_BRIDGES, [SELECT_ALL_HUE_BRIDGES])
    )
    hass.data[DOMAIN] = selection
    async_clear_setup_issues(hass)
    async_update_bridge_selection_issue(hass, selection)
    async_register_gradient_services(hass)
    async_refresh_hue_light_states(hass)
    return True


async def async_unload_entry(
    hass: HomeAssistant,
    entry: HueGradientControllerConfigEntry,
) -> bool:
    """Unload Philips Hue Gradient Controller."""
    async_unregister_gradient_services(hass)
    hass.data.pop(DOMAIN, None)
    uninstall_hue_light_attribute_hook()
    async_refresh_hue_light_states(hass)
    async_clear_all_issues(hass)
    return True


async def async_remove_entry(
    hass: HomeAssistant,
    entry: HueGradientControllerConfigEntry,
) -> None:
    """Clear persistent Repairs issues when the config entry is removed."""
    async_clear_all_issues(hass)
