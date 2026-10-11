# ADR 0002: Do not create shadow entities

## Status

Accepted

## Context

Separate gradient sensors or helper lights would duplicate the identity of a
physical Hue light and make scripts, dashboards, device pages, and availability
harder to reason about.

## Decision

Create no entity or device platforms. Add gradient state attributes to the
existing native Hue light entities on user-selected bridges and provide narrow
actions for gradient writes and exact state capture.

## Consequences

Users keep one entity per physical light. Gradient state can be read in
templates and dashboards, and scripts can set, snapshot, and restore it. Home
Assistant's built-in scene snapshot/restore does not replay the custom
attributes; the integration provides narrow script actions instead of creating
shadow entities as a workaround.
