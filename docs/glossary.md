# Glossary

**Gradient point**  
One ordered color in a Hue gradient write. Hue requires at least two points for
a gradient PUT.

**Gradient zone**  
A user-facing name for a controllable portion of a gradient light. The Hue API
models writes as gradient points, so this project uses `points_capable` as the
authoritative limit rather than assuming a fixed zone count.

**Mode**  
The Hue algorithm that distributes ordered points across a gradient light,
such as `interpolated_palette` or `segmented_palette`.

**Native Hue integration**  
Home Assistant's built-in `hue` integration. It owns bridge authentication,
connections, event streaming, devices, and light entities.

**Compatibility hook**  
The narrow, reversible extension of native Hue light state attributes used by
this integration. It does not replace Hue setup or networking.

**Exact gradient snapshot**  
A versioned action response containing live Hue xy points, gradient mode, power
state, and bridge-level brightness. It is restorable without converting colors
through RGB.

**Response-less write action**  
A Home Assistant write action that completes without returning service response
data. Per-target failures are recorded in logs. The read-only snapshot action
returns the data needed by the restore action.
