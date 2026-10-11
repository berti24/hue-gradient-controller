"""Hue bridge selection helpers."""

from __future__ import annotations

from typing import TYPE_CHECKING

from homeassistant.core import HomeAssistant

from .const import DOMAIN, SELECT_ALL_HUE_BRIDGES

if TYPE_CHECKING:
    from homeassistant.components.hue.v2.light import HueLight


def selected_bridge_ids(hass: HomeAssistant) -> frozenset[str] | None:
    """Return the active bridge selection, or None when the integration is unloaded."""
    selection = hass.data.get(DOMAIN)
    return selection if isinstance(selection, frozenset) else None


def hue_light_is_selected(hass: HomeAssistant, entity: HueLight) -> bool:
    """Return whether a native Hue light belongs to an enabled bridge."""
    selection = selected_bridge_ids(hass)
    if selection is None:
        return False

    bridge_entry_id = entity.bridge.config_entry.entry_id
    return (
        SELECT_ALL_HUE_BRIDGES in selection or bridge_entry_id in selection
    )
