"""Action support for native Philips Hue gradient lights."""

import logging
import math
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

import voluptuous as vol
from aiohue.v2.models.feature import (
    ColorFeatureBase,
    ColorFeaturePut,
    ColorPoint,
    DimmingFeaturePut,
    DynamicsFeaturePut,
    GradientMode,
    GradientPoint,
    OnFeature,
)
from aiohue.v2.models.light import LightPut
from homeassistant.auth.permissions.const import POLICY_CONTROL, POLICY_READ
from homeassistant.components.hue.v2.helpers import (
    normalize_hue_brightness,
    normalize_hue_transition,
)
from homeassistant.components.hue.v2.light import HueLight
from homeassistant.components.light import (
    ATTR_BRIGHTNESS,
    ATTR_TRANSITION,
)
from homeassistant.components.light import (
    DOMAIN as LIGHT_DOMAIN,
)
from homeassistant.const import ATTR_ENTITY_ID, ENTITY_MATCH_ALL
from homeassistant.core import (
    HomeAssistant,
    ServiceCall,
    ServiceResponse,
    SupportsResponse,
    callback,
)
from homeassistant.exceptions import ServiceValidationError, Unauthorized, UnknownUser
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import target as target_helpers
from homeassistant.helpers.entity_component import DATA_INSTANCES
from homeassistant.util import color as color_util

from .const import (
    ATTR_COLORS,
    ATTR_MODE,
    ATTR_SNAPSHOT,
    ATTR_TURN_ON,
    DEFAULT_GRADIENT_MODE,
    DOMAIN,
    GRADIENT_SNAPSHOT_VERSION,
    SERVICE_RESTORE_GRADIENT,
    SERVICE_SET_GRADIENT,
    SERVICE_SNAPSHOT_GRADIENT,
)
from .selection import hue_light_is_selected

_LOGGER = logging.getLogger(__name__)
_HEX_COLOR = re.compile(r"^#[0-9A-Fa-f]{6}$")
_HUE_BRIGHTNESS_MAX = 100
_MIN_GRADIENT_POINTS = 2
_RGB_CHANNEL_COUNT = 3
_RGB_CHANNEL_MAX = 255
_XY_CHANNEL_COUNT = 2

type RGBColor = tuple[int, int, int]
type XYColor = tuple[float, float]


@dataclass
class GradientFeaturePut:
    """Writable Hue gradient fields missing from aiohue's base model."""

    points: list[GradientPoint]
    mode: GradientMode


@dataclass(frozen=True)
class GradientEntitySnapshot:
    """Validated, exact Hue state for one gradient light."""

    colors_xy: list[XYColor]
    mode: GradientMode
    is_on: bool
    brightness: float | None


def _validate_colors(value: Any) -> list[RGBColor]:
    """Validate one consistent, non-empty color representation."""
    if not isinstance(value, list) or not value:
        raise vol.Invalid("colors must be a non-empty list")

    if all(isinstance(color, dict) and set(color) == {"color"} for color in value):
        value = [color["color"] for color in value]

    if all(isinstance(color, str) for color in value):
        if not all(_HEX_COLOR.fullmatch(color) for color in value):
            raise vol.Invalid("hex colors must use the #RRGGBB format")
        return [
            tuple(color_util.rgb_hex_to_rgb_list(color[1:]))  # type: ignore[misc]
            for color in value
        ]

    if all(isinstance(color, list | tuple) for color in value):
        colors: list[RGBColor] = []
        for color in value:
            if (
                len(color) != _RGB_CHANNEL_COUNT
                or any(not isinstance(channel, int) for channel in color)
                or any(isinstance(channel, bool) for channel in color)
                or any(channel < 0 or channel > _RGB_CHANNEL_MAX for channel in color)
            ):
                raise vol.Invalid(
                    "RGB colors must contain three integers from 0 to 255"
                )
            colors.append((color[0], color[1], color[2]))
        return colors

    raise vol.Invalid("colors cannot mix hex strings and RGB triples")


def _validate_xy_color(value: Any) -> XYColor:
    """Validate one exact Hue CIE xy point without converting or clamping it."""
    if (
        not isinstance(value, list | tuple)
        or len(value) != _XY_CHANNEL_COUNT
        or any(not isinstance(channel, int | float) for channel in value)
        or any(isinstance(channel, bool) for channel in value)
    ):
        raise vol.Invalid("snapshot xy colors must contain two numbers")
    x, y = float(value[0]), float(value[1])
    if (
        not math.isfinite(x)
        or not math.isfinite(y)
        or not -1 <= x <= 1
        or not -1 <= y <= 1
    ):
        raise vol.Invalid("snapshot xy colors must be finite values from -1 to 1")
    return x, y


