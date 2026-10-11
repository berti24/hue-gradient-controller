"""Live summaries of native Hue lights covered by the integration."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Collection
from dataclasses import dataclass

from homeassistant.components.hue.v2.light import HueLight
from homeassistant.components.light import DOMAIN as LIGHT_DOMAIN
from homeassistant.const import ATTR_FRIENDLY_NAME
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_component import DATA_INSTANCES

from .const import SELECT_ALL_HUE_BRIDGES


@dataclass(frozen=True, slots=True)
class GradientLightCoverage:
    """A native Hue light that receives gradient attributes."""

    name: str
    entity_id: str


@dataclass(frozen=True, slots=True)
class GradientLightCoverageGroup:
    """Covered native Hue lights grouped by their bridge."""

    bridge_entry_id: str
    bridge_name: str
    lights: tuple[GradientLightCoverage, ...]


def _native_hue_lights(hass: HomeAssistant) -> Collection[HueLight]:
    """Return currently registered native Hue light entities."""
    component = hass.data.get(DATA_INSTANCES, {}).get(LIGHT_DOMAIN)
    if component is None:
        return ()
    return tuple(
        entity
        for entity in component.entities
        if isinstance(entity, HueLight)
    )


def _light_display_name(hass: HomeAssistant, entity: HueLight) -> str:
    """Return the most useful current display name for a native Hue light."""
    entity_id = entity.entity_id
    if state := hass.states.get(entity_id):
        friendly_name = state.attributes.get(ATTR_FRIENDLY_NAME)
        if isinstance(friendly_name, str) and friendly_name:
            return friendly_name

    device = getattr(entity, "device", None)
    metadata = getattr(device, "metadata", None)
    device_name = getattr(metadata, "name", None)
    if isinstance(device_name, str) and device_name:
        return device_name

    entity_name = getattr(entity, "_attr_name", None)
    if isinstance(entity_name, str) and entity_name:
        return entity_name

    return entity_id


def gradient_light_coverage(
    hass: HomeAssistant,
    bridge_selection: Collection[str],
) -> tuple[GradientLightCoverageGroup, ...]:
    """Return selected native Hue lights with a current gradient feature.

    This only inspects entities already registered by Home Assistant's native
    Hue integration. It does not create entities, devices, registry links, or
    network connections.
    """
    selected_bridges = frozenset(bridge_selection)
    grouped: dict[tuple[str, str], list[GradientLightCoverage]] = defaultdict(list)

    for entity in _native_hue_lights(hass):
        bridge = getattr(entity, "bridge", None)
        config_entry = getattr(bridge, "config_entry", None)
        bridge_entry_id = getattr(config_entry, "entry_id", None)
        if not isinstance(bridge_entry_id, str):
            continue
        if (
            SELECT_ALL_HUE_BRIDGES not in selected_bridges
            and bridge_entry_id not in selected_bridges
        ):
            continue

        resource = getattr(entity, "resource", None)
        if resource is None or getattr(resource, "gradient", None) is None:
            continue

        entity_id = getattr(entity, "entity_id", None)
        if not isinstance(entity_id, str) or not entity_id:
            continue

        bridge_name = getattr(config_entry, "title", None)
        if not isinstance(bridge_name, str) or not bridge_name:
            bridge_name = bridge_entry_id

        grouped[(bridge_entry_id, bridge_name)].append(
            GradientLightCoverage(
                name=_light_display_name(hass, entity),
                entity_id=entity_id,
            )
        )

    groups: list[GradientLightCoverageGroup] = []
    for (bridge_entry_id, bridge_name), lights in sorted(
        grouped.items(),
        key=lambda item: (item[0][1].casefold(), item[0][0]),
    ):
        groups.append(
            GradientLightCoverageGroup(
                bridge_entry_id=bridge_entry_id,
                bridge_name=bridge_name,
                lights=tuple(
                    sorted(
                        lights,
                        key=lambda light: (light.name.casefold(), light.entity_id),
                    )
                ),
            )
        )

    return tuple(groups)


def format_gradient_light_coverage(
    groups: tuple[GradientLightCoverageGroup, ...],
) -> str:
    """Format grouped coverage for a config-flow description placeholder."""
    count = sum(len(group.lights) for group in groups)
    if not count:
        return "No matching gradient lights are currently detected."

    light_label = "light" if count == 1 else "lights"
    lines = [f"{count} {light_label} currently receive gradient attributes."]
    for group in groups:
        lines.append(f"{group.bridge_name}:")
        lines.extend(
            f"- {light.name} ({light.entity_id})" for light in group.lights
        )
    return "\n".join(lines)
