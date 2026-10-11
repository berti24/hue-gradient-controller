"""Constants for Philips Hue Gradient Controller."""

from typing import Final

DOMAIN: Final = "hue_gradient_controller"
NAME: Final = "Philips Hue Gradient Controller"

CONF_HUE_BRIDGES: Final = "hue_bridges"
SELECT_ALL_HUE_BRIDGES: Final = "*"

ATTR_COLORS: Final = "colors"
ATTR_MODE: Final = "mode"
ATTR_SNAPSHOT: Final = "snapshot"
ATTR_TURN_ON: Final = "turn_on"

DEFAULT_GRADIENT_MODE: Final = "interpolated_palette"
GRADIENT_SNAPSHOT_VERSION: Final = 1
HUE_API_V2: Final = 2
SERVICE_RESTORE_GRADIENT: Final = "restore_gradient"
SERVICE_SNAPSHOT_GRADIENT: Final = "snapshot_gradient"
SERVICE_SET_GRADIENT: Final = "set_gradient"
