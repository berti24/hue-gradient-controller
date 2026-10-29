"""Shared recipe persistence, exact application and authenticated library tests."""

import asyncio
import logging
from copy import deepcopy
from unittest.mock import AsyncMock, patch

import pytest
from aiohue.util import dataclass_to_dict
from aiohue.v2.models.feature import GradientMode
from homeassistant.components.light import DOMAIN as LIGHT_DOMAIN
from homeassistant.core import Context
from homeassistant.exceptions import ServiceValidationError, Unauthorized
from homeassistant.helpers.entity_component import EntityComponent
from homeassistant.helpers.storage import Store
from homeassistant.util.file import WriteError
from pytest_homeassistant_custom_component.common import MockConfigEntry, MockUser

from custom_components.hue_gradient_controller.const import DOMAIN
from custom_components.hue_gradient_controller.preset_ws import PREFIX
from custom_components.hue_gradient_controller.presets import (
    BUILTINS,
    DATA_PRESETS,
    PresetError,
    PresetLibrary,
)

from .test_service import _gradient_feature, _hue_entity, _register_entity


@pytest.fixture
async def preset_environment(hass):
    """Use real integration setup/storage and a native light with a fake controller."""
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    component = EntityComponent(logging.getLogger(__name__), LIGHT_DOMAIN, hass)
    light, controller = _hue_entity(
        "light.source",
        gradient=_gradient_feature(points=[(0.123456, 0.345678), (0.4, 0.2)]),
    )
    _register_entity(component, light)
    user = MockUser()
    user.mock_policy({"entities": {"all": True}})
    user.add_to_hass(hass)
    return entry, component, light, controller, user, hass.data[DATA_PRESETS]


async def _save(library, user, light):
    result = await library.async_mutate(
        user,
        "save",
        {
            "name": "Exact palette",
            "source_entity_id": light.entity_id,
        },
    )
    return library.get(result["preset_id"])


async def test_catalogue_and_exact_capture_restart(hass, preset_environment):
    """Recipes capture precise xy, not display RGB or unrelated snapshot fields."""
    _, _, light, controller, user, library = preset_environment
    assert len(BUILTINS) == 20
    assert {len(recipe["preview_rgb"]) for recipe in BUILTINS} == {2, 3, 4, 5}
    assert all(1 <= recipe["brightness_pct"] <= 100 for recipe in BUILTINS)
    assert [recipe["name"] for recipe in BUILTINS[-4:]] == [
        "Witching Hour",
        "Pumpkin Patch",
        "Candy Cane",
        "Holiday Glow",
    ]
    recipe = await _save(library, user, light)
    assert recipe["colors_xy"] == [[0.123456, 0.345678], [0.4, 0.2]]
    assert not {
        "brightness",
        "brightness_pct",
        "on",
        "source_entity_id",
    } & recipe.keys()
    assert library.view(user)["favorites"] == []
    controller.update.assert_not_awaited()
    restarted = PresetLibrary(hass)
    await restarted.async_load()
    assert restarted.get(recipe["id"]) == recipe


async def test_personal_preferences_and_creator_permissions(preset_environment):
    """Favorites/preferences are private while custom recipes are shared."""
    _, _, light, _, creator, library = preset_environment
    recipe = await _save(library, creator, light)
    other = MockUser()
    await library.async_mutate(
        creator, "favorite", {"preset_id": recipe["id"], "favorite": True}
    )
    await library.async_mutate(creator, "preferences", {"expanded": True})
    assert library.view(creator)["favorites"] == [recipe["id"]]
    assert library.view(other)["favorites"] == []
    assert library.view(other)["expanded"] is False
    assert library.view(other)["presets"][-1]["can_edit"] is False
    assert "creator_id" not in library.view(other)["presets"][-1]
    with pytest.raises(PresetError, match="creator"):
        await library.async_mutate(
            other, "delete", {"preset_id": recipe["id"], "revision": 1}
        )
    with pytest.raises(PresetError, match="creator"):
        await library.async_mutate(
            creator,
            "rename",
            {"preset_id": "builtin:ocean", "revision": 1, "name": "Oops"},
        )


async def test_update_revision_and_delete_preserve_then_remove_favorites(
    preset_environment,
):
    """Updates retain identity and reject stale edits; deletion clears all stars."""
    _, _, light, _, user, library = preset_environment
    recipe = await _save(library, user, light)
    await library.async_mutate(
        user, "favorite", {"preset_id": recipe["id"], "favorite": True}
    )
    await library.async_mutate(
        user,
        "save",
        {
            "preset_id": recipe["id"],
            "revision": 1,
            "name": "Updated",
            "source_entity_id": light.entity_id,
        },
    )
    assert library.get(recipe["id"])["revision"] == 2
    assert library.view(user)["favorites"] == [recipe["id"]]
    with pytest.raises(PresetError, match="changed"):
        await library.async_mutate(
            user, "delete", {"preset_id": recipe["id"], "revision": 1}
        )
    await library.async_mutate(
        user, "delete", {"preset_id": recipe["id"], "revision": 2}
    )
    assert library.view(user)["favorites"] == []


