# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.2]: https://github.com/berti24/hue-gradient-controller/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/berti24/hue-gradient-controller/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/berti24/hue-gradient-controller/releases/tag/v0.1.0
