"""Config flow for Philips Hue Gradient Controller."""

from __future__ import annotations

from typing import Any, override

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlowResult,
    OptionsFlowWithReload,
)
from homeassistant.const import CONF_API_VERSION
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import selector

from .const import (
    CONF_HUE_BRIDGES,
    DOMAIN,
    HUE_API_V2,
    NAME,
    SELECT_ALL_HUE_BRIDGES,
)
from .coverage import format_gradient_light_coverage, gradient_light_coverage


def _hue_v2_entries(hass: HomeAssistant) -> list[ConfigEntry[Any]]:
    """Return enabled native Hue v2 bridge entries."""
    return [
        entry
        for entry in hass.config_entries.async_entries(
            "hue",
            include_ignore=False,
            include_disabled=False,
        )
        if entry.data.get(CONF_API_VERSION) == HUE_API_V2
    ]


def _normalize_bridge_selection(values: list[str]) -> list[str]:
    """Make the all-bridges choice exclusive and persist stable ordering."""
    if SELECT_ALL_HUE_BRIDGES in values:
        return [SELECT_ALL_HUE_BRIDGES]
    return sorted(set(values))


def _bridge_selection_schema(
    hass: HomeAssistant,
    default: list[str],
) -> vol.Schema:
    """Build a bridge selector from the currently configured Hue bridges."""
    options: list[selector.SelectOptionDict] = [
        {
            "value": SELECT_ALL_HUE_BRIDGES,
            "label": "All Hue bridges",
        },
        *[
            {
                "value": entry.entry_id,
                "label": entry.title,
            }
            for entry in _hue_v2_entries(hass)
        ],
    ]
    available_values = {option["value"] for option in options}
    selected_default = [value for value in default if value in available_values]
    if not selected_default:
        selected_default = [SELECT_ALL_HUE_BRIDGES]

    return vol.Schema(
        {
            vol.Required(CONF_HUE_BRIDGES, default=selected_default): vol.All(
                selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=options,
                        multiple=True,
                        mode=selector.SelectSelectorMode.LIST,
                    )
                ),
                vol.Length(min=1),
            )
        }
    )


class HueGradientControllerConfigFlow(
    config_entries.ConfigFlow,
    domain=DOMAIN,
):
    """Configure Philips Hue Gradient Controller."""

    VERSION = 1
    _pending_hue_bridges: list[str] | None = None

    @staticmethod
    @callback
    @override
    def async_get_options_flow(
        config_entry: ConfigEntry[None],
    ) -> HueGradientControllerOptionsFlow:
        """Return the bridge-selection options flow."""
        return HueGradientControllerOptionsFlow()

    async def async_step_user(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Create the single controller entry."""
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        if not _hue_v2_entries(self.hass):
            return self.async_abort(reason="no_hue_v2")

        if user_input is None:
            return self.async_show_form(
                step_id="user",
                data_schema=_bridge_selection_schema(
                    self.hass,
                    [SELECT_ALL_HUE_BRIDGES],
                ),
            )

        self._pending_hue_bridges = _normalize_bridge_selection(
            user_input[CONF_HUE_BRIDGES]
        )
        return await self.async_step_confirm()

    async def async_step_confirm(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Review the native Hue lights covered by the pending selection."""
        selection = self._pending_hue_bridges or [SELECT_ALL_HUE_BRIDGES]
        if user_input is None:
            coverage = gradient_light_coverage(self.hass, selection)
            return self.async_show_form(
                step_id="confirm",
                data_schema=vol.Schema({}),
                description_placeholders={
                    "gradient_lights": format_gradient_light_coverage(coverage),
                },
            )

        return self.async_create_entry(
            title=NAME,
            data={},
            options={CONF_HUE_BRIDGES: selection},
        )


class HueGradientControllerOptionsFlow(OptionsFlowWithReload):
    """Update the native Hue bridge selection."""

    _pending_hue_bridges: list[str] | None = None

    async def async_step_init(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Show and save bridge-selection options."""
        if user_input is not None:
            self._pending_hue_bridges = _normalize_bridge_selection(
                user_input[CONF_HUE_BRIDGES]
            )
            return await self.async_step_confirm()

        return self.async_show_form(
            step_id="init",
            data_schema=_bridge_selection_schema(
                self.hass,
                self.config_entry.options.get(
                    CONF_HUE_BRIDGES,
                    [SELECT_ALL_HUE_BRIDGES],
                ),
            ),
        )

    async def async_step_confirm(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Review the native Hue lights covered by the pending selection."""
        selection = self._pending_hue_bridges or [SELECT_ALL_HUE_BRIDGES]
        if user_input is None:
            coverage = gradient_light_coverage(self.hass, selection)
            return self.async_show_form(
                step_id="confirm",
                data_schema=vol.Schema({}),
                description_placeholders={
                    "gradient_lights": format_gradient_light_coverage(coverage),
                },
            )

        return self.async_create_entry(
            title="",
            data={CONF_HUE_BRIDGES: selection},
        )
