"""Philips Hue Gradient Controller integration."""

from __future__ import annotations

from homeassistant.config_entries import (
    SIGNAL_CONFIG_ENTRY_CHANGED,
    ConfigEntry,
    ConfigEntryChange,
)
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import ConfigEntryError
from homeassistant.helpers.dispatcher import (
    async_dispatcher_connect,
    async_dispatcher_send,
)

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
from .preset_ws import async_register_preset_commands
from .presets import DATA_PRESETS, SIGNAL_PRESETS, PresetLibrary
from .service import (
    async_register_gradient_services,
    async_unregister_gradient_services,
)

type HueGradientControllerConfigEntry = ConfigEntry[None]


async def async_setup(hass: HomeAssistant, _config: dict) -> bool:
    """Register authenticated library commands once per installation."""
    async_register_preset_commands(hass)
    return True


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

    selection = frozenset(entry.options.get(CONF_HUE_BRIDGES, [SELECT_ALL_HUE_BRIDGES]))
    hass.data[DOMAIN] = selection
    library = PresetLibrary(hass)
    await library.async_load()
    hass.data[DATA_PRESETS] = library
    async_dispatcher_send(hass, SIGNAL_PRESETS, None)
    async_clear_setup_issues(hass)
    async_update_bridge_selection_issue(hass, selection)

    @callback
    def async_hue_entry_changed(
        _change: ConfigEntryChange, hue_entry: ConfigEntry
    ) -> None:
        """Keep selection Repairs current when a selected Hue entry changes."""
        if hue_entry.domain == "hue" and hue_entry.entry_id in selection:
            async_update_bridge_selection_issue(hass, selection)

    entry.async_on_unload(
        async_dispatcher_connect(
            hass, SIGNAL_CONFIG_ENTRY_CHANGED, async_hue_entry_changed
        )
    )
    async_register_gradient_services(hass)
    async_refresh_hue_light_states(hass)
    return True


async def async_unload_entry(
    hass: HomeAssistant,
    entry: HueGradientControllerConfigEntry,
) -> bool:
    """Unload Philips Hue Gradient Controller."""
    async_unregister_gradient_services(hass)
    if library := hass.data.get(DATA_PRESETS):
        async with library.lock:
            library.ready = False
            hass.data.pop(DATA_PRESETS, None)
    async_dispatcher_send(hass, SIGNAL_PRESETS, None)
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
