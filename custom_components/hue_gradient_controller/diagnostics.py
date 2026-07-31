"""Redacted diagnostics for Philips Hue Gradient Controller."""

from typing import Any

from homeassistant.components.diagnostics import REDACTED
from homeassistant.components.hue.v2.light import HueLight
from homeassistant.components.light import DOMAIN as LIGHT_DOMAIN
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_API_VERSION
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_component import DATA_INSTANCES

from .const import HUE_API_V2, SELECT_ALL_HUE_BRIDGES
from .issues import selected_bridge_ids_from_entry


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant,
    entry: ConfigEntry,
) -> dict[str, Any]:
    """Return capability-focused diagnostics without names, IDs, or credentials."""
    selection = selected_bridge_ids_from_entry(entry)
    all_selected = SELECT_ALL_HUE_BRIDGES in selection
    hue_entries = [
        hue_entry
        for hue_entry in hass.config_entries.async_entries(
            "hue",
            include_ignore=False,
            include_disabled=False,
        )
        if hue_entry.data.get(CONF_API_VERSION) == HUE_API_V2
    ]
    available_bridge_ids = {hue_entry.entry_id for hue_entry in hue_entries}

    component = hass.data.get(DATA_INSTANCES, {}).get(LIGHT_DOMAIN)
    native_hue_lights = sorted(
        (
            entity
            for entity in (component.entities if component is not None else ())
            if isinstance(entity, HueLight)
        ),
        key=lambda entity: entity.entity_id,
    )
    referenced_bridge_ids = {
        entity.bridge.config_entry.entry_id for entity in native_hue_lights
    }
    explicitly_selected_ids = set() if all_selected else set(selection)
    bridge_ids = sorted(
        available_bridge_ids | referenced_bridge_ids | explicitly_selected_ids
    )
    bridge_aliases = {
        bridge_entry_id: f"bridge_{index}"
        for index, bridge_entry_id in enumerate(bridge_ids, start=1)
    }

    bridges = [
        {
            "diagnostic_id": bridge_aliases[bridge_entry_id],
            "title": REDACTED,
            "selected": all_selected or bridge_entry_id in selection,
            "available": bridge_entry_id in available_bridge_ids,
        }
        for bridge_entry_id in bridge_ids
    ]
    lights: list[dict[str, Any]] = []
    for index, entity in enumerate(native_hue_lights, start=1):
        bridge_entry_id = entity.bridge.config_entry.entry_id
        gradient = entity.resource.gradient
        lights.append(
            {
                "diagnostic_id": f"light_{index}",
                "entity_id": REDACTED,
                "bridge": bridge_aliases[bridge_entry_id],
                "selected": all_selected or bridge_entry_id in selection,
                "available": entity.available,
                "gradient_capable": gradient is not None,
                "gradient_modes": (
                    [mode.value for mode in gradient.mode_values]
                    if gradient is not None
                    else []
                ),
                "gradient_points_capable": (
                    gradient.points_capable if gradient is not None else None
                ),
                "gradient_pixel_count": (
                    gradient.pixel_count if gradient is not None else None
                ),
            }
        )

    missing_selected_count = (
        0 if all_selected else len(selection - available_bridge_ids)
    )
    return {
        "selection": {
            "all_hue_bridges": all_selected,
            "available_bridge_count": len(available_bridge_ids),
            "selected_bridge_count": (
                len(available_bridge_ids) if all_selected else len(selection)
            ),
            "missing_selected_bridge_count": missing_selected_count,
        },
        "bridges": bridges,
        "native_hue_lights": lights,
    }
