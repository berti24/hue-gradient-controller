# ADR 0005: Ship an optional local Lovelace frontend

## Status

Accepted

## Context

Dashboard users need a compact native light card and an ordered gradient picker.
Ordinary lights must remain usable without the Python integration. Native Tile
and Bubble layouts evolve and cannot be faithfully replaced by copied markup.

## Decision

Ship a reproducible ES module in the integration's `www` directory, built from
`hue-gradient-light-card/src` with pinned npm dependencies. Users copy this file to their Home
Assistant `www` directory and register a dashboard resource. HACS continues to
install an **Integration**; it does not automatically register a Lovelace package.

The frontend implements `hue-gradient-light-card`, `hue-gradient-editor` and their
visual configuration editors. The dashboard card owns a real native Tile or
original Bubble button. Delegate sizing and layout to that renderer. Only the
owned Tile's surface/icon/brightness-track CSS and Bubble's documented custom styles are changed;
guard and document the Tile shadow-root compatibility access. No global patches,
more-info replacement, entities, bridge connections, credentials or polling.

State comes from `hass`. The integration's selected-light attributes are the
capability authority; contradictory group/platform metadata disables gradient
tools. Server-side selection and permission checks remain authoritative. Native
controls call light services; gradient edits use existing actions. White-tone
points are RGB palette colors, never independent Kelvin values. Exact snapshots
remain response payloads in component memory and are never reconstructed in RGB.

Per-entity shared serial lanes order writes across instances. Drags coalesce by
control channel, give immediate local feedback, and flush on release. Unconfirmed
optimistic state expires after the transition plus event delivery allowance.
Marker placement is separate from live RGB display values: unchanged authoritative
xy, confirmed preset coordinates in the editor that created the preview, and
small RGB rounding differences retain the picker location. Reported RGB swatches
still update; changed live palettes remain
authoritative. Connector paths share bounded cubic tangents through neighboring
markers, with distance-scaled handles kept within the wheel disc.
Disconnect discards pending writes and listeners; an already accepted service
request cannot be canceled. No background retries or persistence are added.

The optional per-card/editor `protect_when_off` setting defaults to false to
preserve edit-to-turn-on workflows. When enabled, off states and local power-off
intent lock edits, cancel active gestures and discard unsent writes, including
batches waiting in a shared entity lane. The send boundary rechecks power before
editing or restoring; explicit power controls remain available. Reported on
state unlocks controls. Protection does not alter integration service contracts.

Touch color editing requires a stationary 400 ms hold; movement before arming
belongs to native scrolling. Non-passive touch listeners prevent scrolling only
for an armed drag; pointer handlers keep mouse/pen edits immediate. Changing CSS
touch-action during a gesture cannot transfer browser ownership, so the wheel
permits native gestures from the start. A short tap on the selected X retains
deletion, while a swipe or stationary hold never deletes it. Disconnect and
off/unavailable transitions cancel hold timers as well as pending writes.

## Consequences

Native geometry and theme changes remain owned by the installed frontend and
Bubble versions. The Tile `ha-card`, `ha-tile-icon` and icon
`.container.background::before` shadow selectors must be checked against the
supported Home Assistant version. If Bubble is missing, retain the Bubble config
and render a usable Tile. Original Bubble hash navigation can host the independent
editor without browser_mod.

The optional Tile brightness row uses the native `light-brightness` feature and
bottom feature placement. Guard the owned `hui-card-features`, `hui-card-feature`,
`hui-light-brightness-card-feature` and `ha-control-slider` shadow roots; its
`.slider-track-background` and `.slider-track-bar` selectors provide gradient
styling only. Missing internals retain a usable native slider. Its scoped light
service callback routes brightness writes through the shared entity lane and
checks availability, capability and connection again before sending.

Optional subtitle values use the owned renderer's native state markup and scoped
presentation callbacks/attributes. These never mutate or publish native HA state
or create entities. The editor's explicit More info action emits HA's standard
`hass-more-info` event; it does not intercept or replace HA's entity panel.

Native Hue `color_mode` differentiates temperature from XY, but does not expose a
gradient-active flag. Observe native XY changes with unchanged historical xy
points and mode to suppress stale gradients during a session; changed gradient
points or mode restore the gradient appearance. Ignore derived RGB/HS changes
and native XY echoes matching the first gradient point within display rounding
tolerance. An ordinary whole-light command to exactly that first color is also
ambiguous without an upstream active-state flag.
An initial state with unchanged retained points is inherently ambiguous. A future
authoritative upstream active-state field can remove that ambiguity without
broadening the Python compatibility hook.