def _validate_snapshot(value: Any) -> dict[str, GradientEntitySnapshot]:
    """Validate a complete versioned snapshot before any bridge write."""
    if not isinstance(value, Mapping):
        raise vol.Invalid("snapshot must be an object")
    if value.get("version") != GRADIENT_SNAPSHOT_VERSION:
        raise vol.Invalid(f"snapshot version must be {GRADIENT_SNAPSHOT_VERSION}")
    entities = value.get("entities")
    if not isinstance(entities, Mapping):
        raise vol.Invalid("snapshot entities must be an object")

    snapshots: dict[str, GradientEntitySnapshot] = {}
    for entity_id, state in entities.items():
        if not isinstance(entity_id, str) or not cv.entity_id(entity_id).startswith(
            f"{LIGHT_DOMAIN}."
        ):
            raise vol.Invalid("snapshot entity IDs must be light entities")
        if not isinstance(state, Mapping):
            raise vol.Invalid(f"snapshot state for {entity_id} must be an object")

        colors_value = state.get("colors_xy")
        if (
            not isinstance(colors_value, list)
            or len(colors_value) < _MIN_GRADIENT_POINTS
        ):
            raise vol.Invalid(
                f"snapshot state for {entity_id} must contain at least two xy colors"
            )
        colors_xy = [_validate_xy_color(color) for color in colors_value]
        try:
            mode = GradientMode(state.get("mode"))
        except (TypeError, ValueError) as err:
            raise vol.Invalid(
                f"snapshot state for {entity_id} has an invalid gradient mode"
            ) from err

        is_on = state.get("on")
        if not isinstance(is_on, bool):
            raise vol.Invalid(f"snapshot state for {entity_id} must include on")

        brightness_value = state.get("brightness")
        if brightness_value is None:
            brightness = None
        elif (
            isinstance(brightness_value, bool)
            or not isinstance(brightness_value, int | float)
            or not math.isfinite(brightness_value)
            or not 0 <= brightness_value <= _HUE_BRIGHTNESS_MAX
        ):
            raise vol.Invalid(
                f"snapshot brightness for {entity_id} must be from 0 to 100"
            )
        else:
            brightness = float(brightness_value)

        snapshots[entity_id] = GradientEntitySnapshot(
            colors_xy=colors_xy,
            mode=mode,
            is_on=is_on,
            brightness=brightness,
        )
    return snapshots


SET_GRADIENT_SCHEMA = cv.make_entity_service_schema(
    {
        vol.Required(ATTR_COLORS): _validate_colors,
        vol.Optional(ATTR_MODE, default=DEFAULT_GRADIENT_MODE): vol.In(
            [mode.value for mode in GradientMode]
        ),
        vol.Optional(ATTR_TURN_ON, default=False): cv.boolean,
        vol.Optional(ATTR_BRIGHTNESS): vol.All(
            vol.Coerce(int),
            vol.Range(min=1, max=255),
        ),
        vol.Optional(ATTR_TRANSITION): vol.All(
            vol.Coerce(float),
            vol.Range(min=0, max=6000),
        ),
    }
)

SNAPSHOT_GRADIENT_SCHEMA = cv.make_entity_service_schema({})

APPLY_PRESET_SCHEMA = cv.make_entity_service_schema(
    {
        vol.Required("preset_id"): cv.string,
        vol.Optional(ATTR_TURN_ON, default=True): cv.boolean,
        vol.Optional(ATTR_TRANSITION): vol.All(
            vol.Coerce(float), vol.Range(min=0, max=6000)
        ),
    }
)

RESTORE_GRADIENT_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_SNAPSHOT): _validate_snapshot,
        vol.Optional(ATTR_TRANSITION): vol.All(
            vol.Coerce(float),
            vol.Range(min=0, max=6000),
        ),
    }
)


def _ha_gamut(entity: HueLight) -> color_util.GamutType | None:
    """Return the native light's color gamut for conversion and clipping."""
    color = entity.resource.color
    if color is None or color.gamut is None:
        return None

    gamut = color.gamut
    return color_util.GamutType(
        red=color_util.XYPoint(gamut.red.x, gamut.red.y),
        green=color_util.XYPoint(gamut.green.x, gamut.green.y),
        blue=color_util.XYPoint(gamut.blue.x, gamut.blue.y),
    )


