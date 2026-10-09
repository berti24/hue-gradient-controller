# ADR 0006: Persist shared portable recipes and personal preferences

## Status

Accepted.

## Decision

Store shared custom gradient recipes and user-scoped favorites/expansion settings
with Home Assistant's versioned asynchronous Store. This supersedes ADR 0005's
no-persistence statement only for preset library data and personal preferences.
Exact snapshot responses remain short-lived and entity-bound under ADR 0004.

Custom recipes capture authoritative native Hue xy points and mode, plus
gamut-derived RGB previews. They do not store snapshot power/brightness, bridge
runtime objects, source entities, credentials, or connections. A separate
`apply_preset` action permits cross-light reuse without changing snapshot restore.
Built-ins use an authoritative packaged RGB catalogue and normal gamut conversion;
custom xy values are written unchanged. Neither capacity nor mode is substituted.

Authenticated WebSocket commands publish the shared catalogue and only the calling
user's preferences. Creators and administrators can mutate custom recipes;
built-ins are immutable. Writes are serialized, persisted before acknowledgment,
and protected against stale edits with revisions. Push subscriptions avoid polling
and resolve the active library across integration reloads.

The pinned Home Assistant Store logs some disk-write failures without propagating
them. A local Store subclass narrowly observes `_async_write_data` completion so
the library cannot acknowledge a failed save. It uses native atomic/private
writes, does not patch Home Assistant globally, and has a real WriteError
regression test. Recheck this protected seam when updating Home Assistant.

The apply action validates its recipe and all target permissions before any write,
then uses selected native Hue entities sequentially and best effort. It preserves
brightness and service context and optionally returns applied/skipped targets.
Frontend writes share existing entity lanes and respect off protection.

Confirmed applied preset identity is shared per connection, user, and light in
frontend session memory so disposing a popup does not lose it. Identity is only a
hint: current gradient appearance, xy points (with display-rounding tolerance),
and mode must agree before highlighting. Manual color edits clear the hint;
deleted presets are excluded from ordering. Favorites precede other presets;
selection never changes catalogue/favorite ordering or carousel scroll position.
This adds no stored entity state or backend polling.

## Consequences

Library data persists across integration reloads and remains separate from config
entry bridge selection. Different hardware may render identical xy coordinates
differently. Damaged storage is reported and never silently overwritten. Pending
frontend edits must settle before saving; RGB previews are never exact command data
for a saved xy recipe. Library management does not change light state.
