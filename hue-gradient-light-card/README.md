# Dashboard light card and gradient editor

The optional frontend controls any existing `light.*` entity. Hue gradients
require this integration, an available individual native Hue gradient light on
a selected bridge, valid capacity and supported modes, and the gradient actions.
Ordinary light power, brightness, RGB and temperature use native light services.

## Install and update

1. Install/update this repository through HACS as an **Integration**, or copy its
   `custom_components/hue_gradient_controller` directory manually.
2. Copy `custom_components/hue_gradient_controller/www/hue-gradient-light-card.js`
   from the installed integration to `/config/www/hue-gradient-light-card.js`.
   The copy also works independently for ordinary lights without loading the
   Python integration.
3. Enable Advanced mode in your profile. Open **Settings → Dashboards →
   three-dot menu → Resources → Add resource**. Enter
   `/local/hue-gradient-light-card.js?v=0.3.3` and choose **JavaScript module**.
   Use the installed release version when updating in the future.
4. Hard-refresh the browser/companion app frontend. Add a card and search for
   **Hue Gradient Light** or **Hue Gradient Editor**.
5. For the Bubble design, install **Bubble Card** through HACS and load its
   resource. Without Bubble the card renders a Tile; its editor explains the
   missing dependency and keeps the saved design.

On every update, repeat the file copy, update the resource URL's version query,
and refresh each client. HACS installs the shipped asset but does not copy it to
`www` or register the resource. Do not add this Integration repository a second
time as a HACS Dashboard repository. No CDN, browser_mod, or frontend runtime
npm dependencies are needed after building.

For YAML-managed dashboard resources:

```yaml
lovelace:
  resources:
    - url: /local/hue-gradient-light-card.js?v=0.3.3
      type: module
```

## Card configuration

Minimal configuration:

```yaml
type: custom:hue-gradient-light-card
entity: light.living_room_strip
```

All public card options are available in its visual editor:

| Field | YAML | Default |
| --- | --- | --- |
| Entity | `entity` | Required; any light entity |
| Design | `design` | `tile`; "Tile like" (`tile`) or "Bubble like" (`bubble`) |
| Name | `name` | Entity's displayed name |
| Icon | `icon` | Entity icon/native light fallback |
| Subtitle: state | `show_state` | `true` |
| Subtitle: brightness | `show_brightness` | `true` |
| Subtitle: color count | `show_color_count` | `false` |
| Subtitle: mode | `show_mode` | `false` |
| Light color background opacity | `color_background_opacity` | 70; number from 0 to 100 |

```yaml
type: custom:hue-gradient-light-card
entity: light.living_room_strip
design: bubble
name: Living room strip
icon: mdi:led-strip-variant
show_state: true
show_brightness: true
show_color_count: true
show_mode: true
color_background_opacity: 70
```

Empty Name and Icon overrides are omitted from saved configuration. Config edits
emit `config-changed` and never send light commands. Home Assistant's standard
Sections Layout tab controls `grid_options`; it is passed through to the native
renderer. The card delegates masonry size and Sections grid rules. Tile and
Bubble use their original distinct footprints, padding, icon geometry and fonts.
The icon toggles power; the main card opens the compact editor.

The subtitle uses the selected fields in that order. Disabling all four hides
the line. Brightness is zero while off and omitted for lights without brightness
support. Color count follows the currently reported color/gradient appearance;
mode appears only for an eligible active multi-point gradient. Presentation
values are scoped to the owned native renderer and never published to HA state.

The light's color layer covers the native card surface. Opacity 0 retains the
normal theme surface, 70 composites the light colors over it, and 100 shows full
colors. It never fades controls or the card itself. Off uses the theme surface;
unavailable/missing lights disable commands. No usable color data uses the native
light state-color theme fallback. RGB/hex gradient attributes are gamut-aware
display values; exact `gradient_colors_xy` is the reported gradient authority.

Native temperature state takes precedence over retained historical gradient
attributes. During a session, a native color change with unchanged xy stops
switches to a solid background; new gradient stops switch back. Hue/HA expose no
unambiguous active-gradient flag for a fresh frontend session with stale unchanged
stops. That initial ambiguity cannot be resolved from the supplied state alone.

## Compact popup controls

- The header uses Name/Icon; the icon controls power and shows the light's color
  while on. Brightness follows power changes immediately in both palette views.
  Escape, close or backdrop
  closes the card-owned modal. Opening or changing palette views never writes.
- The overflow menu gives transition, Snapshot and Restore their own rows, with
  More info last. More info opens HA's standard entity panel and closes the custom
  popup. While the menu is open, the rest of the editor is slightly blurred;
  clicking elsewhere on the editor or pressing Escape closes only the menu.
