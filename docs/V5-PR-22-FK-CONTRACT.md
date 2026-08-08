# PR-22: explicit FK input and observation contract

**Scope:** close the graph-mode contract gap before further observation ownership work.  
**Branch:** `v5-pr-22-fk-contract`  
**Base:** `v5` after PR #112

## Rule

Tracks inside project motions are `authored-graph` by default. A track may use plugin defaults only when it explicitly declares `mode: "standalone"`. Missing mode is no longer a silent fallback.

For authored graph tracks, plugin-declared required inputs must have exactly one compatible input observation. The validator emits stable diagnostics for missing, duplicate, unknown, and role-mismatched inputs. `fkPlugin` requires `parentWorld` in graph mode and retains its identity-world fallback only for explicit standalone tracks.

## Why now

The previous validator already had most of the rule, but defaulted every missing mode to standalone. That meant an authored FK track with a missed `#wireObservations` call could validate and compose against the identity world, producing a plausible but wrong rig. That's the kind of bug that survives demos and poisons every later graph gate.

## Gate

Before merge, add runtime propagation of `Track.mode` and prove validator, normalizer, direct-track fallback, authored FK chains, missing input, wrong target, duplicate edge, role mismatch, and qualified-source fixtures. No observation extraction or cross-motion behavior changes in this PR.