async def _async_check_authorization(
    hass: HomeAssistant,
    call: ServiceCall,
    entity_ids: set[str],
    permission: str = POLICY_CONTROL,
) -> None:
    """Check every selected entity before issuing the first Hue write."""
    if not call.context.user_id:
        return

    user = await hass.auth.async_get_user(call.context.user_id)
    if user is None:
        raise UnknownUser(context=call.context)
    if user.is_admin:
        return

    for entity_id in entity_ids:
        if not user.permissions.check_entity(entity_id, permission):
            raise Unauthorized(
                context=call.context,
                entity_id=entity_id,
                permission=permission,
            )


def _selected_entity_ids(hass: HomeAssistant, call: ServiceCall) -> set[str]:
    """Resolve targets without expanding group light entities."""
    component = hass.data.get(DATA_INSTANCES, {}).get(LIGHT_DOMAIN)
    if call.data.get(ATTR_ENTITY_ID) == ENTITY_MATCH_ALL:
        if component is None:
            return set()
        return {entity.entity_id for entity in component.entities}

    selected = target_helpers.async_extract_referenced_entity_ids(
        hass,
        target_helpers.TargetSelection(call.data),
        expand_group=False,
    )
    return selected.referenced | selected.indirectly_referenced


def _gradient_points(
    colors: Sequence[RGBColor],
    gamut: color_util.GamutType | None,
) -> list[GradientPoint]:
    """Convert ordered RGB colors to gamut-clipped Hue gradient points."""
    return [
        GradientPoint(
            color=ColorFeatureBase(
                xy=ColorPoint(*color_util.color_RGB_to_xy(*color, gamut))
            )
        )
        for color in colors
    ]


async def _async_update_entity(
    entity: HueLight,
    colors: list[RGBColor],
    mode: GradientMode,
    call: ServiceCall,
) -> None:
    """Send one native aiohue update for a compatible entity."""
    update = LightPut()
    gamut = _ha_gamut(entity)

    if len(colors) == 1:
        update.color = ColorFeaturePut(
            xy=ColorPoint(*color_util.color_RGB_to_xy(*colors[0], gamut))
        )
    else:
        update.gradient = GradientFeaturePut(
            points=_gradient_points(colors, gamut),
            mode=mode,
        )

    if call.data[ATTR_TURN_ON]:
        update.on = OnFeature(on=True)
    if (brightness := call.data.get(ATTR_BRIGHTNESS)) is not None:
        update.dimming = DimmingFeaturePut(
            brightness=normalize_hue_brightness(brightness)
        )
    if (transition := call.data.get(ATTR_TRANSITION)) is not None:
        update.dynamics = DynamicsFeaturePut(
            duration=normalize_hue_transition(transition)
        )

    await entity.bridge.async_request_call(
        entity.controller.update,
        entity.resource.id,
        update,
    )


async def _async_snapshot_gradient(call: ServiceCall) -> ServiceResponse:
    """Return exact, versioned gradient state for eligible native Hue lights."""
    hass = call.hass
    entity_ids = _selected_entity_ids(hass, call)
    await _async_check_authorization(hass, call, entity_ids, POLICY_READ)

    component = hass.data.get(DATA_INSTANCES, {}).get(LIGHT_DOMAIN)
    entities: dict[str, dict[str, Any]] = {}
    skipped: dict[str, str] = {}

    for entity_id in sorted(entity_ids):
        entity = component.get_entity(entity_id) if component is not None else None
        if not isinstance(entity, HueLight):
            skipped[entity_id] = "not_individual_native_hue_light"
            continue
        if not hue_light_is_selected(hass, entity):
            skipped[entity_id] = "bridge_not_selected"
            continue
        if not entity.available:
            skipped[entity_id] = "unavailable"
            continue
        if (gradient := entity.resource.gradient) is None:
            skipped[entity_id] = "not_gradient_capable"
            continue
        if len(gradient.points) < _MIN_GRADIENT_POINTS:
            skipped[entity_id] = "gradient_state_incomplete"
            continue

        dimming = entity.resource.dimming
        entities[entity_id] = {
            "colors_xy": [
                [point.color.xy.x, point.color.xy.y] for point in gradient.points
            ],
            "mode": gradient.mode.value,
            "on": entity.resource.on.on,
            "brightness": dimming.brightness if dimming is not None else None,
        }

    return {
        "version": GRADIENT_SNAPSHOT_VERSION,
        "entities": entities,
        "skipped": skipped,
    }


