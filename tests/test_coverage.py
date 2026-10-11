"""Tests for live native Hue light coverage summaries."""

import logging
from types import SimpleNamespace

from homeassistant.components.hue.v2.light import HueLight
from homeassistant.components.light import DOMAIN as LIGHT_DOMAIN
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entity_component import EntityComponent

from custom_components.hue_gradient_controller.const import (
    SELECT_ALL_HUE_BRIDGES,
)
from custom_components.hue_gradient_controller.coverage import (
    format_gradient_light_coverage,
    gradient_light_coverage,
)


def _hue_light(
    hass: HomeAssistant,
    entity_id: str,
    *,
    bridge: tuple[str, str],
    light_name: str | None,
    gradient: object | None,
) -> HueLight:
    """Create an existing native Hue light for coverage tests."""
    entity = object.__new__(HueLight)
    entity.hass = hass
    entity.entity_id = entity_id
    entity.resource = SimpleNamespace(gradient=gradient)
    entity.bridge = SimpleNamespace(
        config_entry=SimpleNamespace(
            entry_id=bridge[0],
            title=bridge[1],
        )
    )
    entity.device = (
        SimpleNamespace(metadata=SimpleNamespace(name=light_name))
        if light_name is not None
        else None
    )
    return entity


def _register_lights(
    hass: HomeAssistant,
    *entities: HueLight,
) -> EntityComponent:
    """Register existing native Hue lights without creating registry entries."""
    component = EntityComponent(logging.getLogger(__name__), LIGHT_DOMAIN, hass)
    for entity in entities:
        component._entities[entity.entity_id] = entity
    return component


async def test_coverage_filters_groups_and_sorts_native_lights(
    hass: HomeAssistant,
) -> None:
    """Only selected gradient lights appear in deterministic bridge groups."""
    selected = _hue_light(
        hass,
        "light.zeta",
        bridge=("bridge-upstairs", "Upstairs Hue"),
        light_name="Zeta",
        gradient=object(),
    )
    selected_first = _hue_light(
        hass,
        "light.alpha",
        bridge=("bridge-upstairs", "Upstairs Hue"),
        light_name="Alpha",
        gradient=object(),
    )
    other_bridge = _hue_light(
        hass,
        "light.beta",
        bridge=("bridge-downstairs", "Downstairs Hue"),
        light_name="Beta",
        gradient=object(),
    )
    no_gradient = _hue_light(
        hass,
        "light.no_gradient",
        bridge=("bridge-upstairs", "Upstairs Hue"),
        light_name="No gradient",
        gradient=None,
    )
    component = _register_lights(
        hass,
        selected,
        selected_first,
        other_bridge,
        no_gradient,
    )

    groups = gradient_light_coverage(hass, {"bridge-upstairs"})

    assert len(groups) == 1
    assert groups[0].bridge_entry_id == "bridge-upstairs"
    assert groups[0].bridge_name == "Upstairs Hue"
    assert [(light.name, light.entity_id) for light in groups[0].lights] == [
        ("Alpha", "light.alpha"),
        ("Zeta", "light.zeta"),
    ]
    assert set(component._entities) == {
        "light.zeta",
        "light.alpha",
        "light.beta",
        "light.no_gradient",
    }

    all_groups = gradient_light_coverage(hass, [SELECT_ALL_HUE_BRIDGES])
    assert [group.bridge_name for group in all_groups] == [
        "Downstairs Hue",
        "Upstairs Hue",
    ]


async def test_coverage_falls_back_to_entity_id_and_does_not_mutate_registries(
    hass: HomeAssistant,
) -> None:
    """Missing light metadata uses the entity ID without registry side effects."""
    entity = _hue_light(
        hass,
        "light.unnamed",
        bridge=("bridge", "Bridge"),
        light_name=None,
        gradient=object(),
    )
    component = _register_lights(hass, entity)
    entity_registry = er.async_get(hass)
    device_registry = dr.async_get(hass)
    before_entities = set(entity_registry.entities)
    before_devices = set(device_registry.devices)

    formatted = format_gradient_light_coverage(
        gradient_light_coverage(hass, {"bridge"})
    )

    assert "light.unnamed (light.unnamed)" in formatted
    assert set(component._entities) == {"light.unnamed"}
    assert set(entity_registry.entities) == before_entities
    assert set(device_registry.devices) == before_devices


async def test_coverage_reports_empty_selection_result(
    hass: HomeAssistant,
) -> None:
    """An empty live Hue inventory remains a valid configuration result."""
    assert format_gradient_light_coverage(
        gradient_light_coverage(hass, {"bridge"})
    ) == "No matching gradient lights are currently detected."