async def test_parallel_mutations_and_failed_persistence(preset_environment):
    """Independent updates survive serialization; failed writes never commit."""
    _, _, _, _, user, library = preset_environment
    await asyncio.gather(
        library.async_mutate(
            user, "favorite", {"preset_id": "builtin:ocean", "favorite": True}
        ),
        library.async_mutate(
            user, "favorite", {"preset_id": "builtin:ember", "favorite": True}
        ),
    )
    assert set(library.view(user)["favorites"]) == {"builtin:ocean", "builtin:ember"}
    before = deepcopy(library.data)
    library.store.async_save = AsyncMock(side_effect=OSError("disk full"))
    with pytest.raises(OSError):
        await library.async_mutate(user, "preferences", {"expanded": True})
    assert library.data == before


async def test_native_store_disk_failure_is_not_acknowledged(preset_environment):
    """Native Store swallows WriteError; our guarded hook detects that failure."""
    _, _, _, _, user, library = preset_environment
    before = deepcopy(library.data)
    with (
        patch.object(Store, "_async_write_data", side_effect=WriteError("disk full")),
        pytest.raises(PresetError, match="could not be saved"),
    ):
        await library.async_mutate(user, "preferences", {"expanded": True})
    assert library.data == before


async def test_save_requires_read_permission_and_selected_bridge(
    hass, preset_environment
):
    """Captures are read-authorized and constrained by native bridge selection."""
    _, _, light, _, user, library = preset_environment
    denied = MockUser()
    denied.mock_policy({})
    with pytest.raises(PresetError, match="cannot read"):
        await _save(library, denied, light)
    hass.data[DOMAIN] = frozenset({"different-bridge"})
    with pytest.raises(PresetError, match="selected native"):
        await _save(library, user, light)
    assert not library.data["presets"]


@pytest.mark.parametrize("incompatible", ["capacity", "mode"])
async def test_save_rejects_inconsistent_native_gradient(
    preset_environment, incompatible
):
    """Do not persist a stale native palette that exceeds current capabilities."""
    _, _, light, _, user, library = preset_environment
    if incompatible == "capacity":
        light.resource.gradient.points_capable = 1
    else:
        light.resource.gradient.mode_values = [GradientMode.SEGMENTED_PALETTE]
    with pytest.raises(PresetError, match="No available multi-color"):
        await _save(library, user, light)
    assert not library.data["presets"]


async def test_apply_exact_preserves_brightness_and_context(hass, preset_environment):
    """Portable saved xy goes unchanged to another selected native light."""
    _, component, light, _, user, library = preset_environment
    recipe = await _save(library, user, light)
    target, controller = _hue_entity("light.target", gradient=_gradient_feature())
    _register_entity(component, target)
    context = Context(user_id=user.id)
    response = await hass.services.async_call(
        DOMAIN,
        "apply_preset",
        {
            "entity_id": target.entity_id,
            "preset_id": recipe["id"],
            "transition": 0.5,
        },
        blocking=True,
        return_response=True,
        context=context,
    )
    update = controller.update.call_args.args[1]
    payload = dataclass_to_dict(update)
    assert "dimming" not in payload
    assert payload["on"] == {"on": True}
    assert payload["gradient"]["points"] == [
        {"color": {"xy": {"x": 0.123456, "y": 0.345678}}},
        {"color": {"xy": {"x": 0.4, "y": 0.2}}},
    ]
    assert target._context is context
    assert response["applied"][target.entity_id]["colors_xy"] == recipe["colors_xy"]


async def test_apply_builtin_sets_its_suggested_brightness(hass, preset_environment):
    """Built-in presets write their catalogue brightness with the gradient."""
    _, _, light, controller, _, library = preset_environment
    recipe = library.get("builtin:ocean")
    response = await hass.services.async_call(
        DOMAIN,
        "apply_preset",
        {"entity_id": light.entity_id, "preset_id": recipe["id"]},
        blocking=True,
        return_response=True,
    )
    update = controller.update.call_args.args[1]
    assert update.dimming.brightness == recipe["brightness_pct"]
    assert response["applied"][light.entity_id]["brightness_pct"] == recipe[
        "brightness_pct"
    ]
    assert update.on.on is True


