"""Tests for the set_gradient action."""

import logging
from collections.abc import Awaitable, Callable
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import pytest
import voluptuous as vol
from aiohue.util import dataclass_to_dict
from aiohue.v2.models.feature import (
    ColorFeature,
    ColorFeatureBase,
    ColorGamut,
    ColorPoint,
    DimmingFeature,
    GamutType,
    GradientFeature,
    GradientMode,
    GradientPoint,
    OnFeature,
)
from homeassistant.components.hue.v2.light import HueLight
from homeassistant.components.light import DOMAIN as LIGHT_DOMAIN
from homeassistant.const import ATTR_ENTITY_ID
from homeassistant.core import Context, HomeAssistant
from homeassistant.exceptions import Unauthorized
from homeassistant.helpers import service as service_helper
from homeassistant.helpers.entity_component import EntityComponent
from homeassistant.util import color as color_util
from pytest_homeassistant_custom_component.common import MockConfigEntry, MockUser

from custom_components.hue_gradient_controller.const import (
    DOMAIN,
    SERVICE_RESTORE_GRADIENT,
    SERVICE_SET_GRADIENT,
    SERVICE_SNAPSHOT_GRADIENT,
)

HUE_BRIDGE_ENTRY_ID = "hue-bridge-entry"


class FakeHueBridge:
    """Run writes through the same request serialization seam as native Hue."""

    def __init__(self, config_entry_id: str = HUE_BRIDGE_ENTRY_ID) -> None:
        """Attach the native Hue config entry that owns this bridge."""
        self.config_entry = SimpleNamespace(entry_id=config_entry_id)

    async def async_request_call(
        self,
        task: Callable[..., Awaitable[None]],
        *args: Any,
        **kwargs: Any,
    ) -> None:
        """Execute a controller request."""
        await task(*args, **kwargs)


def _gradient_feature(
    *,
    points_capable: int = 5,
    modes: list[GradientMode] | None = None,
    points: list[tuple[float, float]] | None = None,
    mode: GradientMode = GradientMode.INTERPOLATED_PALETTE,
) -> GradientFeature:
    """Create resource-reported gradient capabilities."""
    return GradientFeature(
        points=[
            GradientPoint(color=ColorFeatureBase(xy=ColorPoint(x, y)))
            for x, y in (points or [])
        ],
        points_capable=points_capable,
        mode=mode,
        mode_values=modes
        or [
            GradientMode.INTERPOLATED_PALETTE,
            GradientMode.SEGMENTED_PALETTE,
        ],
    )


def _hue_entity(
    entity_id: str,
    *,
    gradient: GradientFeature | None = None,
    bridge_entry_id: str = HUE_BRIDGE_ENTRY_ID,
) -> tuple[HueLight, AsyncMock]:
    """Create an existing native Hue entity backed by a fake controller."""
    gamut = ColorGamut(
        red=ColorPoint(0.6915, 0.3083),
        green=ColorPoint(0.17, 0.7),
        blue=ColorPoint(0.1532, 0.0475),
    )
    resource = SimpleNamespace(
        id=f"resource-{entity_id}",
        on=OnFeature(on=True),
        dimming=DimmingFeature(brightness=42.75),
        color=ColorFeature(
            xy=ColorPoint(0.3, 0.3),
            gamut_type=GamutType.C,
            gamut=gamut,
        ),
        gradient=gradient,
    )
    controller = AsyncMock()
    entity = object.__new__(HueLight)
    entity.entity_id = entity_id
    entity.resource = resource
    entity.controller = controller
    entity.bridge = FakeHueBridge(bridge_entry_id)
    entity.device = None
    return entity, controller


@pytest.fixture
async def loaded_integration(hass: HomeAssistant) -> EntityComponent:
    """Load the integration and expose Home Assistant's light component."""
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)

    return EntityComponent(logging.getLogger(__name__), LIGHT_DOMAIN, hass)


def _register_entity(component: EntityComponent, entity: HueLight) -> None:
    """Register an already-existing entity in the light component for a service test."""
    component._entities[entity.entity_id] = entity