- Drag points on the filled hue/saturation wheel. Select an ordinal marker;
  activate the selected X to remove it. Dragging the X never removes the point.
  The final point has no X. Arrow keys move a focused point; Delete removes it;
  Enter/Space select or remove. The curves indicate point-list order only.
  Coincident marker targets initially separate slightly so each is reachable.
  During dragging, the selected marker follows the pointer continuously and
  neighboring markers keep their positions, including around neutral white.
- Add color appends a copy of the selected point. Capacity is reported by the
  light; Add disables at that maximum. Remaining points renumber immediately.
- Whites edits the **same** gradient list on a warm/neutral/cool RGB palette.
  It has no Kelvin claims. Off-palette points retain their actual color, have a
  white-tone marker face, a small actual-color swatch, a dashed border and an
  accessible description. Switching views does not convert them. Intentional
  dragging changes the selected point to the displayed palette and removes the
  off-palette swatch.
- Brightness applies immediately. Zero invokes `light.turn_off`; it is never
  sent to `set_gradient`. Intentional color/brightness edits turn the light on.
- The visually unlabeled dropdown has the accessible name **Gradient mode**.
  Its choices are only reported supported modes: Blended, Mirrored, Pixelated,
  Segments. It is disabled with one point. No unsupported mode is substituted.
  Its arrow shares the text's horizontal inset. The rounded list supports arrow
  keys, Home/End, letter navigation and Enter/Space; Escape closes only the list.
  The list also dismisses on outside taps and viewport/host scrolling.
- Overflow contains power, gradient transition (seconds), exact Snapshot and
  Restore. Snapshot requires a reported palette of at least two xy points.
  Restore appears only after a valid version-1 snapshot for that entity is
  captured. Snapshots are held only while that editor instance remains alive.

Ordinary color lights have one point and a white-tone RGB palette. Native
temperature lights have a Kelvin control bounded by their reported range.
Dimmable/on-off lights expose only supported controls. A gradient light always
uses RGB gradient stops for Whites; it does not use whole-light Kelvin commands.

Drag writes coalesce at approximately 120 ms and serialize per entity across
card instances. Release flushes the final value. Errors show an accessible
message and restore reported state. While editing, intermediate echoes do not
move the markers. Local feedback reconciles to latest `hass` state after an event
delivery allowance (or transition plus allowance). Backend best-effort skips
cannot be identified from response-less writes; the reported state remains the
authority. Disconnect cancels unsent work, not service calls already accepted.

## Embed inside an original Bubble popup

The editor has its own visual editor with Entity, Name, Icon and Embedded. The
`embedded` boolean (default false) removes duplicate title/close controls and
inherits the host surface. Its compact overflow remains available.

Bubble **v3.2.0+** supports standalone `cards:` content. This installation has
Bubble v3.4.1; the compatibility fixture uses the published original asset.
Place both cards in the same view:

```yaml
type: custom:bubble-card
card_type: button
button_type: switch
entity: light.living_room_strip
button_action:
  tap_action:
    action: navigate
    navigation_path: '#living-room-gradient'
```

```yaml
type: custom:bubble-card
card_type: pop-up
hash: '#living-room-gradient'
entity: light.living_room_strip
name: Living room strip
cards:
  - type: custom:hue-gradient-editor
    entity: light.living_room_strip
    embedded: true
```

For **Bubble v2.3.4**, use the original vertical-stack popup format (not `cards:`):

```yaml
type: vertical-stack
cards:
  - type: custom:bubble-card
    card_type: pop-up
    hash: '#living-room-gradient'
    entity: light.living_room_strip
    name: Living room strip
  - type: custom:hue-gradient-editor
    entity: light.living_room_strip
    embedded: true
```

Use the same navigation button above. These routes use Bubble's documented
hash navigation, without intercepting global more-info or needing browser_mod.

## Theme overrides

Native Tile/Bubble radii, dimensions and type styles remain native. The editor
inherits HA/Bubble theme values dynamically. Editor properties can be overridden
in HA themes (omit the leading `--` in theme YAML):

