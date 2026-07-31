"""Tests for the Philips Hue Gradient Controller config flow."""

from homeassistant.config_entries import SOURCE_USER
from homeassistant.const import CONF_API_VERSION
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.hue_gradient_controller.const import (
    CONF_HUE_BRIDGES,
    DOMAIN,
    SELECT_ALL_HUE_BRIDGES,
)


async def test_user_can_create_single_controller_for_hue_v2(
    hass: HomeAssistant,
) -> None:
    """A Hue v2 installation can create one bridge-selecting controller entry."""
    hue_entry = MockConfigEntry(
        domain="hue",
        title="Upstairs Hue",
        data={CONF_API_VERSION: 2},
    )
    hue_entry.add_to_hass(hass)

    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": SOURCE_USER},
    )

    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "user"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        user_input={CONF_HUE_BRIDGES: [hue_entry.entry_id]},
    )

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "Philips Hue Gradient Controller"
    assert result["data"] == {}
    assert result["options"] == {CONF_HUE_BRIDGES: [hue_entry.entry_id]}


async def test_user_is_directed_to_configure_hue_v2_first(
    hass: HomeAssistant,
) -> None:
    """Setup stops clearly when there is no native Hue v2 bridge."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": SOURCE_USER},
    )

    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "no_hue_v2"


async def test_only_one_controller_entry_can_be_created(
    hass: HomeAssistant,
) -> None:
    """One controller entry manages the native Hue bridge selection."""
    MockConfigEntry(domain=DOMAIN, data={}, unique_id=DOMAIN).add_to_hass(hass)
    MockConfigEntry(
        domain="hue",
        data={CONF_API_VERSION: 2},
    ).add_to_hass(hass)

    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": SOURCE_USER},
    )

    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "single_instance_allowed"


async def test_all_bridges_choice_is_exclusive(
    hass: HomeAssistant,
) -> None:
    """Selecting all bridges discards redundant individual bridge choices."""
    hue_entry = MockConfigEntry(
        domain="hue",
        title="Upstairs Hue",
        data={CONF_API_VERSION: 2},
    )
    hue_entry.add_to_hass(hass)
    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": SOURCE_USER},
    )

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        user_input={
            CONF_HUE_BRIDGES: [SELECT_ALL_HUE_BRIDGES, hue_entry.entry_id]
        },
    )

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["options"] == {
        CONF_HUE_BRIDGES: [SELECT_ALL_HUE_BRIDGES]
    }


async def test_options_flow_updates_bridge_selection(
    hass: HomeAssistant,
) -> None:
    """The selected Hue bridges can be changed after initial setup."""
    first_hue = MockConfigEntry(
        domain="hue",
        title="Upstairs Hue",
        data={CONF_API_VERSION: 2},
    )
    second_hue = MockConfigEntry(
        domain="hue",
        title="Downstairs Hue",
        data={CONF_API_VERSION: 2},
    )
    first_hue.add_to_hass(hass)
    second_hue.add_to_hass(hass)
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={},
        options={CONF_HUE_BRIDGES: [first_hue.entry_id]},
        unique_id=DOMAIN,
    )
    entry.add_to_hass(hass)

    result = await hass.config_entries.options.async_init(entry.entry_id)
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "init"

    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        user_input={CONF_HUE_BRIDGES: [second_hue.entry_id]},
    )

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert entry.options == {CONF_HUE_BRIDGES: [second_hue.entry_id]}


async def test_legacy_zero_data_entry_defaults_to_all_bridges(
    hass: HomeAssistant,
) -> None:
    """Entries created before bridge selection retain their original behavior."""
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)
    assert hass.data[DOMAIN] == frozenset({SELECT_ALL_HUE_BRIDGES})