async def test_service_description_is_loadable(
    hass: HomeAssistant,
    loaded_integration: EntityComponent,
) -> None:
    """Home Assistant can load the action metadata used by the UI."""
    descriptions = await service_helper.async_get_all_descriptions(hass)

    description = descriptions[DOMAIN][SERVICE_SET_GRADIENT]
    assert description["name"] == "Set gradient"
    assert description["target"]["entity"][0]["domain"] == ["light"]
    assert description["fields"]["colors"]["required"] is True
    assert description["fields"]["colors"]["selector"]["object"]["multiple"]
    assert descriptions[DOMAIN][SERVICE_SNAPSHOT_GRADIENT]["name"] == (
        "Snapshot gradient"
    )
    assert descriptions[DOMAIN][SERVICE_RESTORE_GRADIENT]["name"] == (
        "Restore gradient"
    )


async def test_visual_color_rows_are_backward_compatible_with_set_gradient(
    hass: HomeAssistant,
    loaded_integration: EntityComponent,
) -> None:
    """Repeatable color-picker rows are normalized to the existing RGB contract."""
    entity, controller = _hue_entity(
        "light.gradient",
        gradient=_gradient_feature(),
    )
    _register_entity(loaded_integration, entity)

    await hass.services.async_call(
        DOMAIN,
        SERVICE_SET_GRADIENT,
        {
            ATTR_ENTITY_ID: entity.entity_id,
            "colors": [
                {"color": [255, 0, 0]},
                {"color": [0, 0, 255]},
            ],
        },
        blocking=True,
    )

    update = controller.update.await_args.args[1]
    assert len(update.gradient.points) == 2


async def test_gradient_write_uses_resource_mode_and_point_capabilities(
    hass: HomeAssistant,
    loaded_integration: EntityComponent,
) -> None:
    """Two or more colors are written as one native Hue gradient update."""
    entity, controller = _hue_entity(
        "light.gradient",
        gradient=_gradient_feature(points_capable=5),
    )
    _register_entity(loaded_integration, entity)
    context = Context()

    await hass.services.async_call(
        DOMAIN,
        SERVICE_SET_GRADIENT,
        {
            ATTR_ENTITY_ID: entity.entity_id,
            "colors": ["#FF0000", "#00FF00", "#0000FF"],
            "mode": "segmented_palette",
            "turn_on": True,
            "brightness": 128,
            "transition": 1.25,
        },
        blocking=True,
        context=context,
    )

    controller.update.assert_awaited_once()
    assert entity._context is context
    resource_id, update = controller.update.await_args.args
    gamut = color_util.GamutType(
        red=color_util.XYPoint(0.6915, 0.3083),
        green=color_util.XYPoint(0.17, 0.7),
        blue=color_util.XYPoint(0.1532, 0.0475),
    )
    expected_xy = [
        color_util.color_RGB_to_xy(*rgb, gamut)
        for rgb in [(255, 0, 0), (0, 255, 0), (0, 0, 255)]
    ]

    assert resource_id == "resource-light.gradient"
    assert [
        (point.color.xy.x, point.color.xy.y) for point in update.gradient.points
    ] == expected_xy
    assert update.gradient.mode is GradientMode.SEGMENTED_PALETTE
    assert update.on.on is True
    assert update.dimming.brightness == pytest.approx(128 / 255 * 100)
    assert update.dynamics.duration == 1200
    assert dataclass_to_dict(update)["gradient"]["mode"] == "segmented_palette"


async def test_one_color_uses_normal_hue_color_and_ignores_mode(
    hass: HomeAssistant,
    loaded_integration: EntityComponent,
) -> None:
    """A one-color call remains useful for scripts without a gradient write."""
    entity, controller = _hue_entity(
        "light.gradient",
        gradient=_gradient_feature(),
    )
    _register_entity(loaded_integration, entity)

    await hass.services.async_call(
        DOMAIN,
        SERVICE_SET_GRADIENT,
        {
            ATTR_ENTITY_ID: entity.entity_id,
            "colors": [[12, 34, 56]],
            "mode": "random_pixelated",
        },
        blocking=True,
    )

    controller.update.assert_awaited_once()
    update = controller.update.await_args.args[1]
    assert update.gradient is None
    assert update.color is not None
    assert update.on is None