async def _async_restore_entity(
    entity: HueLight,
    snapshot: GradientEntitySnapshot,
    call: ServiceCall,
) -> None:
    """Restore one exact Hue gradient snapshot in a single native update."""
    update = LightPut(
        on=OnFeature(on=snapshot.is_on),
        gradient=GradientFeaturePut(
            points=[
                GradientPoint(color=ColorFeatureBase(xy=ColorPoint(x, y)))
                for x, y in snapshot.colors_xy
            ],
            mode=snapshot.mode,
        ),
    )
    if snapshot.brightness is not None:
        update.dimming = DimmingFeaturePut(brightness=snapshot.brightness)
    if (transition := call.data.get(ATTR_TRANSITION)) is not None:
        update.dynamics = DynamicsFeaturePut(
            duration=normalize_hue_transition(transition)
        )

    await entity.bridge.async_request_call(
        entity.controller.update,
        entity.resource.id,
        update,
    )


async def _async_restore_gradient(call: ServiceCall) -> None:
    """Restore an exact snapshot sequentially and best effort."""
    hass = call.hass
    snapshots: dict[str, GradientEntitySnapshot] = call.data[ATTR_SNAPSHOT]
    entity_ids = set(snapshots)
    await _async_check_authorization(hass, call, entity_ids)

    component = hass.data.get(DATA_INSTANCES, {}).get(LIGHT_DOMAIN)
    for entity_id in sorted(entity_ids):
        snapshot = snapshots[entity_id]
        entity = component.get_entity(entity_id) if component is not None else None
        if not isinstance(entity, HueLight):
            _LOGGER.warning(
                "Skipping %s: it is not an individual native Hue light",
                entity_id,
            )
            continue
        if not hue_light_is_selected(hass, entity):
            _LOGGER.warning(
                "Skipping %s: its Hue bridge is not selected",
                entity_id,
            )
            continue
        if not entity.available:
            _LOGGER.warning("Skipping %s: the light is unavailable", entity_id)
            continue
        if (gradient := entity.resource.gradient) is None:
            _LOGGER.warning(
                "Skipping %s: the Hue light is not gradient-capable",
                entity_id,
            )
            continue
        if len(snapshot.colors_xy) > gradient.points_capable:
            _LOGGER.warning(
                "Skipping %s: snapshot has %s colors but it supports %s "
                "gradient points",
                entity_id,
                len(snapshot.colors_xy),
                gradient.points_capable,
            )
            continue
        if snapshot.mode not in gradient.mode_values:
            _LOGGER.warning(
                "Skipping %s: it does not support snapshot mode %s",
                entity_id,
                snapshot.mode.value,
            )
            continue
        if snapshot.brightness is not None and entity.resource.dimming is None:
            _LOGGER.warning(
                "Skipping %s: it cannot restore snapshot brightness",
                entity_id,
            )
            continue

        try:
            entity.async_set_context(call.context)
            await _async_restore_entity(entity, snapshot, call)
        except Exception as err:
            _LOGGER.warning(
                "Skipping %s after Hue rejected the snapshot: %s",
                entity_id,
                err,
            )


async def _async_set_gradient(call: ServiceCall) -> None:
    """Handle a best-effort set_gradient action."""
    hass = call.hass
    entity_ids = _selected_entity_ids(hass, call)
    await _async_check_authorization(hass, call, entity_ids)

    component = hass.data.get(DATA_INSTANCES, {}).get(LIGHT_DOMAIN)
    colors: list[RGBColor] = call.data[ATTR_COLORS]
    mode = GradientMode(call.data[ATTR_MODE])

    for entity_id in sorted(entity_ids):
        entity = component.get_entity(entity_id) if component is not None else None
        if not isinstance(entity, HueLight):
            _LOGGER.warning(
                "Skipping %s: it is not an individual native Hue light",
                entity_id,
            )
            continue
        if not hue_light_is_selected(hass, entity):
            _LOGGER.warning(
                "Skipping %s: its Hue bridge is not selected",
                entity_id,
            )
            continue
        if not entity.available:
            _LOGGER.warning("Skipping %s: the light is unavailable", entity_id)
            continue
        if (gradient := entity.resource.gradient) is None:
            _LOGGER.warning(
                "Skipping %s: the Hue light is not gradient-capable",
                entity_id,
            )
            continue
        if len(colors) > gradient.points_capable:
            _LOGGER.warning(
                "Skipping %s: %s colors exceed its %s gradient points",
                entity_id,
                len(colors),
                gradient.points_capable,
            )
            continue
        if len(colors) > 1 and mode not in gradient.mode_values:
            _LOGGER.warning(
                "Skipping %s: it does not support mode %s",
                entity_id,
                mode.value,
            )
            continue

        try:
            entity.async_set_context(call.context)
            await _async_update_entity(entity, colors, mode, call)
        except Exception as err:
            _LOGGER.warning(
                "Skipping %s after Hue rejected the update: %s",
                entity_id,
                err,
            )


