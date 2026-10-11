"""Tests for gradient attributes on native Hue light entities."""

import logging
from types import SimpleNamespace
from unittest.mock import Mock

from aiohue.v2.controllers.events import EventType
from aiohue.v2.controllers.lights import LightsController
from aiohue.v2.models.feature import (
    ColorFeature,
    ColorFeatureBase,
    ColorGamut,
    ColorPoint,
    DimmingFeature,
    DynamicsFeature,
    DynamicStatus,
    GamutType,
    GradientFeature,
    GradientMode,
    GradientPoint,
    OnFeature,
)
from aiohue.v2.models.light import Light, LightMode
from aiohue.v2.models.resource import ResourceIdentifier, ResourceTypes
from homeassistant.components.hue.v2.light import HueLight
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.util import color as color_util
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.hue_gradient_controller.const import (
    CONF_HUE_BRIDGES,
    DOMAIN,
    SERVICE_RESTORE_GRADIENT,
    SERVICE_SET_GRADIENT,
    SERVICE_SNAPSHOT_GRADIENT,
)

HUE_BRIDGE_ENTRY_ID = "hue-bridge-entry"


class _FakeAiohueBridge:
    """Provide the controller dependencies needed for event processing."""

    logger = logging.getLogger(__name__)
    devices: tuple[()] = ()


def _resource_with_gradient() -> Light:
    """Create the Hue resource data used by an existing native entity."""
    gamut = ColorGamut(
        red=ColorPoint(0.6915, 0.3083),
        green=ColorPoint(0.17, 0.7),
        blue=ColorPoint(0.1532, 0.0475),
    )
    points = [
        GradientPoint(color=ColorFeatureBase(xy=ColorPoint(0.6915, 0.3083))),
        GradientPoint(color=ColorFeatureBase(xy=ColorPoint(0.17, 0.7))),
    ]
    return Light(
        id="resource-gradient",
        owner=ResourceIdentifier(
            rid="device-gradient",
            rtype=ResourceTypes.DEVICE,
        ),
        on=OnFeature(on=True),
        mode=LightMode.NORMAL,
        color=ColorFeature(
            xy=ColorPoint(0.6915, 0.3083),
            gamut_type=GamutType.C,
            gamut=gamut,
        ),
        dimming=DimmingFeature(brightness=50),
        dynamics=DynamicsFeature(
            speed=0,
            speed_valid=False,
            status=DynamicStatus.NONE,
        ),
        gradient=GradientFeature(
            points=points,
            points_capable=5,
            mode=GradientMode.INTERPOLATED_PALETTE_MIRRORED,
            mode_values=[
                GradientMode.INTERPOLATED_PALETTE,
                GradientMode.INTERPOLATED_PALETTE_MIRRORED,
            ],
            pixel_count=7,
        ),
    )


def _ha_gamut(resource: Light) -> color_util.GamutType:
    """Convert the resource's Hue gamut into Home Assistant's gamut type."""
    gamut = resource.color.gamut
    return color_util.GamutType(
        red=color_util.XYPoint(gamut.red.x, gamut.red.y),
        green=color_util.XYPoint(gamut.green.x, gamut.green.y),
        blue=color_util.XYPoint(gamut.blue.x, gamut.blue.y),
    )


def _hue_light(
    hass: HomeAssistant,
    resource: Light,
    bridge_entry_id: str = HUE_BRIDGE_ENTRY_ID,
) -> HueLight:
    """Create a native Hue entity attached to a specific Hue config entry."""
    hue_light = object.__new__(HueLight)
    hue_light.hass = hass
    hue_light.resource = resource
    hue_light.bridge = SimpleNamespace(
        config_entry=SimpleNamespace(entry_id=bridge_entry_id)
    )
    return hue_light


