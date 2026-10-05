# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.2] - 2026-10-05

### Added

- Add an optional second-row brightness slider to Tile-like dashboard cards.
  Its fill blends all current gradient colors, with a dimmed gradient on the
  remaining track. Native Tile controls handle keyboard, touch and layout;
  brightness writes share the popup's per-entity write lane.
- Use a patch release for this backward-compatible option at the user's request.

## [0.4.1] - 2026-10-05

### Added

- Add a Card background setting to the gradient editor, independently of
  Embedded mode. Enable it to show a themed card surface, border, shadow and
  padding on dashboards. Existing embedded editors remain transparent by default.

## [0.4.0] - 2026-10-05

### Added

- Show the bundled card version in both visual configuration editors.
- Add a native Tile subtitle picker with ordered fields; existing subtitle
  booleans remain supported for YAML configurations.
- Make dashboard light-color backgrounds optional and enabled by default;
  add an optional gradient background around light icons in cards and editors.

### Changed

- Add new color points opposite the last color's wheel hue, choosing the
  closest unused color when the opposite color is already in the palette.
- Color active light icons with the first reported light color, and retain
  the icon, circular background and light name in embedded editors.

### Fixed

- Restore the editor/popup icon background and remove the extra theme border
  and shadow around Bubble card buttons.

## [0.3.5] - 2026-10-05

### Fixed

- Keep reported gradient colors visible through derived display-color updates,
  including in Pixelated mode, instead of collapsing the card and editor to
  one color.
- Ignore derived RGB/HS-only changes when tracking gradient appearance, and
  restore the palette on gradient mode changes even when its points are unchanged.
- Cover four-color Pixelated updates, mode recovery and both palette views with
  model and desktop/mobile browser regressions.

## [0.3.4] - 2026-10-03

### Fixed

- Restore reported colors when an editor reconnects, so unconfirmed local edits
  cannot remain visible after their reconciliation timer is canceled.
- Preserve the latest Kelvin slider value through intermediate state echoes;
  reconcile to reported temperature after the allowance or a rejected command.
- Cover editor reconnection during and after writes, delayed temperature echoes,
  and temperature command rejection with browser regressions.

## [0.3.3] - 2026-10-03

### Changed

- Consolidate dashboard card sources, npm/Playwright configuration and its
  development guide under `hue-gradient-light-card/`; keep the card's Python
  metadata checks in `tests/hue_gradient_light_card/`.
- Keep the HACS-distributed frontend bundle in the integration package and run
  card CI from its standalone project directory.

## [0.3.2] - 2026-10-03

### Added

- Independent visual/YAML subtitle options for state, brightness, color count
  and gradient mode in both native card designs. State and brightness remain
  enabled by default; unsupported values are omitted.
- More info at the bottom of the popup menu opens Home Assistant's standard
  entity panel. Menu actions use separate rows, with power in the header.

### Fixed

- Reflect reported power changes immediately in both palette brightness controls,
  even during pending color feedback, and color the header light icon when on.
- Blur the popup behind its open action menu; outside clicks and Escape dismiss
  the menu while keeping the popup open.
- Connect visual configuration changes to the preview cards, including opacity.
  Verify opacity on the actual rendered background while controls stay opaque.

## [0.3.1] - 2026-10-03

### Fixed

- Load Home Assistant's original global styles and complete light/dark themes
  in the compatibility preview, restoring round native Tile icon backgrounds,
  visible input surfaces and unselected radio borders, and correctly styled,
  anchored native icon picker menus.
- Label the visual editor's Design choices "Tile like" and "Bubble like" while
  preserving the existing `tile` and `bubble` configuration values.
- Add browser regressions for native icon geometry, rendered input contrast,
  radio selection, icon picker anchoring and icon selection in both themes.

## [0.3.0] - 2026-10-03

### Added

- Optional Lovelace light card using native Home Assistant Tile and original
  Bubble Card renderers, with full visual configuration and theme support.
- Compact reusable gradient editor with ordered draggable points, Colors and
  multi-point Whites palettes, live brightness/mode controls, and exact
  snapshot/restore in its overflow menu. Ordinary lights use native services.
- Embedded editor and tested original Bubble hash-linked popup examples for
  current standalone and classic vertical-stack formats.
- Locally bundled frontend resource, reproducible build, installation guide,
  architecture decision, and native-renderer/browser regression checks.
- Explicit Python package discovery and resource inclusion so frontend sources
  and npm dependencies do not interfere with frozen development installs.

### Fixed

- Keep Whites drag coordinates continuous through neutral colors without
  re-spacing nearby markers on every frame. White-tone marker faces show the
  picker palette; off-palette stops retain an actual-color swatch until edited.
- Inset the gradient-mode arrow to match the text padding and use a rounded,
  theme-aware list with keyboard, touch, Escape and outside-click support.
- Serialize native power and gradient edits per entity, retain final coalesced
  brightness intent, reconcile rejected edits, and preserve gradient appearance
  across power cycles while suppressing observed stale native color state.

## [0.2.1] - 2026-10-02

### Fixed

- Update missing-bridge Repairs warnings when selected native Hue entries are
  removed, disabled, ignored, or change API version, without requiring a
  controller reload. Clear warnings when the selected bridges become eligible
  again and remove the change listener on unload.
- Add regression coverage for bridge changes, recovery, all-bridge selection,
  and listener cleanup.

## [0.2.0] - 2026-08-16

### Added

- Read-only, grouped coverage summaries in the Add and Configure flows showing
  native Hue lights that currently receive gradient attributes.
- Confirmation steps that inspect existing native Hue entities without creating
  or reassigning entities and devices.

## [0.1.3] - 2026-08-16

### Added

- A full-color Philips Hue Gradient Controller icon, shipped locally in normal
  and high-DPI sizes for Home Assistant's integration UI.

## [0.1.2] - 2026-07-31

### Added

- Lossless, versioned gradient snapshot and restore actions for exact Hue xy
  points, modes, power state, and bridge-level brightness.
- Repeatable RGB color-picker rows in Home Assistant's visual action editor,
  while preserving existing hex and RGB YAML payloads.
- Redacted config-entry diagnostics covering bridge selection and native Hue
  gradient capabilities.
- Home Assistant Repairs issues for native Hue incompatibility and unavailable
  explicitly selected Hue v2 bridges.

### Changed

- Documented the exact script-level snapshot workflow and its relationship to
  Home Assistant's built-in scene behavior.


## [0.1.1] - 2026-07-31

### Added

- Repository-wide agent guidance covering architecture, invariants, validation,
  and mandatory release practices.
- A versioned changelog and automated metadata consistency checks.

### Changed

- Synchronized package and Home Assistant integration metadata at version
  `0.1.1`, which is the version displayed by HACS.

## [0.1.0] - 2026-07-31

### Added

- Initial Home Assistant custom integration for live Hue gradient attributes.
- Gradient action with per-light modes, point limits, transitions, brightness,
  authorization, and best-effort multi-target handling.
- HACS metadata, config and options flows, translations, documentation,
  architecture decisions, tests, and validation workflows.

[0.3.3]: https://github.com/berti24/hue-gradient-controller/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/berti24/hue-gradient-controller/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/berti24/hue-gradient-controller/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/berti24/hue-gradient-controller/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/berti24/hue-gradient-controller/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/berti24/hue-gradient-controller/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/berti24/hue-gradient-controller/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/berti24/hue-gradient-controller/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/berti24/hue-gradient-controller/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/berti24/hue-gradient-controller/releases/tag/v0.1.0