async def _async_apply_preset(call: ServiceCall) -> ServiceResponse:
    """Apply a portable recipe without replaying brightness or snapshot power."""
    # Local import avoids a cycle: the library reuses our color validators.
    from .presets import DATA_PRESETS, PresetError  # noqa: PLC0415

    library = call.hass.data.get(DATA_PRESETS)
    if library is None:
        raise ServiceValidationError("Preset library is not loaded")
    try:
        recipe = library.get(call.data["preset_id"])
    except PresetError as err:
        raise ServiceValidationError(str(err)) from err
    entity_ids = _selected_entity_ids(call.hass, call)
    await _async_check_authorization(call.hass, call, entity_ids)
    component = call.hass.data.get(DATA_INSTANCES, {}).get(LIGHT_DOMAIN)
    applied, skipped = {}, {}
    for entity_id in sorted(entity_ids):
        entity = component.get_entity(entity_id) if component else None
        reason = _preset_incompatibility(call.hass, entity, recipe)
        if reason:
            skipped[entity_id] = reason
            _LOGGER.warning("Skipping %s: %s", entity_id, reason)
            continue
        try:
            points = (
                _gradient_points(recipe["preview_rgb"], _ha_gamut(entity))
                if recipe["builtin"]
                else [
                    GradientPoint(color=ColorFeatureBase(xy=ColorPoint(x, y)))
                    for x, y in recipe["colors_xy"]
                ]
            )
            update = LightPut(
                gradient=GradientFeaturePut(
                    points=points, mode=GradientMode(recipe["mode"])
                )
            )
            if call.data[ATTR_TURN_ON]:
                update.on = OnFeature(on=True)
            if (transition := call.data.get(ATTR_TRANSITION)) is not None:
                update.dynamics = DynamicsFeaturePut(
                    duration=normalize_hue_transition(transition)
                )
            entity.async_set_context(call.context)
            await entity.bridge.async_request_call(
                entity.controller.update, entity.resource.id, update
            )
            applied[entity_id] = {
                "colors_xy": [[point.color.xy.x, point.color.xy.y] for point in points],
                "mode": recipe["mode"],
            }
        except Exception as err:
            skipped[entity_id] = "hue_rejected"
            _LOGGER.warning(
                "Skipping %s after Hue rejected the preset: %s", entity_id, err
            )
    return {"applied": applied, "skipped": skipped}


def _preset_incompatibility(hass, entity, recipe) -> str | None:  # noqa: PLR0911
    """Check per-target eligibility without changing the recipe."""
    if not isinstance(entity, HueLight):
        return "not_individual_native_hue_light"
    if not hue_light_is_selected(hass, entity):
        return "bridge_not_selected"
    if not entity.available:
        return "unavailable"
    gradient = entity.resource.gradient
    if gradient is None:
        return "not_gradient_capable"
    if len(recipe["preview_rgb"]) > gradient.points_capable:
        return "point_capacity_exceeded"
    if GradientMode(recipe["mode"]) not in gradient.mode_values:
        return "unsupported_mode"
    return None


@callback
def async_register_gradient_services(hass: HomeAssistant) -> None:
    """Register gradient write, snapshot, and restore actions."""
    hass.services.async_register(
        DOMAIN,
        "apply_preset",
        _async_apply_preset,
        APPLY_PRESET_SCHEMA,
        supports_response=SupportsResponse.OPTIONAL,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_SET_GRADIENT,
        _async_set_gradient,
        SET_GRADIENT_SCHEMA,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_SNAPSHOT_GRADIENT,
        _async_snapshot_gradient,
        SNAPSHOT_GRADIENT_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_RESTORE_GRADIENT,
        _async_restore_gradient,
        RESTORE_GRADIENT_SCHEMA,
    )


@callback
def async_unregister_gradient_services(hass: HomeAssistant) -> None:
    """Remove all gradient actions."""
    for service in (
        "apply_preset",
        SERVICE_SET_GRADIENT,
        SERVICE_SNAPSHOT_GRADIENT,
        SERVICE_RESTORE_GRADIENT,
    ):
        hass.services.async_remove(DOMAIN, service)