async def test_setup_extends_native_hue_light_attributes(
    hass: HomeAssistant,
) -> None:
    """Gradient metadata is exposed on the existing Hue light entity."""
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)
    assert entry.state is ConfigEntryState.LOADED

    resource = _resource_with_gradient()
    hue_light = _hue_light(hass, resource)

    attributes = hue_light.extra_state_attributes
    gamut = _ha_gamut(resource)
    expected_rgb = [
        list(color_util.color_xy_to_RGB(point.color.xy.x, point.color.xy.y, gamut))
        for point in resource.gradient.points
    ]

    assert attributes == {
        "mode": "normal",
        "dynamics": "none",
        "gradient_capable": True,
        "gradient_colors": [
            f"#{color_util.color_rgb_to_hex(*rgb).upper()}" for rgb in expected_rgb
        ],
        "gradient_colors_rgb": expected_rgb,
        "gradient_colors_xy": [[0.6915, 0.3083], [0.17, 0.7]],
        "gradient_mode": "interpolated_palette_mirrored",
        "gradient_modes": [
            "interpolated_palette",
            "interpolated_palette_mirrored",
        ],
        "gradient_points_capable": 5,
        "gradient_pixel_count": 7,
    }


async def test_attributes_are_limited_to_selected_hue_bridges(
    hass: HomeAssistant,
) -> None:
    """Only lights owned by selected Hue config entries gain gradient attributes."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={},
        options={CONF_HUE_BRIDGES: ["selected-hue-bridge"]},
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)

    selected = _hue_light(hass, _resource_with_gradient(), "selected-hue-bridge")
    unselected = _hue_light(hass, _resource_with_gradient(), "other-hue-bridge")

    assert selected.extra_state_attributes["gradient_capable"] is True
    assert unselected.extra_state_attributes == {
        "mode": "normal",
        "dynamics": "none",
    }


async def test_external_hue_event_refreshes_live_light_and_gradient_state(
    hass: HomeAssistant,
) -> None:
    """Hue event-stream updates are reflected by the existing native entity."""
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)

    resource = _resource_with_gradient()
    controller = LightsController(_FakeAiohueBridge())
    controller._items[resource.id] = resource

    hue_light = _hue_light(hass, resource)
    hue_light.entity_id = "light.gradient"
    hue_light.controller = controller
    hue_light.device = None
    hue_light.logger = logging.getLogger(__name__)
    hue_light._ignore_availability = False
    hue_light.async_write_ha_state = Mock()
    controller.subscribe(
        hue_light._handle_event,
        resource.id,
        EventType.RESOURCE_UPDATED,
    )

    await controller._handle_event(
        EventType.RESOURCE_UPDATED,
        {
            "id": resource.id,
            "type": "light",
            "on": {"on": False},
            "dimming": {"brightness": 25},
            "color": {"xy": {"x": 0.25, "y": 0.35}},
            "gradient": {
                "points": [
                    {"color": {"xy": {"x": 0.2, "y": 0.3}}},
                    {"color": {"xy": {"x": 0.4, "y": 0.5}}},
                    {"color": {"xy": {"x": 0.6, "y": 0.3}}},
                ],
                "mode": "segmented_palette",
            },
        },
    )

    assert hue_light.resource is resource
    assert hue_light.is_on is False
    assert hue_light.brightness == 64
    assert hue_light.xy_color == (0.25, 0.35)
    assert hue_light.extra_state_attributes["gradient_colors_xy"] == [
        [0.2, 0.3],
        [0.4, 0.5],
        [0.6, 0.3],
    ]
    assert hue_light.extra_state_attributes["gradient_mode"] == "segmented_palette"
    hue_light.async_write_ha_state.assert_called_once()


async def test_unload_restores_native_hue_light_attributes(
    hass: HomeAssistant,
) -> None:
    """Unloading removes the compatibility hook without touching Hue."""
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)

    hue_light = _hue_light(hass, _resource_with_gradient())
    assert hue_light.extra_state_attributes["gradient_capable"] is True
    assert hass.services.has_service(DOMAIN, SERVICE_SET_GRADIENT)

    assert await hass.config_entries.async_unload(entry.entry_id)
    assert not hass.services.has_service(DOMAIN, SERVICE_SET_GRADIENT)
    assert not hass.services.has_service(DOMAIN, SERVICE_SNAPSHOT_GRADIENT)
    assert not hass.services.has_service(DOMAIN, SERVICE_RESTORE_GRADIENT)
    assert hue_light.extra_state_attributes == {
        "mode": "normal",
        "dynamics": "none",
    }
