# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0]: https://github.com/berti24/hue-gradient-controller/releases/tag/v1.0.0
