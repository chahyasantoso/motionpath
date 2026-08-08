# Supplemental follow-up: explicit FK input and observation contract

**Status:** merged follow-up, not part of the accepted PR-00 through PR-21 sequence  
**Canonical index:** [`V5-README.md`](./V5-README.md)  
**Current status:** [`V5-STATUS.md`](./V5-STATUS.md)

## Result

Tracks inside project motions are `authored-graph` by default. A track may use plugin defaults only when it explicitly declares `mode: "standalone"`. Missing mode is not a silent standalone fallback.

For authored-graph tracks, plugin-declared required inputs must have exactly one compatible input observation. Stable diagnostics cover missing, duplicate, unknown, and role-mismatched inputs. `fkPlugin` requires `parentWorld` in graph mode and keeps its identity-world fallback only for explicit standalone tracks.

PR-22b carries the mode onto live `Track` instances through `createTrack` and preserves qualified authored IDs such as `motion/bone` in authored-graph mode. Explicit standalone remains available for `~/free` tracks and local/direct tracks.

## Boundary

This closes the graph-mode contract gap. It does not complete ObservationGraph extraction, move all live mutation out of `Track`, or enable new cross-motion behavior. Those are separate concerns and require explicit evidence or a plan revision.