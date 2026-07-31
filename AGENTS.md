# Agent guide

This file applies to the entire repository. It is the primary operating guide
for coding agents working on Philips Hue Gradient Controller.

## What this integration does

Philips Hue Gradient Controller is a Home Assistant custom integration for Hue
API v2 gradient lights. It extends compatible light entities created by Home
Assistant's native `hue` integration and registers the
`hue_gradient_controller.set_gradient` action.

The integration deliberately does not create shadow entities or devices, copy
Hue application keys, open another bridge connection, or poll. It reuses the
native Hue bridge, aiohue controllers and resources, and `HueLight` entities.
The architecture decisions in `docs/adr/` are binding unless a change updates
or supersedes the relevant ADR.

## Runtime architecture and invariants

- `custom_components/hue_gradient_controller/__init__.py` installs and removes
  the compatibility hook, stores the active bridge selection, registers the
  action, and refreshes existing native Hue light states.
- `compat.py` narrowly wraps `HueLight.extra_state_attributes`. It must always
  preserve the native attributes and restore the exact original property on
  unload. Do not broaden this into a general monkey patch.
- `selection.py` maps configured Hue bridge entry IDs to eligible native Hue
  lights. Existing config entries with no saved selection mean all bridges.
- `config_flow.py` provides one single-instance config entry, initial bridge
  selection, and a reload-on-change options flow. Disabled, ignored, and Hue v1
  entries are not selectable.
- `service.py` validates complete write payloads and permissions before the
  first bridge write, then processes targets sequentially and best-effort. It only
  controls selected, available, individual native `HueLight` entities with a
  gradient feature. Never expand light groups, clamp colors, substitute modes,
  or open a separate bridge connection.
- Gradient state is live bridge state. aiohue mutates the native light resource
  from Hue event-stream updates, and the wrapped state property reads that same
  resource. `gradient_colors_xy` is authoritative; RGB and hex are display
  conversions using the reported gamut.
- The service must propagate the Home Assistant service context to the entity
  before writing so resulting state changes retain correct attribution.
- Authorization across every resolved target must complete before any partial
  success is possible.

## User-visible contract

Selected, gradient-capable native Hue lights gain these attributes:

- `gradient_capable`
- `gradient_colors`
- `gradient_colors_rgb`
- `gradient_colors_xy`
- `gradient_mode`
- `gradient_modes`
- `gradient_points_capable`
- `gradient_pixel_count` when Hue reports it

The `set_gradient` action accepts strict `#RRGGBB` strings, integer RGB triples,
or the visual editor's repeatable RGB color rows. Multiple colors use Hue's
gradient field; one color uses the normal Hue color field. Supported modes and
point capacity come from each light resource. `snapshot_gradient` and
`restore_gradient` round-trip exact xy points, mode, power, and bridge-level
brightness in a versioned payload.

Home Assistant's built-in scene snapshot/restore does not replay these custom
attributes; scripts can use the integration's exact snapshot and restore
actions. Hue Entertainment frames are not exposed as per-frame state.

## Repository map

- `custom_components/hue_gradient_controller/`: shipped HACS integration
- `tests/`: Home Assistant and aiohue behavior tests
- `docs/adr/`: accepted architectural decisions
- `docs/glossary.md`: project terminology
- `README.md`: installation, attributes, action use, and development commands
- `CHANGELOG.md`: mandatory versioned release history
- `hacs.json`: HACS repository metadata
- `pyproject.toml`: package version, Python requirement, and development tools
- `uv.lock`: reproducible development dependency lock
- `.github/workflows/`: tests, Ruff, hassfest, and HACS validation

## Mandatory versioning and changelog rules

This repository uses Semantic Versioning in `MAJOR.MINOR.PATCH` form.

Every repository change, including documentation, tests, CI, and agent-guide
changes, must do all of the following before handoff:

1. Increase the version by at least one patch from the version present when the
   task started. Never reuse or decrease a version.
2. Keep the version identical in:
   - `custom_components/hue_gradient_controller/manifest.json` — this is the
     version HACS displays.
   - `pyproject.toml`.
   - the local project package entry in `uv.lock`.
3. Add a dated, versioned entry to `CHANGELOG.md` describing the user-visible
   and important internal changes. Do not leave completed work only under
   `Unreleased`.
4. Run the metadata tests, which enforce valid SemVer, synchronized version
   surfaces, and a matching changelog heading.

Choose the increment as follows:

- PATCH: backward-compatible bug fixes, documentation, tests, CI, dependency
  maintenance, refactors, and other changes that do not add or break a
  user-visible contract.
- MINOR: backward-compatible user-facing functionality such as a new action,
  field, attribute, option, or supported workflow.
- MAJOR: a breaking change to actions, configuration, attributes, behavior,
  compatibility, or another documented user-facing contract.

A clearly patch-only change may increment PATCH without asking. If a task may
require MINOR or MAJOR, do not silently choose: use the `request_user_input`
tool to ask the user whether the release should be minor or major, explaining
the recommended level. If that tool is unavailable, ask the user directly and
wait before finalizing the version. Do not label a breaking change as a patch
to avoid the question.

## Change discipline

- Preserve user changes and keep the scope narrow.
- Keep Home Assistant and aiohue access asynchronous and on the event loop.
- Prefer their public APIs. Any compatibility access to internals must remain
  narrow, guarded, documented, reversible, and tested against the pinned
  versions.
- Keep configuration backward compatible or provide an explicit migration.
- Update `services.yaml`, translations, README examples, tests, and ADRs when a
  changed contract affects them.
- Do not store credentials, bridge hosts, application keys, or copied native
  Hue runtime objects in this integration's config entry.
- Use Home Assistant's color conversion helpers and the light's reported gamut.
- Keep warnings concise and target-specific; best-effort calls must continue
  after per-target incompatibility or Hue rejection.

## Required validation

Run all of these after a change:

```bash
.venv/bin/pytest
.venv/bin/ruff check custom_components tests
git diff --check
```

When dependencies or package metadata change, run `uv lock` and ensure
`uv sync --frozen` remains viable. Changes to Home Assistant metadata or flow
translations should also pass hassfest; HACS packaging changes should pass the
HACS validation workflow.

Before handoff, confirm that tests cover the changed success path, relevant
failure or compatibility path, bridge-selection behavior where applicable,
version synchronization, and unload/restoration behavior where lifecycle code
changed.
