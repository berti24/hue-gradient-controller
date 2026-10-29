# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-10-22

### Added

- Add Witching Hour and Pumpkin Patch Halloween palettes, plus Candy Cane and
  Holiday Glow Christmas palettes.
- Four GTA VI themed built-in gradient palettes: Vice City, Leonida After Dark,
  Vice Pursuit, and South Beach.

### Changed

- Refresh built-in palette colors and give each one an individual, mood-matched
  brightness target. Applying a saved custom preset keeps the current brightness.
- Lower ambient preset brightness, warm the Sunset palette, and refine Leonida
  After Dark with teal, amber and red-orange at 25%. Normalize built-in swatches
  so dark RGB shading does not imply separate brightness for individual stops.

## [1.0.0] - 2026-10-11

### Fixed

- Validate HACS metadata against the triggering commit SHA, including the
  pull request head, instead of relying on branch-based raw file downloads.
- Add a regression check for the HACS commit selection.

### Features

- Native Hue gradient light support with live colors, modes, and point capacity.
- Hue v2 bridge selection and grouped light coverage summaries.
- `set_gradient` action with hex/RGB colors, visual color-picker rows,
  per-light modes, brightness, and transitions.
- Exact gradient snapshot and restore actions for xy colors, mode, power,
  and brightness.
- Twelve built-in gradient palettes and shared custom presets with an
  `apply_preset` action, personal favorites, and preset management.
- Hue Gradient Light Card with native Tile and Bubble designs.
- Hue Gradient Editor for popups, standalone dashboard cards, and embedding.
- Multi-point Colors and Whites palettes with draggable, ordered color stops.
- Power, brightness, gradient mode, and native color-temperature controls.
- Visual configuration, customizable subtitles, themed backgrounds, and
  optional inline or below-header Tile brightness sliders.
- Responsive layouts, touch and keyboard editing, and Protect while off.
- Redacted diagnostics, Home Assistant Repairs, and HACS installation support.

[1.1.0]: https://github.com/berti24/hue-gradient-controller/releases/tag/v1.1.0
[1.0.0]: https://github.com/berti24/hue-gradient-controller/releases/tag/v1.0.0
