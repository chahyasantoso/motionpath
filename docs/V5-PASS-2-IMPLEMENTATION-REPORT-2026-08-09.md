# MotionPath v5 pass-2 implementation report

**Date:** 2026-08-09, Asia/Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Scope:** scoped standalone-adapter migration after PR #142

## Current decision

PR #142 is frozen at the last green baseline. This branch deliberately isolates the next architectural slice: replacing module-global standalone observation ownership with caller-scoped adapters and dedicated regression tests.

## Migration completed here

`StandaloneObservationAdapter` now owns a private `TrackObservationOwner`. `ProjectRuntime` remains the lifecycle owner and injects one adapter across the Engine's standalone Tracks. Directly constructed Tracks can retain private adapters, while an observer adapter adopts an independently constructed source when an edge is created.

The adapter keeps private identity keys internally, but public compose contexts remain keyed by Track IDs. `COMPOSING` markers are translated into the adapter's private namespace before graph composition and translated back at the public boundary. This is what prevents mutual observation recursion without leaking private keys to consumers.

## Dedicated evidence

`StandaloneObservationAdapter.scoped.test.js` covers duplicate public IDs across scopes, cross-adapter mutual observation, and disposal isolation. These are intentionally separate from the PR #142 repair tests so a later ownership change cannot hide a compatibility regression behind the repair gate.

## Review guardrails

This branch must pass the full unit suite, typecheck, build, package dry run, format, boundary scan, and benchmarks before review. Do not merge it into `v5` merely because PR #142 is green. Keep publisher rendering, cross-motion, and free-track defaults off.

## Next slice after this branch

Invert GraphBinding ownership so ObservationState is the writer and graph authority. Migrate remaining Track observation readers, then delete duplicate Track observation maps in a separately reviewed change.