async def test_snapshot_and_restore_round_trip_exact_hue_state(
    hass: HomeAssistant,
    loaded_integration: EntityComponent,
) -> None:
    """Snapshot payloads restore exact xy points without an RGB conversion."""
    exact_xy = [(0.123456, 0.234567), (0.654321, 0.123456)]
    entity, controller = _hue_entity(
        "light.gradient",
        gradient=_gradient_feature(
            points=exact_xy,
            mode=GradientMode.SEGMENTED_PALETTE,
        ),
    )
    entity.resource.on.on = False
    entity.resource.dimming.brightness = 37.125
    _register_entity(loaded_integration, entity)

    snapshot = await hass.services.async_call(
        DOMAIN,
        SERVICE_SNAPSHOT_GRADIENT,
        {ATTR_ENTITY_ID: entity.entity_id},
        blocking=True,
        return_response=True,
    )

    assert snapshot == {
        "version": 1,
        "entities": {
            entity.entity_id: {
                "colors_xy": [[0.123456, 0.234567], [0.654321, 0.123456]],
                "mode": "segmented_palette",
                "on": False,
                "brightness": 37.125,
            }
        },
        "skipped": {},
    }

    context = Context()
    await hass.services.async_call(
        DOMAIN,
        SERVICE_RESTORE_GRADIENT,
        {
            "snapshot": snapshot,
            "transition": 0.75,
        },
        blocking=True,
        context=context,
    )

    assert controller.update.await_count == 1
    assert entity._context is context
    update = controller.update.await_args.args[1]
    assert [
        (point.color.xy.x, point.color.xy.y)
        for point in update.gradient.points
    ] == exact_xy
    assert update.gradient.mode is GradientMode.SEGMENTED_PALETTE
    assert update.on.on is False
    assert update.dimming.brightness == 37.125
    assert update.dynamics.duration == 800


async def test_snapshot_restore_validation_finishes_before_writes(
    hass: HomeAssistant,
    loaded_integration: EntityComponent,
) -> None:
    """Malformed exact state is rejected before any partial restoration."""
    entity, controller = _hue_entity(
        "light.gradient",
        gradient=_gradient_feature(),
    )
    _register_entity(loaded_integration, entity)

    with pytest.raises(vol.Invalid, match="finite values from -1 to 1"):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_RESTORE_GRADIENT,
            {
                "snapshot": {
                    "version": 1,
                    "entities": {
                        entity.entity_id: {
                            "colors_xy": [[0.1, 0.2], [1.5, 0.4]],
                            "mode": "interpolated_palette",
                            "on": True,
                            "brightness": 50,
                        }
                    },
                }
            },
            blocking=True,
        )

    controller.update.assert_not_awaited()


async def test_snapshot_reports_ineligible_targets_without_stale_state(
    hass: HomeAssistant,
    loaded_integration: EntityComponent,
) -> None:
    """The read action explains targets whose exact live state cannot be captured."""
    entity, controller = _hue_entity(
        "light.no_gradient",
        gradient=None,
    )
    _register_entity(loaded_integration, entity)

    snapshot = await hass.services.async_call(
        DOMAIN,
        SERVICE_SNAPSHOT_GRADIENT,
        {ATTR_ENTITY_ID: entity.entity_id},
        blocking=True,
        return_response=True,
    )

    assert snapshot == {
        "version": 1,
        "entities": {},
        "skipped": {entity.entity_id: "not_gradient_capable"},
    }

    await hass.services.async_call(
        DOMAIN,
        SERVICE_RESTORE_GRADIENT,
        {"snapshot": snapshot},
        blocking=True,
    )
    controller.update.assert_not_awaited()


