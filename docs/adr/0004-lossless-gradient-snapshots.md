# ADR 0004: Use versioned exact gradient snapshots

## Status

Accepted

## Context

The displayed RGB and hex gradient attributes are conversions from Hue's live
CIE xy points. Passing those display values back through RGB conversion cannot
guarantee an exact round trip. Home Assistant's built-in scene snapshot path
does not replay custom state attributes, and broadly patching that path would
violate the integration's narrow compatibility boundary.

## Decision

Provide a read-only `snapshot_gradient` action that returns a versioned mapping
of entity IDs to exact xy points, gradient mode, power state, and bridge-level
brightness. Provide a `restore_gradient` action that accepts the complete
snapshot response, validates it and all permissions before the first write,
and restores each eligible native Hue light sequentially and best effort.

Snapshot only reports available, selected, gradient-capable individual native
Hue lights with at least two current points. Restore never converts xy through
RGB, clamps values, substitutes modes, expands groups, or redirects a snapshot
to another entity. The payload version starts at `1` so future incompatible
snapshot shapes can be rejected explicitly.

## Consequences

Scripts can temporarily change gradients and later restore exact bridge state
without shadow entities, stored credentials, or changes to Home Assistant's
scene engine. Snapshot responses contain entity IDs and should be treated as
short-lived automation data rather than persistent integration storage.
