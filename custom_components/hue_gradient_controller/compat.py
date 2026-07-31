"""Guarded compatibility layer for Home Assistant's native Hue light entity."""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, cast

from homeassistant.components.hue.v2.light import HueLight
from homeassistant.components.light import DOMAIN as LIGHT_DOMAIN
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import ConfigEntryError
from homeassistant.helpers.entity_component import DATA_INSTANCES
from homeassistant.util import color as color_util

from .selection import hue_light_is_selected


@dataclass
class _HookState:
    """Mutable compatibility hook lifecycle state."""

    install_count: int = 0
    original_attribute_property: property | None = None


_STATE = _HookState()


def _as_ha_gamut(resource: Any) -> color_util.GamutType | None:
    """Return a Home Assistant gamut for an aiohue light resource."""
    color = resource.color
    if color is None or color.gamut is None:
        return None

    gamut = color.gamut
    return color_util.GamutType(
        red=color_util.XYPoint(gamut.red.x, gamut.red.y),
        green=color_util.XYPoint(gamut.green.x, gamut.green.y),
        blue=color_util.XYPoint(gamut.blue.x, gamut.blue.y),
    )


def _gradient_attributes(self: HueLight) -> dict[str, Any] | None:
    """Extend the native attributes for gradient-capable Hue lights."""
    if _STATE.original_attribute_property is None:
        return None

    original_getter = cast(
        Callable[[HueLight], dict[str, Any] | None],
        _STATE.original_attribute_property.fget,
    )
    attributes = dict(original_getter(self) or {})
    if self.hass is None or not hue_light_is_selected(self.hass, self):
        return attributes

    gradient = self.resource.gradient
    if gradient is None:
        return attributes

    gamut = _as_ha_gamut(self.resource)
    xy_colors = [[point.color.xy.x, point.color.xy.y] for point in gradient.points]
    rgb_colors = [list(color_util.color_xy_to_RGB(x, y, gamut)) for x, y in xy_colors]
    attributes.update(
        {
            "gradient_capable": True,
            "gradient_colors": [
                f"#{color_util.color_rgb_to_hex(*rgb).upper()}" for rgb in rgb_colors
            ],
            "gradient_colors_rgb": rgb_colors,
            "gradient_colors_xy": xy_colors,
            "gradient_mode": gradient.mode.value,
            "gradient_modes": [mode.value for mode in gradient.mode_values],
            "gradient_points_capable": gradient.points_capable,
        }
    )
    if gradient.pixel_count is not None:
        attributes["gradient_pixel_count"] = gradient.pixel_count

    return attributes


def install_hue_light_attribute_hook() -> None:
    """Install the narrow native Hue attribute extension."""
    if _STATE.install_count:
        _STATE.install_count += 1
        return

    native_property = HueLight.__dict__.get("extra_state_attributes")
    if not isinstance(native_property, property) or native_property.fget is None:
        raise ConfigEntryError(
            "The native Hue light implementation is incompatible with "
            "Philips Hue Gradient Controller"
        )

    _STATE.original_attribute_property = native_property
    HueLight.extra_state_attributes = property(_gradient_attributes)
    _STATE.install_count = 1


def uninstall_hue_light_attribute_hook() -> None:
    """Restore Home Assistant's native Hue attribute implementation."""
    if not _STATE.install_count:
        return
    _STATE.install_count -= 1
    if _STATE.install_count:
        return

    if _STATE.original_attribute_property is not None:
        HueLight.extra_state_attributes = _STATE.original_attribute_property
    _STATE.original_attribute_property = None


@callback
def async_refresh_hue_light_states(hass: HomeAssistant) -> None:
    """Refresh existing native Hue states after installing or removing the hook."""
    component = hass.data.get(DATA_INSTANCES, {}).get(LIGHT_DOMAIN)
    if component is None:
        return

    for entity in list(component.entities):
        if isinstance(entity, HueLight) and entity.hass is hass:
            entity.async_write_ha_state()
