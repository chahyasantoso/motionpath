# PR-22: explicit FK input and observation contract

**Scope:** close the graph-mode contract gap before further observation ownership work.  
**Branch:** `v5-pr-22b-fk-runtime-mode`  
**Base:** `v5` after PR #113

## Rule

Tracks inside project motions are `authored-graph` by default. A track may use plugin defaults only when it explicitly declares `mode: "standalone"`. Missing mode is no longer a silent fallback.

For authored graph tracks, plugin-declared required inputs must have exactly one compatible input observation. The validator emits stable diagnostics for missing, duplicate, unknown, and role-mismatched inputs. `fkPlugin` requires `parentWorld` in graph mode and retains its identity-world fallback only for explicit standalone tracks.

## Runtime closure

PR-22b carries the mode onto the live `Track` instance through `createTrack` and keeps qualified authored IDs such as `motion/bone` in authored-graph mode. This is a runtime contract, not just a validator label. Explicit standalone remains available for `~/free` tracks and local/direct tracks.

## Gate

Validator coverage and runtime propagation must stay green, including qualified-source fixtures. No observation extraction or cross-motion behavior changes in this PR.
