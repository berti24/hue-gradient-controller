# ADR 0001: Reuse the native Hue runtime

## Status

Accepted

## Context

Gradient data exists on Hue API v2 light resources, but Home Assistant's native
Hue light entity does not expose or write that feature. Opening another bridge
connection would duplicate credentials, event streams, retry behavior, and
ownership.

## Decision

Depend on Home Assistant's built-in `hue` integration and reuse its loaded
`HueBridge`, `HueLight`, aiohue controller, and resource objects. Gradient
writes go through `HueBridge.async_request_call` and the existing light
controller.

Expose live gradient state through a guarded replacement of only
`HueLight.extra_state_attributes`. Preserve the original property, refuse setup
when its expected shape is absent, and restore it when the integration unloads.

## Consequences

There are no copied application keys, extra network sessions, or polling jobs.
The integration intentionally targets Home Assistant 2026.7+ and its tested
native Hue implementation. A future native Hue refactor can require a small
compatibility update.