async def test_apply_authorizes_every_target_before_any_write(hass, preset_environment):
    """A denied target prevents otherwise eligible partial success."""
    _, component, light, controller, _, _ = preset_environment
    second, second_controller = _hue_entity(
        "light.denied", gradient=_gradient_feature()
    )
    _register_entity(component, second)
    user = MockUser()
    user.mock_policy({"entities": {"entity_ids": {light.entity_id: True}}})
    user.add_to_hass(hass)
    with pytest.raises(Unauthorized):
        await hass.services.async_call(
            DOMAIN,
            "apply_preset",
            {
                "entity_id": [light.entity_id, second.entity_id],
                "preset_id": "builtin:ocean",
            },
            blocking=True,
            context=Context(user_id=user.id),
        )
    controller.update.assert_not_awaited()
    second_controller.update.assert_not_awaited()


async def test_apply_incompatibility_and_hue_rejection_continue(
    hass, preset_environment
):
    """Best effort retains point counts and modes and continues after rejection."""
    _, component, _, _, _, _ = preset_environment
    small, small_controller = _hue_entity(
        "light.small", gradient=_gradient_feature(points_capable=2)
    )
    bad_mode, mode_controller = _hue_entity(
        "light.mode", gradient=_gradient_feature(modes=[GradientMode.SEGMENTED_PALETTE])
    )
    rejected, rejected_controller = _hue_entity(
        "light.rejected", gradient=_gradient_feature()
    )
    good, good_controller = _hue_entity("light.success", gradient=_gradient_feature())
    rejected_controller.update.side_effect = RuntimeError("bridge rejected")
    for light in (small, bad_mode, rejected, good):
        _register_entity(component, light)
    response = await hass.services.async_call(
        DOMAIN,
        "apply_preset",
        {
            "entity_id": [
                light.entity_id for light in (small, bad_mode, rejected, good)
            ],
            "preset_id": "builtin:aurora",
            "turn_on": False,
        },
        blocking=True,
        return_response=True,
    )
    assert response["skipped"] == {
        "light.small": "point_capacity_exceeded",
        "light.mode": "unsupported_mode",
        "light.rejected": "hue_rejected",
    }
    small_controller.update.assert_not_awaited()
    mode_controller.update.assert_not_awaited()
    assert "on" not in dataclass_to_dict(good_controller.update.call_args.args[1])
    assert len(good_controller.update.call_args.args[1].gradient.points) == 3


async def test_unknown_preset_fails_without_writes(hass, preset_environment):
    """Missing recipes produce a clear validation failure."""
    _, _, light, controller, _, _ = preset_environment
    with pytest.raises(ServiceValidationError, match="no longer exists"):
        await hass.services.async_call(
            DOMAIN,
            "apply_preset",
            {
                "entity_id": light.entity_id,
                "preset_id": "custom:missing",
            },
            blocking=True,
        )
    controller.update.assert_not_awaited()


async def test_unload_reload_retains_library(hass, preset_environment):
    """Lifecycle preserves persistence and the existing bridge selection invariant."""
    entry, _, light, _, user, library = preset_environment
    recipe = await _save(library, user, light)
    await library.async_mutate(user, "preferences", {"expanded": True})
    assert await hass.config_entries.async_unload(entry.entry_id)
    assert DATA_PRESETS not in hass.data
    assert not hass.services.has_service(DOMAIN, "apply_preset")
    assert await hass.config_entries.async_setup(entry.entry_id)
    assert isinstance(hass.data[DOMAIN], frozenset)
    assert hass.data[DATA_PRESETS].get(recipe["id"]) == recipe
    assert hass.data[DATA_PRESETS].view(user)["expanded"] is True


async def test_websocket_protocol_subscription_and_private_mutation(
    hass, preset_environment, hass_ws_client
):
    """Exercise registered commands over an authenticated HA WebSocket."""
    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": PREFIX + "subscribe"})
    assert (await client.receive_json())["success"]
    event = await client.receive_json()
    assert len(event["event"]["presets"]) == 20
    await client.send_json(
        {
            "id": 2,
            "type": PREFIX + "favorite",
            "preset_id": "builtin:ocean",
            "favorite": True,
        }
    )
    messages = [await client.receive_json(), await client.receive_json()]
    assert next(msg for msg in messages if msg["type"] == "event")["event"][
        "favorites"
    ] == ["builtin:ocean"]
    assert next(msg for msg in messages if msg["type"] == "result")["success"]
    await client.send_json(
        {
            "id": 3,
            "type": PREFIX + "delete",
            "preset_id": "builtin:ocean",
            "revision": 1,
        }
    )
    assert (await client.receive_json())["error"]["code"] == "unauthorized"


async def test_corrupt_storage_is_not_overwritten(hass):
    """A damaged store remains unavailable and cannot be silently replaced."""
    library = PresetLibrary(hass)
    library.store.async_load = AsyncMock(
        return_value={"presets": {"bad": {}}, "users": {}}
    )
    library.store.async_save = AsyncMock()
    await library.async_load()
    assert not library.ready
    with pytest.raises(PresetError):
        await library.async_mutate(MockUser(), "preferences", {"expanded": True})
    library.store.async_save.assert_not_awaited()
