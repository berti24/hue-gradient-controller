"""Authenticated, push-based preset library protocol."""

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.dispatcher import async_dispatcher_connect

from .const import DOMAIN
from .presets import DATA_PRESETS, SIGNAL_PRESETS, PresetError

PREFIX = f"{DOMAIN}/presets/"


def _library(hass):
    library = hass.data.get(DATA_PRESETS)
    if library is None:
        raise PresetError("unavailable", "Preset integration is not loaded")
    return library


@websocket_api.websocket_command({vol.Required("type"): PREFIX + "subscribe"})
@websocket_api.async_response
async def subscribe(hass, connection, msg):
    """Push a personalized initial view and subsequent changes."""

    @callback
    def changed(user_id=None):
        if user_id is not None and user_id != connection.user.id:
            return
        library = hass.data.get(DATA_PRESETS)
        connection.send_event(
            msg["id"],
            library.view(connection.user)
            if library
            else {
                "available": False,
                "error": "Preset integration is not loaded",
                "presets": [],
                "favorites": [],
                "expanded": False,
            },
        )

    connection.subscriptions[msg["id"]] = async_dispatcher_connect(
        hass, SIGNAL_PRESETS, changed
    )
    connection.send_result(msg["id"])
    changed()


@callback
def async_register_preset_commands(hass):
    """Register once; handlers resolve the active library on each request."""
    websocket_api.async_register_command(hass, subscribe)
    revision = vol.All(int, vol.Range(min=1))
    schemas = {
        "save": {
            vol.Required("source_entity_id"): cv.entity_id,
            vol.Required("name"): str,
            vol.Optional("preset_id"): str,
            vol.Optional("revision"): revision,
        },
        "rename": {
            vol.Required("preset_id"): str,
            vol.Required("revision"): revision,
            vol.Required("name"): str,
        },
        "delete": {vol.Required("preset_id"): str, vol.Required("revision"): revision},
        "favorite": {vol.Required("preset_id"): str, vol.Required("favorite"): bool},
        "preferences": {vol.Required("expanded"): bool},
    }
    for operation, fields in schemas.items():

        def handler_factory(name):
            @websocket_api.async_response
            async def handle(hass, connection, msg):
                try:
                    if "preset_id" in msg and name == "save" and "revision" not in msg:
                        raise PresetError(
                            "invalid_format", "An update needs a revision"
                        )
                    result = await _library(hass).async_mutate(
                        connection.user, name, msg
                    )
                    connection.send_result(msg["id"], result)
                except PresetError as err:
                    connection.send_error(msg["id"], err.code, str(err))

            return handle

        websocket_api.async_register_command(
            hass,
            PREFIX + operation,
            handler_factory(operation),
            websocket_api.BASE_COMMAND_MESSAGE_SCHEMA.extend(
                {vol.Required("type"): PREFIX + operation, **fields}
            ),
        )