async def test_multi_target_skips_unsupported_light_and_continues(
    hass: HomeAssistant,
    loaded_integration: EntityComponent,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A bad target does not prevent a compatible target from being updated."""
    unsupported, unsupported_controller = _hue_entity(
        "light.unsupported",
        gradient=_gradient_feature(
            modes=[GradientMode.INTERPOLATED_PALETTE],
        ),
    )
    supported, supported_controller = _hue_entity(
        "light.supported",
        gradient=_gradient_feature(),
    )
    _register_entity(loaded_integration, unsupported)
    _register_entity(loaded_integration, supported)

    with caplog.at_level(logging.WARNING):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_SET_GRADIENT,
            {
                ATTR_ENTITY_ID: [unsupported.entity_id, supported.entity_id],
                "colors": ["#FF0000", "#0000FF"],
                "mode": "segmented_palette",
            },
            blocking=True,
        )

    unsupported_controller.update.assert_not_awaited()
    supported_controller.update.assert_awaited_once()
    assert "light.unsupported" in caplog.text
    assert "does not support mode segmented_palette" in caplog.text


async def test_service_only_writes_to_selected_hue_bridges(
    hass: HomeAssistant,
    loaded_integration: EntityComponent,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A target on an unselected Hue bridge is skipped."""
    selected, selected_controller = _hue_entity(
        "light.selected",
        gradient=_gradient_feature(),
        bridge_entry_id="selected-hue-bridge",
    )
    unselected, unselected_controller = _hue_entity(
        "light.unselected",
        gradient=_gradient_feature(),
        bridge_entry_id="other-hue-bridge",
    )
    _register_entity(loaded_integration, selected)
    _register_entity(loaded_integration, unselected)
    hass.data[DOMAIN] = frozenset({"selected-hue-bridge"})

    with caplog.at_level(logging.WARNING):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_SET_GRADIENT,
            {
                ATTR_ENTITY_ID: [selected.entity_id, unselected.entity_id],
                "colors": ["#FF0000", "#0000FF"],
            },
            blocking=True,
        )

    selected_controller.update.assert_awaited_once()
    unselected_controller.update.assert_not_awaited()
    assert "light.unselected: its Hue bridge is not selected" in caplog.text


async def test_mixed_color_representations_are_rejected_before_writes(
    hass: HomeAssistant,
    loaded_integration: EntityComponent,
) -> None:
    """A malformed call fails validation before any target can be changed."""
    entity, controller = _hue_entity(
        "light.gradient",
        gradient=_gradient_feature(),
    )
    _register_entity(loaded_integration, entity)

    with pytest.raises(vol.Invalid, match="cannot mix"):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_SET_GRADIENT,
            {
                ATTR_ENTITY_ID: entity.entity_id,
                "colors": ["#FF0000", [0, 0, 255]],
            },
            blocking=True,
        )

    controller.update.assert_not_awaited()


async def test_authorization_failure_happens_before_any_write(
    hass: HomeAssistant,
    loaded_integration: EntityComponent,
) -> None:
    """All permissions are checked before best-effort processing starts."""
    first, first_controller = _hue_entity(
        "light.first",
        gradient=_gradient_feature(),
    )
    denied, denied_controller = _hue_entity(
        "light.denied",
        gradient=_gradient_feature(),
    )
    _register_entity(loaded_integration, first)
    _register_entity(loaded_integration, denied)
    user = MockUser()
    user.mock_policy({})
    user.add_to_hass(hass)

    with pytest.raises(Unauthorized):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_SET_GRADIENT,
            {
                ATTR_ENTITY_ID: [first.entity_id, denied.entity_id],
                "colors": ["#FF0000", "#0000FF"],
            },
            blocking=True,
            context=Context(user_id=user.id),
        )

    first_controller.update.assert_not_awaited()
    denied_controller.update.assert_not_awaited()


async def test_too_many_colors_are_not_clamped(
    hass: HomeAssistant,
    loaded_integration: EntityComponent,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Per-resource point limits are enforced without silently changing input."""
    entity, controller = _hue_entity(
        "light.short_gradient",
        gradient=_gradient_feature(points_capable=2),
    )
    _register_entity(loaded_integration, entity)

    with caplog.at_level(logging.WARNING):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_SET_GRADIENT,
            {
                ATTR_ENTITY_ID: entity.entity_id,
                "colors": ["#FF0000", "#00FF00", "#0000FF"],
            },
            blocking=True,
        )

    controller.update.assert_not_awaited()
    assert "3 colors exceed its 2 gradient points" in caplog.text
