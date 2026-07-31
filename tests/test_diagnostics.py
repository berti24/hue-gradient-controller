"""Tests for redacted integration diagnostics."""

import json
import logging

from homeassistant.components.diagnostics import REDACTED
from homeassistant.components.light import DOMAIN as LIGHT_DOMAIN
from homeassistant.const import CONF_API_VERSION
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_component import EntityComponent
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.hue_gradient_controller.const import (
    CONF_HUE_BRIDGES,
    DOMAIN,
)
from custom_components.hue_gradient_controller.diagnostics import (
    async_get_config_entry_diagnostics,
)
from tests.test_service import _gradient_feature, _hue_entity, _register_entity


async def test_diagnostics_report_capabilities_without_identifiers(
    hass: HomeAssistant,
) -> None:
    """Diagnostics are useful for support without exposing user-assigned names."""
    hue_entry = MockConfigEntry(
        domain="hue",
        title="Private living room bridge",
        data={CONF_API_VERSION: 2},
    )
    hue_entry.add_to_hass(hass)
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={},
        options={CONF_HUE_BRIDGES: [hue_entry.entry_id]},
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)

    component = EntityComponent(logging.getLogger(__name__), LIGHT_DOMAIN, hass)
    entity, _controller = _hue_entity(
        "light.private_floor_lamp",
        gradient=_gradient_feature(points_capable=5),
        bridge_entry_id=hue_entry.entry_id,
    )
    _register_entity(component, entity)

    diagnostics = await async_get_config_entry_diagnostics(hass, entry)

    assert diagnostics["selection"] == {
        "all_hue_bridges": False,
        "available_bridge_count": 1,
        "selected_bridge_count": 1,
        "missing_selected_bridge_count": 0,
    }
    assert diagnostics["bridges"] == [
        {
            "diagnostic_id": "bridge_1",
            "title": REDACTED,
            "selected": True,
            "available": True,
        }
    ]
    assert diagnostics["native_hue_lights"] == [
        {
            "diagnostic_id": "light_1",
            "entity_id": REDACTED,
            "bridge": "bridge_1",
            "selected": True,
            "available": True,
            "gradient_capable": True,
            "gradient_modes": [
                "interpolated_palette",
                "segmented_palette",
            ],
            "gradient_points_capable": 5,
            "gradient_pixel_count": None,
        }
    ]
    serialized = json.dumps(diagnostics)
    assert hue_entry.entry_id not in serialized
    assert "Private living room bridge" not in serialized
    assert entity.entity_id not in serialized
