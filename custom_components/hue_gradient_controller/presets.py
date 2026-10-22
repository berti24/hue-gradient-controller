"""Persistent shared gradient recipes and private user preferences."""

import asyncio
import json
from copy import deepcopy
from pathlib import Path
from typing import Any
from uuid import uuid4

import voluptuous as vol
from aiohue.v2.models.feature import GradientMode
from homeassistant.auth.permissions.const import POLICY_READ
from homeassistant.components.hue.v2.light import HueLight
from homeassistant.components.light import DOMAIN as LIGHT_DOMAIN
from homeassistant.core import CoreState
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.entity_component import DATA_INSTANCES
from homeassistant.helpers.storage import Store
from homeassistant.util import color as color_util

from .const import DOMAIN
from .selection import hue_light_is_selected
from .service import _ha_gamut, _validate_colors, _validate_xy_color

DATA_PRESETS = f"{DOMAIN}_presets"
SIGNAL_PRESETS = f"{DOMAIN}_presets_changed"
MODE = GradientMode.INTERPOLATED_PALETTE.value
MAX_NAME_LENGTH = 80
MIN_BRIGHTNESS_PCT = 1
MAX_BRIGHTNESS_PCT = 100
MIN_POINTS = 2

BUILTINS = tuple(
    {
        "id": item["id"],
        "name": item["name"],
        "mode": MODE,
        "builtin": True,
        "brightness_pct": item["brightness_pct"],
        "preview_rgb": [
            color_util.rgb_hex_to_rgb_list(value[1:]) for value in item["colors"]
        ],
        "revision": 1,
    }
    for item in json.loads(
        Path(__file__).with_name("preset_catalogue.json").read_text()
    )
)


class PresetError(HomeAssistantError):
    """A user-facing library failure with a stable protocol code."""

    def __init__(self, code: str, message: str) -> None:
        """Initialize a protocol error."""
        super().__init__(message)
        self.code = code


class ConfirmedPresetStore(Store):
    """Observe native atomic writes so a swallowed failure cannot be acknowledged.

    HA 2026.7 Store.async_save logs WriteError instead of propagating it. This
    local subclass narrowly observes its protected write hook without changing
    HA's storage machinery. The pinned-version disk-failure test guards this seam.
    """

    async def async_save(self, data) -> None:
        """Acknowledge only a write that actually finished."""
        if self.hass.state is CoreState.stopping:
            raise PresetError("unavailable", "Home Assistant is stopping")
        self._preset_write_confirmed = False
        await super().async_save(data)
        if not self._preset_write_confirmed:
            raise PresetError("storage_error", "Preset change could not be saved")

    async def _async_write_data(self, data: dict) -> None:
        """Observe success from the pinned native write hook."""
        await super()._async_write_data(data)
        self._preset_write_confirmed = True


def preset_name(value: Any) -> str:
    """Validate a short, nonempty display name."""
    if not isinstance(value, str) or not 1 <= len(value.strip()) <= MAX_NAME_LENGTH:
        raise PresetError("invalid_name", "Use a name from 1 to 80 characters")
    return value.strip()


def validate_recipe(recipe: dict) -> None:
    """Validate stored colors completely before making them available."""
    preset_name(recipe["name"])
    GradientMode(recipe["mode"])
    colors = recipe["preview_rgb"]
    if len(colors) < MIN_POINTS:
        raise ValueError("A preset needs at least two colors")
    _validate_colors(colors)
    if recipe.get("builtin"):
        brightness_pct = recipe.get("brightness_pct")
        if (
            type(brightness_pct) is not int
            or not MIN_BRIGHTNESS_PCT <= brightness_pct <= MAX_BRIGHTNESS_PCT
        ):
            raise ValueError("Invalid built-in preset brightness")
    else:
        if len(recipe["colors_xy"]) != len(colors):
            raise ValueError("Preset preview and xy counts differ")
        for point in recipe["colors_xy"]:
            _validate_xy_color(point)
        if not isinstance(recipe["creator_id"], str):
            raise ValueError("Invalid preset creator")
        if type(recipe["revision"]) is not int or recipe["revision"] < 1:
            raise ValueError("Invalid preset revision")


