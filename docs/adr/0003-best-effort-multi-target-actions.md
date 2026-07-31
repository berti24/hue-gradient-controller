# ADR 0003: Use best-effort multi-target actions

## Status

Accepted

## Context

A Home Assistant target can resolve to lights on different bridges with
different gradient capacities and modes. One incompatible light should not
block unrelated compatible lights, but silently changing the requested palette
would make automations unpredictable.

## Decision

Validate the entire payload and authorize all resolved entities before any
write. Then process targets independently and sequentially. Skip invalid,
unavailable, incompatible, or failed targets with one concise warning and
continue. Lights belonging to Hue bridges outside the configured selection are
also skipped. Never clamp colors or substitute a mode.

Do not expand light groups. Only individual native `HueLight` objects are
eligible.

## Consequences

Write actions are response-less and deterministic per target. Operators use
Home Assistant logs to diagnose skipped writes. The read-only snapshot action
returns captured entities and stable skip reasons because its response is the
input to exact restoration. A partially successful multi-target write is an
explicit supported outcome.