| CSS custom property | Default/fallback |
| --- | --- |
| `--hgc-surface` | HA card background |
| `--hgc-control-surface`, `--hgc-icon-surface` | HA secondary background |
| `--hgc-text-color`, `--hgc-secondary-text-color` | HA primary/secondary text |
| `--hgc-border-color`, `--hgc-border-width` | HA divider, 1px |
| `--hgc-control-border-width` | 1px |
| `--hgc-shadow` | HA card shadow |
| `--hgc-popup-radius` | Bubble popup radius → HA card radius → 28px |
| `--hgc-control-radius` | Bubble button radius → Bubble radius → HA large radius → 24px |
| `--hgc-popup-width`, `--hgc-wheel-size` | 352px, 300px |
| `--hgc-padding`, `--hgc-spacing` | 16px |
| `--hgc-embedded-padding`, `--hgc-embedded-tools-margin` | 0px, 4px |
| `--hgc-font-family`, `--hgc-font-size`, `--hgc-line-height` | HA font, 14px, 1.4 |
| `--hgc-title-size`, `--hgc-title-weight`, `--hgc-count-font-size` | HA large font, 500, 13px |
| `--hgc-icon-size`, `--hgc-header-icon-size`, `--hgc-icon-padding` | 24px, 40px, 6px |
| `--hgc-control-height`, `--hgc-touch-target` | 44px |
| `--hgc-point-size`, `--hgc-point-font-size`, `--hgc-point-icon-size` | 32px, 14px, 19px |
| `--hgc-point-border-color`, `--hgc-point-border-width`, `--hgc-point-shadow` | White, 2px, spectrum contrast shadow |
| `--hgc-selected-color`, `--hgc-selected-width`, `--hgc-selected-offset` | HA primary, 2px, 2px |
| `--hgc-point-dark-text`, `--hgc-point-light-text` | Spectrum contrast dark/light |
| `--hgc-point-swatch-size`, `--hgc-point-swatch-offset`, `--hgc-point-swatch-border-width` | 11px, -3px, 1px |
| `--hgc-connector-color`, `--hgc-connector-shadow` | Spectrum contrast white/dark |
| `--hgc-connector-width`, `--hgc-connector-shadow-width` | .75px, 1.7px in a 100-unit disc |
| `--hgc-slider-accent`, `--hgc-slider-padding`, `--hgc-output-width` | HA primary, 8px 12px, 42px |
| `--hgc-slider-fill`, `--hgc-slider-thumb`, `--hgc-slider-track` | HA primary text, primary text, divider |
| `--hgc-slider-track-height`, `--hgc-slider-thumb-size`, `--hgc-slider-thumb-shadow` | 8px, 20px, subtle thumb shadow |
| `--hgc-button-gap`, `--hgc-row-gap`, `--hgc-button-padding` | 8px, 8px, 8px 14px |
| `--hgc-select-padding`, `--hgc-wheel-margin` | 8px 16px, 8px auto 20px |
| `--hgc-mode-menu-radius`, `--hgc-mode-option-radius` | Control radius |
| `--hgc-mode-menu-gap`, `--hgc-mode-menu-viewport-padding`, `--hgc-mode-menu-padding` | 8px, 8px, 6px |
| `--hgc-mode-menu-max-height`, `--hgc-mode-menu-shadow` | 240px, HA card shadow or subtle raised shadow |
| `--hgc-mode-option-active` | HA card background |
| `--hgc-focus-color`, `--hgc-focus-width`, `--hgc-focus-offset` | HA primary, 3px, 3px |
| `--hgc-disabled-opacity`, `--hgc-error-color` | .45, HA error |
| `--hgc-handle-width`, `--hgc-handle-height`, `--hgc-handle-opacity` | 40px, 4px, .4 |
| `--hgc-menu-gap`, `--hgc-menu-padding`, `--hgc-menu-summary-padding` | 8px, 8px, 4px |
| `--hgc-menu-top` | 70px |
| `--hgc-transition-width`, `--hgc-input-radius`, `--hgc-input-padding` | 80px, 8px, 6px |
| `--hgc-status-margin`, `--hgc-embedded-tools-margin` | 8px 0, 4px |
| `--hgc-backdrop-color` | Translucent dark modal backdrop |
| `--hgc-card-dark-text`, `--hgc-card-light-text` | Contrasting dashboard light-color text |
| `--hgc-card-text-shadow` | Subtle contrast shadow over reported color data |

Actual light colors and picker spectra are data. Point borders/connectors use
dual light/dark contrast for the spectrum, not hard-coded popup surfaces.

## Development and compatibility checks

```bash
cd hue-gradient-light-card
npm ci
npm run build
npm run check
npm test
# Prepare the official renderer fixtures (see scripts/prepare-compat.mjs).
npm run test:prepare
npx playwright install chromium
npm run test:browser
```

The distributable bundles Lit locally, carries its license comments, and is
committed under the integration directory. Rebuild after source/version changes.
The browser fixture uses the frontend matching pinned HA 2026.7.2
(`home-assistant-frontend==20260624.5`) and original Bubble v3.4.1/v2.3.4.
State, service responses, HA context/dialog providers and the classic stack host
contract are simulated. Tile and Bubble renderer modules are the original
published assets. The classic popup test reproduces the native stack shadow
`#root` used by Bubble v2.3.4; it is not a running full HA dashboard. Server
authorization and selected bridge behavior are covered by the Python tests.
Neither test suite claims physical-light validation.

Sources consulted for compatibility:
[custom card API](https://developers.home-assistant.io/docs/frontend/custom-ui/custom-card/),
[Tile options](https://www.home-assistant.io/dashboards/tile/),
[native frontend source](https://github.com/home-assistant/frontend),
[Bubble popup formats and styling](https://github.com/Clooos/Bubble-Card#pop-up).