class PresetLibrary:
    """Store recipes without retaining native runtime objects or credentials."""

    def __init__(self, hass) -> None:
        """Create an installation-wide store."""
        self.hass = hass
        self.store = ConfirmedPresetStore(
            hass, 1, f"{DOMAIN}.presets", atomic_writes=True, private=True
        )
        self.data = {"presets": {}, "users": {}}
        self.lock = asyncio.Lock()
        self.ready = False
        self.error = "Preset library is loading"

    async def async_load(self) -> None:
        """Load and validate; never replace a damaged store with empty data."""
        try:
            data = await self.store.async_load()
            if data is not None:
                if (
                    not isinstance(data, dict)
                    or not isinstance(data.get("presets"), dict)
                    or not isinstance(data.get("users"), dict)
                ):
                    raise ValueError("Invalid library structure")
                for key, recipe in data["presets"].items():
                    if (
                        recipe["id"] != key
                        or not key.startswith("custom:")
                        or recipe.get("builtin") is not False
                    ):
                        raise ValueError("Invalid preset ID")
                    validate_recipe(recipe)
                for preferences in data["users"].values():
                    if (
                        not isinstance(preferences["favorites"], list)
                        or not all(
                            isinstance(key, str) for key in preferences["favorites"]
                        )
                        or type(preferences["expanded"]) is not bool
                    ):
                        raise ValueError("Invalid preset preferences")
                self.data = data
            self.ready = True
            self.error = ""
        except (
            HomeAssistantError,
            OSError,
            ValueError,
            KeyError,
            TypeError,
            vol.Invalid,
        ) as err:
            self.error = f"Preset library could not load: {err}"

    def get(self, preset_id: str) -> dict:
        """Return a detached, validated recipe."""
        if not self.ready:
            raise PresetError("unavailable", self.error)
        recipe = next((item for item in BUILTINS if item["id"] == preset_id), None)
        recipe = recipe or self.data["presets"].get(preset_id)
        if recipe is None:
            raise PresetError("not_found", "Preset no longer exists")
        validate_recipe(recipe)
        return deepcopy(recipe)

    def view(self, user) -> dict:
        """Return only the current user's private preferences."""
        preferences = self.data["users"].get(
            user.id, {"favorites": [], "expanded": False}
        )
        recipes = [*BUILTINS, *self.data["presets"].values()]
        return {
            "available": self.ready,
            "error": self.error,
            "presets": [
                {
                    key: deepcopy(value)
                    for key, value in recipe.items()
                    if key != "creator_id"
                }
                | {
                    "can_edit": not recipe["builtin"]
                    and (user.is_admin or recipe["creator_id"] == user.id)
                }
                for recipe in recipes
            ],
            "favorites": list(preferences["favorites"]),
            "expanded": preferences["expanded"],
        }

    def _editable(self, user, message: dict) -> dict:
        recipe = self.get(message["preset_id"])
        if recipe["builtin"] or not (user.is_admin or recipe["creator_id"] == user.id):
            raise PresetError(
                "unauthorized", "Only its creator or an admin can edit it"
            )
        if message["revision"] != recipe["revision"]:
            raise PresetError("conflict", "Preset changed. Review it and try again")
        return recipe

    def _capture(self, user, entity_id: str) -> dict:
        if not user.is_admin and not user.permissions.check_entity(
            entity_id, POLICY_READ
        ):
            raise PresetError("unauthorized", "You cannot read this light")
        component = self.hass.data.get(DATA_INSTANCES, {}).get(LIGHT_DOMAIN)
        entity = component.get_entity(entity_id) if component else None
        if not isinstance(entity, HueLight) or not hue_light_is_selected(
            self.hass, entity
        ):
            raise PresetError(
                "incompatible", "Choose a selected native Hue gradient light"
            )
        gradient = entity.resource.gradient
        state = self.hass.states.get(entity_id)
        if (
            not entity.available
            or gradient is None
            or len(gradient.points) < MIN_POINTS
            or len(gradient.points) > gradient.points_capable
            or gradient.mode not in gradient.mode_values
            or (state and state.attributes.get("color_mode") == "color_temp")
        ):
            raise PresetError("incomplete", "No available multi-color gradient to save")
        xy = [[point.color.xy.x, point.color.xy.y] for point in gradient.points]
        return {
            "colors_xy": xy,
            "mode": gradient.mode.value,
            "preview_rgb": [
                list(color_util.color_xy_to_RGB(x, y, _ha_gamut(entity))) for x, y in xy
            ],
        }

    async def async_mutate(self, user, operation: str, message: dict) -> dict:
        """Commit mutations atomically, with stale-write protection."""
        async with self.lock:
            if not self.ready:
                raise PresetError("unavailable", self.error)
            data = deepcopy(self.data)
            result = self._mutate(data, user, operation, message)
            await self.store.async_save(data)
            self.data = data
            async_dispatcher_send(
                self.hass,
                SIGNAL_PRESETS,
                user.id if operation in ("favorite", "preferences") else None,
            )
            return result

    def _mutate(self, data: dict, user, operation: str, message: dict) -> dict:
        preferences = data["users"].setdefault(
            user.id, {"favorites": [], "expanded": False}
        )
        if operation == "preferences":
            preferences["expanded"] = message["expanded"]
        elif operation == "favorite":
            preset_id = self.get(message["preset_id"])["id"]
            favorites = preferences["favorites"]
            if preset_id in favorites:
                favorites.remove(preset_id)
            if message["favorite"]:
                favorites.append(preset_id)
        elif operation == "save":
            recipe = (
                self._editable(user, message)
                if "preset_id" in message
                else {
                    "id": f"custom:{uuid4().hex}",
                    "creator_id": user.id,
                    "builtin": False,
                    "revision": 0,
                }
            )
            recipe.update(self._capture(user, message["source_entity_id"]))
            recipe["name"] = preset_name(message["name"])
            recipe["revision"] += 1
            validate_recipe(recipe)
            data["presets"][recipe["id"]] = recipe
            return {"preset_id": recipe["id"]}
        else:
            recipe = self._editable(user, message)
            if operation == "rename":
                recipe.update(
                    name=preset_name(message["name"]), revision=recipe["revision"] + 1
                )
                data["presets"][recipe["id"]] = recipe
            elif operation == "delete":
                del data["presets"][recipe["id"]]
                for value in data["users"].values():
                    value["favorites"] = [
                        key for key in value["favorites"] if key != recipe["id"]
                    ]
        return {}
